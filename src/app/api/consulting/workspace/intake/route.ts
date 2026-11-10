import { boundedJson, isClientMutation, json } from "@/consulting/server/request-boundary";
import { workspaceIdentity } from "@/consulting/server/workspace";
import { executeWorkspaceIntake, workspaceIntakeCommand } from "@/consulting/server/workspace-intake";

export async function POST(request: Request) {
  if (!isClientMutation(request)) return json({ error: "Not found" }, 404);
  try {
    const actor = await workspaceIdentity();
    if (!actor) return json({ error: "Not found" }, 404);
    const input = workspaceIntakeCommand.safeParse(await boundedJson(request, 4096).catch(() => null));
    if (!input.success) return json({ error: "Select at least one reviewed field." }, 400);
    const result = await executeWorkspaceIntake(actor.id, input.data);
    if (result.disposition === "created") return json(result, 201);
    if (result.disposition === "duplicate") return json(result);
    if (result.disposition === "conflict") return json({ error: "The source or destination changed. Review the current brief again." }, 409);
    if (result.disposition === "invalid") return json({ error: "Select at least one reviewed field." }, 400);
    return json({ error: "Booking or engagement is unavailable." }, 404);
  } catch { return json({ error: "Workspace intake is unavailable." }, 503); }
}
