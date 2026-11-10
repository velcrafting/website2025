import { z } from "zod";
import { asStakeholder } from "./database";

export const workflowTemplates = {
  "review-decision": "Review and decision",
  "prototype-software": "Prototype and software",
  "workflow-ai-integration": "Workflow and AI integration",
  "communications-knowledge": "Communications and knowledge",
} as const;

export const accessActions = {
  membership_grant: "Approve client membership",
  membership_revoke: "Revoke client membership and its grants",
  engagement_grant: "Set access for this engagement",
  engagement_revoke: "Revoke access for this engagement",
} as const;

export const provisionCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create"), retry: z.uuid(),
    client: z.string().trim().min(1).max(180),
    project: z.string().trim().min(1).max(180),
    engagement: z.string().trim().min(1).max(180),
    template: z.enum(Object.keys(workflowTemplates) as [keyof typeof workflowTemplates, ...(keyof typeof workflowTemplates)[]]),
    objective: z.string().trim().min(1).max(1800),
  }),
  z.strictObject({
    action: z.literal("access"), engagementId: z.uuid(), subjectId: z.uuid(),
    operation: z.enum(Object.keys(accessActions) as [keyof typeof accessActions, ...(keyof typeof accessActions)[]]),
    commercial: z.boolean(),
  }),
]);

export async function workspaceProvisionOptions(userId: string) {
  return asStakeholder(userId, async (tx) => {
    const [row] = await tx<{ allowed: boolean }[]>`select velcrafting_private.can_workspace_provision() as allowed`;
    const engagements = await tx<{ id: string; title: string; client: string; canGrantCommercial: boolean }[]>`
      select e.id, e.title, c.name as client,
        exists(select 1 from velcrafting_private.staff_access t where t.engagement_id = e.id and t.capability = 'issue') as "canGrantCommercial"
      from velcrafting_private.staff_access a
      join velcrafting_private.engagement e on e.id = a.engagement_id
      join velcrafting_private.client c on c.id = e.client_id
      where a.capability = 'manage_access' order by c.name, e.title`;
    return { canCreate: row.allowed, engagements };
  });
}

export async function executeWorkspaceProvision(userId: string, command: z.infer<typeof provisionCommand>) {
  return asStakeholder(userId, async (tx) => {
    if (command.action === "create") {
      const [row] = await tx<{ engagement_id: string | null; disposition: string }[]>`select * from velcrafting_private.create_workspace_engagement(
        ${command.retry}, ${command.client}, ${command.project}, ${command.engagement}, ${command.template}, ${command.objective})`;
      return { disposition: row.disposition, engagementId: row.engagement_id };
    }
    const [row] = await tx<{ disposition: string }[]>`select velcrafting_private.set_workspace_access(
      ${command.engagementId}, ${command.subjectId}, ${command.operation}, ${command.commercial}) as disposition`;
    return { disposition: row.disposition };
  });
}
