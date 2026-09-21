"use client";

// src/components/listing/ToolLaunch.tsx
//
// Shared launch panel for a tool or lab page (docs/2026-refresh.md §5): "Tools: verified clickable
// repository links and a usable tool experience or an honest external launch path. Do not describe
// an embed that does not exist."
//
// The page previously rendered a sentence claiming the tool "is embedded below for a seamless
// experience" while the page contained no iframe at all, and printed the repository URL as plain
// text. This panel renders whatever the document actually supplies:
//
//   liveUrl present → a real external link that opens the tool on its own address;
//   repo present    → a real clickable repository link;
//   neither         → an honest unavailable state, not a promise.
//
// Since the tools detail page began rendering the tool's own README inline, the panel carries two
// further obligations:
//
//   - the note must describe what this panel actually does. The previous sentence — "Nothing loads
//     here until you choose to open it." — stopped being true the moment a README rendered, so it
//     is gone. Each remaining sentence states, per state, what happens and whether the external
//     button leaves the site.
//   - a README is third-party content, so it is rendered through `ToolReadme` from the plain block
//     model. No MDX evaluation, no raw HTML, no embed.
//
// The README arrives already read and already parsed: this component decides only whether to show
// it. A failed, oversized, refused or empty read leaves `readme` empty, and the panel renders the
// buttons and nothing else — never an empty reader, never a spinner, never a caught error standing
// in for content. `data-readme-state` distinguishes the three real states:
//
//   inline      → the README below is the tool's own text, read from `readmeSource`
//   unavailable → a repository is recorded, but no README rendered (failed / too large / no blocks)
//   none        → the document records no repository at all, so nothing was fetched
import { Button } from "@/components/ui";
import { useState } from "react";
import ToolEmbed from "./ToolEmbed";
import { hasReadableBlocks, type ReadmeBlock } from "@/lib/readme-blocks";
import ToolReadme from "./ToolReadme";

type Props = {
  repo?: string;
  liveUrl?: string;
  title: string;
  /** The tool's own README, already converted to the plain block model. */
  readme?: ReadmeBlock[] | null;
  /** The exact URL the README was read from, when one was read. */
  readmeSource?: string;
  /** Real UTF-8 byte length of the text that was read. */
  readmeBytes?: number;
};

/**
 * The panel's note. One true sentence about what is actually on the page.
 *
 * F1, 2026-09-17: the previous strings described the README as sitting "below" and explained when it
 * was fetched. Both became false when the live embed moved above the links and the README moved into
 * a disclosure — so the copy denied the tool running on the page, and it spent the reader's attention
 * on fetch mechanics instead of the tool. The provenance is not lost: the disclosure still renders the
 * exact source URL it was read from (see ToolReadme, data-readme-source).
 */
function launchNote(liveUrl: string | undefined, inline: boolean): string {
  if (inline && liveUrl) {
    return "Use here keeps the tool on this page. The repository's README is in the disclosure below.";
  }
  if (inline) {
    return "This tool has no public address of its own, so it cannot run here. The repository's README is in the disclosure below.";
  }
  if (liveUrl) {
    return "Use here keeps the tool on this page; Open separately launches it in a new tab.";
  }
  return "No public address has been supplied for this tool, so it opens from its repository.";
}

export default function ToolLaunch({ repo, liveUrl, title, readme, readmeSource, readmeBytes }: Props) {
  const [showEmbed, setShowEmbed] = useState(false);
  const hasAny = Boolean(repo || liveUrl);
  const inline = hasReadableBlocks(readme) && Boolean(readmeSource);
  const state = inline ? "inline" : repo ? "unavailable" : "none";

  return (
    <section
      aria-label={`Use ${title}`}
      className="mt-[var(--space-6)] border-t border-rule pt-[var(--space-4)]"
      data-readme-state={state}
      data-tool-embed={liveUrl ?? "none"}
    >
      {hasAny ? (
        <>
          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            {liveUrl ? (
              <Button
                type="button"
                variant={showEmbed ? "default" : "outline"}
                aria-pressed={showEmbed}
                onClick={() => setShowEmbed((current) => !current)}
              >
                Use here
              </Button>
            ) : null}
            {liveUrl ? (
              <Button asChild variant="outline">
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  Open separately <span aria-hidden="true">↗</span>
                </a>
              </Button>
            ) : null}
            {repo ? (
              <Button asChild variant="outline">
                <a href={repo} target="_blank" rel="noopener noreferrer">
                  View Git <span aria-hidden="true">↗</span>
                </a>
              </Button>
            ) : null}
          </div>
          <p className="meta mt-[var(--space-3)]">{launchNote(liveUrl, inline)}</p>

          {/* ToolEmbed owns the origin check, sandbox, and cross-origin height handshake. */}
          {liveUrl && showEmbed ? (
            <div className="mt-[var(--space-4)] border-t border-rule pt-[var(--space-4)]">
              <ToolEmbed src={liveUrl} title={`${title} — the tool, running on this page`} />
            </div>
          ) : null}

          {/* Keep third-party README content behind an explicit disclosure. */}
          {inline ? (
            <details className="mt-[var(--space-4)] border-t border-rule pt-[var(--space-3)]">
              <summary className="meta cursor-pointer">
                About this tool — its repository README
              </summary>
              <ToolReadme blocks={readme as ReadmeBlock[]} source={readmeSource as string} bytes={readmeBytes} />
            </details>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">
          This tool has no public address or repository recorded yet, so there is
          nothing to open from this page.
        </p>
      )}
    </section>
  );
}
