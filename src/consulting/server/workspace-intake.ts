import { z } from "zod";
import { asStakeholder } from "./database";
import { isUuid } from "./request-boundary";

const intakeFields = z.enum(["outcome", "constraints", "questions"]);
export const workspaceIntakeCommand = z.strictObject({
  engagementId: z.uuid(),
  intentId: z.uuid(),
  confirmationVersion: z.number().int().positive().max(2147483647),
  bookingUid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  briefId: z.uuid(),
  briefVersion: z.number().int().positive().max(2147483647),
  briefSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fields: z.array(intakeFields).min(1).max(3).refine((fields) => new Set(fields).size === fields.length),
  retry: z.uuid(),
});

type Candidate = { intent_id: string; booking_uid: string; starts_at: Date; time_zone: string; brief_version: number };
export type IntakeReview = Candidate & {
  confirmation_version: number;
  brief_id: string;
  brief_sha256: string;
  fields: { key: z.infer<typeof intakeFields>; label: string; text: string }[];
};

export async function workspaceIntakeOptions(actor: string) {
  return asStakeholder(actor, async (tx) => {
    const [gate] = await tx<{ allowed: boolean }[]>`
      select velcrafting_private.can_workspace_provision() as allowed`;
    if (!gate.allowed) return null;
    const candidates = await tx<Candidate[]>`select * from velcrafting_private.list_workspace_intake()`;
    const engagements = await tx<{ id: string; title: string; client: string }[]>`
      select e.id,e.title,c.name as client
      from velcrafting_private.staff_access a join velcrafting_private.engagement e on e.id=a.engagement_id
      join velcrafting_private.client c on c.id=e.client_id
      where a.capability='draft' order by c.name,e.title`;
    return { candidates, engagements };
  });
}

export async function workspaceIntakeReview(actor: string, engagementId: string, intentId: string) {
  if (!isUuid(engagementId) || !isUuid(intentId)) return null;
  return asStakeholder(actor, async (tx) => {
    const [review] = await tx<IntakeReview[]>`select * from velcrafting_private.review_workspace_intake(${engagementId},${intentId})`;
    return review ?? null;
  });
}

export async function executeWorkspaceIntake(actor: string, command: z.infer<typeof workspaceIntakeCommand>) {
  return asStakeholder(actor, async (tx) => {
    const [result] = await tx<{ item_id: string | null; disposition: string }[]>`
      select * from velcrafting_private.convert_workspace_intake(
        ${command.engagementId},${command.intentId},${command.confirmationVersion},${command.bookingUid},${command.briefId},
        ${command.briefVersion},${command.briefSha256},${command.fields}::text[],${command.retry})`;
    return { itemId: result.item_id, disposition: result.disposition };
  });
}
