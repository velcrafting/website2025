import { boundedJson, isClientMutation, json } from "@/consulting/server/request-boundary";
import { workspaceIdentity } from "@/consulting/server/workspace";
import { executeWorkspaceProvision, provisionCommand } from "@/consulting/server/workspace-provision";

export async function POST(request: Request) {
  if (!isClientMutation(request)) return json({ error: "Not found" }, 404);
  try {
    const actor = await workspaceIdentity();
    if (!actor) return json({ error: "Not found" }, 404);
    const parsed = provisionCommand.safeParse(await boundedJson(request, 12_000).catch(() => null));
    if (!parsed.success) return json({ error: "Check the setup fields and try again." }, 400);
    const result = await executeWorkspaceProvision(actor.id, parsed.data);
    switch (result.disposition) {
      case "created": return json(result, 201);
      case "duplicate":
      case "changed":
      case "unchanged": return json(result);
      case "conflict": return json({ error: "This setup request was already used with different details." }, 409);
      case "membership_required": return json({ error: "Approve this person's client membership before granting engagement access." }, 409);
      case "invalid": return json({ error: "Check the setup fields and try again." }, 400);
      default: return json({ error: "Not found" }, 404);
    }
  } catch { return json({ error: "Workspace setup is unavailable." }, 503); }
}
