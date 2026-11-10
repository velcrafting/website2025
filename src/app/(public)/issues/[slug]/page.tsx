// Gate B / S06 + concept 03: the public issue detail route.
//
// This is a projection of the database, not of the filesystem. It renders ONLY
// what src/editor/repository/public.ts returns, which requires a published
// pointer AND a committed website intent. A draft, a private item or a revision
// with no intent is simply not in the query, so there is nothing to filter at
// render time.
//
// The revision marker and the canonical link are what publication verification
// reads back over unauthenticated HTTP. Do not remove them.

import { notFound } from "next/navigation";

import { escapeHtml, renderBlocksToHtml } from "@/editor/render/bundle";
import { renderIssueShellHtml } from "@/editor/render/issue-shell";
import {
  accessLevelLabel,
  getPublicIssue,
  listProvenanceForRevision,
  type RevisionProvenance,
} from "@/editor/repository/public";
import { getBundleForRevision } from "@/editor/repository/bundles";
import { openEditorStore } from "@/editor/repository/store";
import { currentEditorEnvironment } from "@/editor/service";
import { rendererCss } from "@/editor/render/styles";

export const dynamic = "force-dynamic";

function canonicalBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3410").replace(/\/+$/, "");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = (await openEditorStore());
  try {
    const issue = (await getPublicIssue(store.db, slug, currentEditorEnvironment()));
    if (!issue) return { title: "Issue not found" };
    return {
      title: issue.title,
      description: issue.summary ?? undefined,
      alternates: { canonical: `${canonicalBase()}/issues/${issue.slug}` },
      other: { "x-content-revision": issue.revisionSha256 },
    };
  } finally {
    (await store.close());
  }
}

export default async function IssueDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = (await openEditorStore());
  let issue = null;
  let provenance: RevisionProvenance[] = [];
  let rendered = "";
  try {
    issue = (await getPublicIssue(store.db, slug, currentEditorEnvironment()));
    if (issue) {
      provenance = (await listProvenanceForRevision(store.db, issue.revisionId));
      // Render the revision's OWN stored bundle rather than re-rendering its blocks here.
      // The bundle is the artifact an approval bound and a publication verified, so this
      // reader serves those exact bytes — and an already-published revision keeps the
      // output it was approved with even if the renderer later changes. The inline
      // renderer this replaces emitted only headings and paragraphs, so a figure or a
      // callout was published to the page as nothing at all.
      const bundle = (await getBundleForRevision(store.db, issue.revisionId));
      rendered =
        typeof bundle?.outputs?.web_html === "string"
          ? bundle.outputs.web_html
          : renderBlocksToHtml(issue.blocks);
    }
  } finally {
    (await store.close());
  }
  if (!issue) notFound();

  const canonical = `${canonicalBase()}/issues/${issue.slug}`;

  // The title/summary/byline/body/sources region comes from the SAME shell the live draft preview
  // uses, so the two cannot drift apart. The body is this revision's own stored bundle output —
  // approved bytes served as approved — and the markers publication verification reads back
  // (`data-revision`, `data-issue-slug`, `data-provenance-count`) keep their names.
  const shellHtml = renderIssueShellHtml({
    title: issue.title,
    summary: issue.summary,
    byline: issue.byline,
    bodyHtml: rendered,
    sources: provenance.map((source) => ({
      title: source.sourceTitle,
      url: source.canonicalUrl,
      provider: source.provider,
      meta: [
        source.upstreamId,
        source.versionLabel,
        `${accessLevelLabel(source.accessLevel)} · retrieved ${source.retrievedAt}`,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    revisionSha256: issue.revisionSha256,
    issueSlug: issue.slug,
    emptySourcesNote:
      "No structured source link is recorded for this revision. Provenance, if any, appears in the text above.",
    footerHtml:
      `<hr class="rule mt-[var(--space-7)]" />` +
      `<p class="meta mt-[var(--space-4)]">Published revision ${escapeHtml(
        issue.revisionSha256.slice(0, 12),
      )} — ${
        issue.intentState === "verified" ? "HTTP verified" : `state: ${escapeHtml(issue.intentState)}`
      }</p>` +
      `<p class="mt-[var(--space-4)]"><a href="/issues">All issues</a></p>`,
  });

  return (
    <div className="container-index py-[var(--space-7)]">
      <link rel="canonical" href={canonical} />
      <p className="meta mt-[var(--space-2)]">
        Canonical: <span>{canonical}</span>
      </p>

      <div dangerouslySetInnerHTML={{ __html: shellHtml }} />

      <style>{rendererCss}</style>
    </div>
  );
}
