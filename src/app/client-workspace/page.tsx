import Link from "next/link";
import { workspaceProvisionOptions } from "@/consulting/server/workspace-provision";
import EngagementList from "./EngagementList";
import SignOut from "./SignOut";
import { requireWorkspaceIdentity, workspaceEngagements } from "@/consulting/server/workspace";

export default async function WorkspaceHome() {
  const identity = await requireWorkspaceIdentity();
  const [engagements, setup] = await Promise.all([
    workspaceEngagements(identity.id), workspaceProvisionOptions(identity.id),
  ]);
  return <section>
    <div className="flex flex-wrap items-center justify-between gap-4"><h1>Your engagements</h1><SignOut /></div>
    {(setup.canCreate || setup.engagements.length > 0) &&
      <p className="mt-3"><Link href="/staff/setup">Workspace setup</Link></p>}
    <EngagementList engagements={engagements} />
  </section>;
}
