import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceIdentity } from "@/consulting/server/workspace";
import { accessActions, workflowTemplates, workspaceProvisionOptions } from "@/consulting/server/workspace-provision";
import ProvisionForm from "./ProvisionForm";

export default async function WorkspaceSetup() {
  const actor = await requireWorkspaceIdentity();
  const options = await workspaceProvisionOptions(actor.id);
  if (!options.canCreate && !options.engagements.length) notFound();
  return <section>
    <h1>Workspace setup</h1>
    <p className="mt-3">Set up a private engagement or manage access for a verified person.</p>
    {options.canCreate && process.env.VELCRAFTING_BOOKING_ENABLED === "1" &&
      <p className="mt-3"><Link href="/staff/intake">Review shared booking briefs</Link></p>}
    <ProvisionForm {...options} templates={Object.entries(workflowTemplates)} actions={Object.entries(accessActions)} />
  </section>;
}
