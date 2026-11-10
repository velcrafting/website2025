import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceIdentity, stages, stageTitles, workspaceEngagement } from "@/consulting/server/workspace";

export default async function EngagementPage({ params }: { params: Promise<{ id: string; section?: string[] }> }) {
  const identity = await requireWorkspaceIdentity();
  const { id, section = [] } = await params;
  const data = await workspaceEngagement(identity.id, id);
  const stage = stages.find((entry) => entry === section[0]);
  if (!data || section.length > 1 || (section.length && !stage)) notFound();
  const { engagement, revisions, files, capabilities, accepted } = data;
  const base = `/engagements/${id}`;
  const visible = revisions.filter((revision) => stage ? revision.body.stage === stage : revision.body.stage === "kickoff" || revision.body.stage === "updates");
  const baseline = accepted.at(0);
  return <section>
    <p className="meta">{engagement.client} · {engagement.project}</p>
    <h1>{engagement.title}</h1>
    {engagement.objective && <p className="mt-2">{engagement.objective}</p>}
    <p className="mt-2">{engagement.status} · {engagement.next_action ?? "No action needed from you."}</p>
    <nav aria-label="Engagement sections" className="my-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-rule py-3">
      <Link href={base} aria-current={!stage ? "page" : undefined}>Overview</Link>
      {stages.filter((entry) => entry !== "kickoff" && (entry !== "quote" || revisions.some(({ body }) => body.stage === "quote"))).map((entry) =>
        <Link key={entry} href={`${base}/${entry}`} aria-current={stage === entry ? "page" : undefined}>{stageTitles[entry]}</Link>)}
      {capabilities.some((capability) => capability !== "manage_access") && <Link href={`/staff/${id}`}>Staff authoring</Link>}
    </nav>
    {!stage && baseline && <section className="mb-6" aria-label="Accepted scope">
      <h2>Accepted scope</h2>
      <p><Link href={`/documents/${id}/${baseline.item_id}/${baseline.version}`}>{baseline.title} · Version {baseline.version}</Link></p>
      {accepted.slice(1).map(({ item_id, title, version }) =>
        <p key={`${item_id}/${version}`}><Link href={`/documents/${id}/${item_id}/${version}`}>Accepted amendment: {title} · Version {version}</Link></p>)}
    </section>}
    <h2>{stage ? stageTitles[stage] : "Kickoff and recent updates"}</h2>
    {visible.length ? visible.map((record) => <article className="mt-4 border-t border-rule py-4" key={record.item_id}>
      <h3><Link href={`/documents/${id}/${record.item_id}/${record.version}`}>{record.title}</Link></h3>
      <p className="meta">Version {record.version} · {record.published_at.toISOString().slice(0,10)} (UTC)</p>
      <dl className="mt-3 grid gap-3">{record.body.sections?.map(({ label, text }) => <div key={label}>
        <dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{text}</dd>
      </div>)}</dl>
    </article>) : <p className="mt-3">No records have been shared here yet.</p>}
    {files.length > 0 && (!stage || stage === "delivery") && <section className="mt-6">
      <h2>Shared files</h2><ul className="mt-3 grid gap-2">{files.map((file) => <li key={file.id}>
        <a href={`/files/${file.id}/download`}>{file.filename}</a> · Version {file.version}
      </li>)}</ul>
    </section>}
  </section>;
}
