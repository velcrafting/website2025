// src/components/listing/RepoVersionChip.tsx
//
// Server component. The per-project version chip for a card on `/projects`
// (docs/implementation_plan_Sep16.md §5). It reads nothing itself: the page does the read once,
// through `src/lib/github/repo-release-note.ts`, and hands the result down.
//
// WHAT IT RENDERS
//
//   `ok`                        → the chip: the version, and the first one-line note as the
//                                 one-sentence "Latest:" update.
//   every other status          → NOTHING AT ALL. No chip, no dash, no placeholder, no
//                                 "version unknown", no empty container. The card renders exactly
//                                 as it did before this feature existed.
//
//   The status is always visible to a machine even when no chip renders: the card's <article>
//   carries `data-repo-version-state` with the read's status, so "absent" (the project publishes no
//   release note) and "transient" (the read failed) stay distinguishable in the served HTML and do
//   not get collapsed into one silence.
//
//   When a chip DOES render it quotes where it came from, in `data-repo-version-source` — the exact
//   raw URL of the file the version was read from — so a version on a card is always traceable to
//   one file.
//
// WHAT IT DELIBERATELY DOES NOT RENDER
//
//   The whole note list. A card is a summary, and the contract for this chip is "the version and a
//   one-sentence latest update". Extra bullets behind a disclosure on every card in a grid reads as
//   a changelog spliced into the index. The notes are validated and carried in the read result, so a
//   later surface can render them without changing the file format.

import type { RepoReleaseNoteRead } from "@/lib/github/repo-release-note";

export default function RepoVersionChip({
  read,
  className,
}: {
  read: RepoReleaseNoteRead | null;
  /** Spacing supplied by the caller, so a card with no chip gains no empty element and no gap. */
  className?: string;
}) {
  // Withheld, never invented: no usable version means no chip.
  if (!read || read.status !== "ok") return null;

  const { release, url } = read;

  return (
    <div
      className={`flex flex-wrap items-baseline gap-[var(--space-2)]${className ? ` ${className}` : ""}`}
      data-repo-version={release.version}
      data-repo-version-source={url}
    >
      <span className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 whitespace-nowrap">
        Version {release.version}
        {release.updated ? ` · ${release.updated}` : ""}
      </span>
      {release.note ? <span className="meta measure-prose">Latest: {release.note}</span> : null}
    </div>
  );
}
