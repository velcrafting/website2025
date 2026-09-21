// src/components/listing/VersionChip.tsx
//
// Server component. Renders nothing at all when the release file is missing or unusable, so a bad file
// degrades to no chip rather than to a broken page.

import { readReleaseNotes } from "@/lib/release-notes";
import rawReleaseNotes from "@/lib/release-notes.json";

export default function VersionChip() {
  const release = readReleaseNotes(rawReleaseNotes);
  if (!release) return null;

  return (
    <div
      className="flex flex-wrap items-baseline gap-[var(--space-2)]"
      data-version-chip={release.version}
    >
      <span className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 whitespace-nowrap">
        Version {release.version}
        {release.updated ? ` · ${release.updated}` : ""}
      </span>
      {release.note ? (
        <span className="meta measure-prose">Latest: {release.note}</span>
      ) : null}
      {release.notes.length > 1 ? (
        <details className="meta">
          <summary className="cursor-pointer">What changed</summary>
          <ul className="measure-prose mt-[var(--space-2)] list-disc pl-[var(--space-4)]">
            {release.notes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
