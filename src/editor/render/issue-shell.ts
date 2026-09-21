// The presentational shell for one issue: title, summary, byline, the body and the source list.
//
// Extracted so the LIVE DRAFT PREVIEW and the PUBLISHED READER put the same furniture around the
// body. A preview that invents its own chrome is not a preview of the output: an author editing a
// summary needs to see the summary in place, next to the words it sits above.
//
// Two things this deliberately does NOT do:
//   - It does not decide the body. The published reader passes the revision's own stored bundle
//     output, so approved bytes are served exactly as approved; the preview passes the same
//     renderer's output for the block shapes currently in the form.
//   - It is not a template system. It is one function producing one document's worth of markup
//     from escaped text, and every attribute it emits is escaped like any other value.
//
// The attribute names `data-revision`, `data-issue-slug` and `data-provenance-count` are what
// publication verification reads back over unauthenticated HTTP. They are part of the contract and
// must keep their names.

import { escapeHtml } from "./bundle";

export type IssueShellSource = {
  title: string;
  url: string;
  provider?: string | null;
  meta?: string | null;
};

export type IssueShellInput = {
  kind?: "article" | "issue";
  title: string;
  summary?: string | null;
  /** The rendered body: a stored bundle output, or the live renderer's output for a draft. */
  bodyHtml: string;
  byline?: string | null | undefined;
  sources?: IssueShellSource[];
  /** Present only for a live draft, so it can never be mistaken for the saved output. */
  notice?: string | null;
  /** Publication verification reads these two back. Omitted for a draft, which has neither. */
  revisionSha256?: string | null;
  issueSlug?: string | null;
  /** Recorded when a revision has no structured source link, so the absence is stated. */
  emptySourcesNote?: string | null;
  footerHtml?: string | null;
};

export function renderIssueShellHtml(input: IssueShellInput): string {
  const sources = input.sources ?? [];
  const notice = input.notice
    ? `<p class="mt-[var(--space-4)] rounded-[var(--radius-surface)] border border-[var(--rule)] bg-warn-fill px-3 py-2 text-sm text-warn-ink">${escapeHtml(input.notice)}</p>`
    : "";
  const summary = input.summary
    ? `<p class="lead mt-[var(--space-4)]">${escapeHtml(input.summary)}</p>`
    : "";
  const byline = input.byline ? `<p class="meta mt-[var(--space-2)]">${escapeHtml(input.byline)}</p>` : "";

  const sourceList =
    sources.length === 0
      ? `<p class="meta mt-[var(--space-2)]">${escapeHtml(
          input.emptySourcesNote ?? "No structured source link is recorded for this revision.",
        )}</p>`
      : `<ul class="mt-[var(--space-3)] flex list-none flex-col gap-[var(--space-4)] pl-0">${sources
          .map(
            (source) =>
              `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a>` +
              (source.provider
                ? `<span class="meta mt-[var(--space-1)] block">${escapeHtml(source.provider)}</span>`
                : "") +
              (source.meta ? `<span class="meta block">${escapeHtml(source.meta)}</span>` : "") +
              `</li>`,
          )
          .join("")}</ul>`;

  const articleAttrs =
    (input.revisionSha256 ? ` data-revision="${escapeHtml(input.revisionSha256)}"` : "") +
    (input.issueSlug ? ` data-issue-slug="${escapeHtml(input.issueSlug)}"` : "");

  return (
    `<p class="meta uppercase tracking-wide">${input.kind === "article" ? "Article" : "Issue"}</p>` +
    `<h1 class="measure-prose mt-[var(--space-2)]">${escapeHtml(input.title)}</h1>` +
    summary +
    byline +
    notice +
    `<article class="prose mt-[var(--space-6)]"${articleAttrs}>${input.bodyHtml}</article>` +
    `<section class="mt-[var(--space-7)]" data-provenance-count="${sources.length}">` +
    `<h2>Sources</h2>${sourceList}</section>` +
    (input.footerHtml ?? "")
  );
}
