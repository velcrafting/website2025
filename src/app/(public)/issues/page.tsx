// Gate B / concept 03: the public issue archive.
//
// Same projection as the detail route: only committed publications appear. An
// empty archive says so plainly rather than showing sample issues.

import Link from "next/link";

import { listPublicIssues } from "@/editor/repository/public";
import { openEditorStore } from "@/editor/repository/store";
import { currentEditorEnvironment } from "@/editor/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Issues",
  description: "Published issues.",
};

export default async function IssuesIndexPage() {
  const store = (await openEditorStore());
  let issues: Awaited<ReturnType<typeof listPublicIssues>> = [];
  try {
    issues = (await listPublicIssues(store.db, currentEditorEnvironment()));
  } finally {
    (await store.close());
  }

  return (
    <div className="container-index py-[var(--space-7)]">
      <h1>Issues</h1>
      {issues.length === 0 ? (
        <p className="mt-[var(--space-5)]">No issues have been published yet.</p>
      ) : (
        <ul className="mt-[var(--space-6)] flex list-none flex-col gap-[var(--space-5)] pl-0">
          {issues.map((issue) => (
            <li key={issue.itemId}>
              <h2 className="text-[1.4rem]">
                <Link href={`/issues/${issue.slug}`}>{issue.title}</Link>
              </h2>
              {issue.summary ? (
                <p className="measure-prose mt-[var(--space-1)]">{issue.summary}</p>
              ) : null}
              <p className="meta mt-[var(--space-1)]">
                revision {issue.revisionSha256.slice(0, 12)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
