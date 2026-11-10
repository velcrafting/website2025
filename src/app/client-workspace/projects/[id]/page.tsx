import { notFound } from "next/navigation";
import EngagementList from "../../EngagementList";
import { requireWorkspaceIdentity, workspaceEngagements } from "@/consulting/server/workspace";

export default async function ScopedEngagements({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireWorkspaceIdentity();
  const engagements = await workspaceEngagements(identity.id, { kind: "project", id: (await params).id });
  if (!engagements.length) notFound();
  return <section><h1>{engagements[0].project}</h1><EngagementList engagements={engagements} /></section>;
}
