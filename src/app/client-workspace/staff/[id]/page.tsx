import Link from "next/link";
import { notFound } from "next/navigation";
import { getStageFields, requireWorkspaceIdentity, stages, stageTitles, workspaceDrafts, workspaceEngagement, workspaceStatuses } from "@/consulting/server/workspace";
import DraftForm from "./DraftForm";

export default async function StaffPage({ params }: { params: Promise<{id: string}> }) {
  const { id } = await params;
  const identity = await requireWorkspaceIdentity();
  const data = await workspaceEngagement(identity.id,id);
  if (!data?.capabilities.some((capability) => capability !== "manage_access")) notFound();
  const drafts = await workspaceDrafts(identity.id,id);
  const seen = new Set(drafts.map(({ item_id }) => item_id));
  const issuedForRecorder = data.capabilities.includes("record_agreement")
    ? data.revisions.filter(({ item_id, body }) => body.stage === "proposal" && !seen.has(item_id)).map((issued) => ({
        ...issued, prior: issued.version, stage: "proposal" as const,
      }))
    : [];
  return <section>
    <p><Link href={`/engagements/${id}`}>Back to engagement</Link></p>
    <h1 className="mt-3">Author {data.engagement.title}</h1>
    <p className="mt-3">Save a private draft, preview the saved revision, then publish it for the intended audience.</p>
    <DraftForm id={id} progress={{ status:data.engagement.status, version:data.engagement.status_version,
      nextAction:data.engagement.next_action, statuses:workspaceStatuses }} capabilities={data.capabilities} baseline={data.accepted.at(-1)} stages={stages.map((value) =>
      ({value,label: stageTitles[value],sections: getStageFields(value)}))}
      drafts={[...drafts,...issuedForRecorder].map((draft) => ({...draft,sections:draft.body.sections ?? []}))} />
  </section>;
}
