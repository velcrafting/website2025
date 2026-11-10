import Link from "next/link";
import type { Engagement } from "@/consulting/server/workspace";

export default function EngagementList({ engagements }: { engagements: Engagement[] }) {
  if (!engagements.length) return <p className="mt-4">No engagements have been shared with this account.</p>;
  return <ul className="mt-6 grid gap-4">
    {engagements.map((engagement) => <li key={engagement.id} className="border-t border-rule py-4">
      <p className="meta"><Link href={`/clients/${engagement.client_id}`}>{engagement.client}</Link> · <Link href={`/projects/${engagement.project_id}`}>{engagement.project}</Link></p>
      <h2 className="mt-1"><Link href={`/engagements/${engagement.id}`}>{engagement.title}</Link></h2>
      <p>{engagement.status}{engagement.updated ? ` · Last shared update ${engagement.updated.toISOString().slice(0,10)} (UTC)` : ""}</p>
      <p>{engagement.next_action ?? "No action needed from you."}</p>
    </li>)}
  </ul>;
}
