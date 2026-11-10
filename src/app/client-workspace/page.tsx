import EngagementList from "./EngagementList";
import SignOut from "./SignOut";
import { requireWorkspaceIdentity, workspaceEngagements } from "@/consulting/server/workspace";

export default async function WorkspaceHome() {
  const identity = await requireWorkspaceIdentity();
  const engagements = await workspaceEngagements(identity.id);
  return <section>
    <div className="flex flex-wrap items-center justify-between gap-4"><h1>Your engagements</h1><SignOut /></div>
    <EngagementList engagements={engagements} />
  </section>;
}
