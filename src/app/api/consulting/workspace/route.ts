import { z } from "zod";
import { asStakeholder } from "@/consulting/server/database";
import { workspaceDraft, workspaceIdentity, workspaceStatuses } from "@/consulting/server/workspace";
import { boundedJson, isClientMutation, json } from "@/consulting/server/request-boundary";

const publish = z.strictObject({
  action: z.literal("publish"), engagementId: z.uuid(), itemId: z.uuid(),
  version: z.number().int().min(1).max(10_000), prior: z.number().int().min(0).max(10_000), retry: z.uuid(),
});
const progress = z.strictObject({
  action: z.literal("progress"), engagementId: z.uuid(), expected: z.number().int().min(0),
  status: z.enum(workspaceStatuses), nextAction: z.string().trim().max(500),
});
const agreement = z.strictObject({
  action: z.literal("agreement"), engagementId: z.uuid(), itemId: z.uuid(),
  version: z.number().int().min(1).max(10_000), authorityId: z.uuid(),
  acceptedAt: z.iso.datetime(), evidence: z.string().trim().min(5).max(1000),
  parent: z.strictObject({ itemId: z.uuid(), version: z.number().int().min(1).max(10_000) }).nullable(),
});

export async function POST(request: Request) {
  if (!isClientMutation(request)) return json({ error: "Not found" }, 404);
  try {
    const actor = await workspaceIdentity();
    if (!actor) return json({ error: "Not found" }, 404);
    const body = await boundedJson(request, 28_000).catch(() => null);
    const command = z.union([publish, agreement, progress, workspaceDraft]).safeParse(body);
    if (!command.success) return json({ error: "Invalid document or revision" }, 400);
    const input = command.data;
    const result = await asStakeholder(actor.id, async (tx) => {
      if (!("action" in input)) {
        const [row] = await tx<{ version: number }[]>`select velcrafting_private.save_workspace_draft(
          ${input.engagementId},${input.itemId},${input.expected},${input.stage},${input.title},
          ${tx.json({ sections: input.sections })},${input.terms ? tx.json({ text: input.terms }) : null}) as version`;
        return row.version;
      }
      if (input.action === "publish") {
        const [row] = await tx<{ version: number }[]>`select velcrafting_private.publish_workspace_draft(
          ${input.engagementId},${input.itemId},${input.version},${input.prior},${input.retry}) as version`;
        return row.version;
      }
      if (input.action === "progress") {
        const [row] = await tx<{ version: number }[]>`select velcrafting_private.update_workspace_progress(
          ${input.engagementId},${input.expected},${input.status},${input.nextAction}) as version`;
        return row.version;
      }
      const [row] = await tx<{ recorded: boolean }[]>`select velcrafting_private.record_workspace_agreement(
        ${input.engagementId},${input.itemId},${input.version},${input.authorityId},${input.acceptedAt},
        ${input.evidence},${input.parent?.itemId ?? null},${input.parent?.version ?? null}) as recorded`;
      return row.recorded ? input.version : -2;
    });
    if (result === -1) return json({ error: "Not found" }, 404);
    if (result === -2) return json({ error: "The revision or authority changed. Reload before trying again." }, 409);
    return json({ version: result });
  } catch { return json({ error: "Workspace changes are unavailable" }, 503); }
}
