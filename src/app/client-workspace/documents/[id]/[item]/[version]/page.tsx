import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceIdentity, workspaceDocument } from "@/consulting/server/workspace";

export default async function DocumentPage({ params }: { params: Promise<{id: string; item: string; version: string}> }) {
  const identity = await requireWorkspaceIdentity();
  const { id, item, version } = await params;
  if (!/^[1-9]\d{0,4}$/.test(version)) notFound();
  const document = await workspaceDocument(identity.id, id, item, Number(version));
  if (!document) notFound();
  const { revision, terms } = document;
  return <article>
    <p><Link href={`/engagements/${id}`}>Back to engagement</Link></p>
    <h1 className="mt-3">{revision.title}</h1>
    <p className="meta">Version {version} · {revision.published_at.toISOString().slice(0,10)} (UTC)</p>
    <dl className="my-5 grid gap-4">{revision.body.sections?.map(({ label, text }) => <div key={label}>
      <dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{text}</dd>
    </div>)}</dl>
    {terms && <section><h2>Commercial terms</h2><p className="whitespace-pre-wrap wrap-anywhere">{terms}</p></section>}
    <p className="mt-5"><a href={`/documents/${id}/${item}/${version}/download`}>Download this version</a></p>
  </article>;
}
