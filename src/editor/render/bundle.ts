// Gate B: deterministic bundle rendering.
//
// The bundle is what an approval binds. Two properties matter and are both
// tested: rendering the same revision twice produces byte-identical output, and
// the manifest hash covers content only — never a timestamp, never the bundle
// row's own id.
//
// The renderer deliberately does NOT evaluate MDX or any markup the author did
// not write as text. Every field is escaped, including figure attributes, and the
// only asset a block may reference is a local path validated at the persistence
// boundary. The Gate A non-executable MDX renderer remains the pipeline for legacy
// filesystem content; this one serves database-backed issues.

import { hashCanonical } from "../contracts/hash";
import { blockKindOf, type Block, type BlockKind, type ContentRevisionRecord } from "../contracts/types";

/**
 * Version 2 adds the `callout` and `figure` kinds (docs/2026-refresh.md §10,
 * package 1).
 *
 * Existing bundles keep the version they were built with — a bundle is stored, never
 * re-rendered — so old approved outputs and their hashes are untouched by this bump.
 * The bump matters only for new revisions, where it records which renderer produced
 * the bytes.
 */
export const RENDERER_VERSION = "gate-b-renderer/2";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Split block markdown into paragraphs. Blank-line separated, trimmed. */
export function paragraphsOf(markdown: string): string[] {
  return String(markdown ?? "")
    // Textareas submit CRLF, so stored text may contain CRLF or lone CR. Without
    // this the blank-line split below never matches and a multi-paragraph block
    // renders as one run-on paragraph.
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+$/g, "").trim())
    .filter((part) => part.length > 0);
}

function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

/**
 * Inner markup for one block, by kind.
 *
 * Everything is escaped text and plain elements. A callout states its tone in words
 * as well as in `data-tone`, so the meaning does not depend on colour alone. A figure
 * emits the validated local `src`, its required `alt`, and its optional caption.
 */
function blockBodyHtml(block: Block, kind: BlockKind, paragraphs: string[]): string {
  switch (kind) {
    case "figure": {
      const src = block.data?.src ?? "";
      const alt = block.data?.alt ?? "";
      const caption = block.data?.caption ?? "";
      const captionHtml = caption
        ? `<figcaption>${escapeHtml(caption)}</figcaption>`
        : "";
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />${captionHtml}</figure>`;
    }
    case "callout": {
      const tone = block.data?.tone ?? "note";
      const label = tone.charAt(0).toUpperCase() + tone.slice(1);
      const title = block.data?.title ?? "";
      const titleHtml = title ? `<p class="callout-title">${escapeHtml(title)}</p>` : "";
      return `<aside class="callout" data-tone="${escapeHtml(tone)}"><p class="callout-label">${escapeHtml(label)}</p>${titleHtml}${paragraphsToHtml(paragraphs)}</aside>`;
    }
    default:
      return paragraphsToHtml(paragraphs);
  }
}

export function renderBlocksToHtml(blocks: Block[]): string {
  const sections = blocks.map((block, index) => {
    const kind = blockKindOf(block);
    const paragraphs = paragraphsOf(block.markdown);
    const explicitHeading = block.heading?.trim() ?? "";
    // A `heading` block may carry its text in either field; it is emitted once, as the
    // heading, and its remaining paragraphs (if any) stay as body.
    const headingText = explicitHeading || (kind === "heading" ? (paragraphs[0] ?? "") : "");
    const heading = headingText ? `<h2>${escapeHtml(headingText)}</h2>` : "";
    const bodyParagraphs =
      kind === "heading" && !explicitHeading ? paragraphs.slice(1) : paragraphs;
    const body = blockBodyHtml(block, kind, bodyParagraphs);
    return `<section data-block="${escapeHtml(block.id)}" data-block-index="${index}">${heading}${body}</section>`;
  });
  return sections.join("\n");
}

export function renderBlocksToText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const kind = blockKindOf(block);
      const paragraphs = paragraphsOf(block.markdown);

      if (kind === "figure") {
        // A figure must not vanish from the text projection: the newsletter text
        // fallback depends on this. The caption wins, otherwise the alt text; the
        // source path is never presented as a description.
        const label = (block.data?.caption ?? "").trim() || (block.data?.alt ?? "").trim();
        return label ? `[Figure: ${label}]` : "[Figure]";
      }

      if (kind === "callout") {
        const tone = block.data?.tone ?? "note";
        const label = tone.charAt(0).toUpperCase() + tone.slice(1);
        const title = (block.data?.title ?? "").trim();
        const head = title ? `${label}: ${title}` : label;
        return `${head}\n\n${paragraphs.join("\n\n")}`.trim();
      }

      const heading = block.heading?.trim() ? `${block.heading.trim()}\n\n` : "";
      return `${heading}${paragraphs.join("\n\n")}`;
    })
    .join("\n\n");
}

export type BuiltBundle = {
  revisionId: string;
  revisionSha256: string;
  rendererVersion: string;
  manifestSha256: string;
  outputs: Record<string, string>;
  assetSha256s: string[];
  validation: Record<string, unknown>;
};

/**
 * Build the bundle for a revision. `validation` reports what the validator
 * observed; it never fabricates a claim to make validation pass.
 */
export function buildBundle(revision: ContentRevisionRecord): BuiltBundle {
  const outputs: Record<string, string> = {
    web_html: renderBlocksToHtml(revision.blocks),
    plain_text: renderBlocksToText(revision.blocks),
  };

  const validation = {
    blockCount: revision.blocks.length,
    hasSourceReferences: revision.sourceVersionIds.length > 0,
    lockedBlockCount: revision.blocks.filter((b) => b.humanLocked).length,
    materialMissingQuestions: revision.unresolvedQuestionIds,
  };

  const assetSha256s: string[] = [];

  const manifestSha256 = hashCanonical({
    revisionSha256: revision.contentSha256,
    rendererVersion: RENDERER_VERSION,
    outputs,
    assetSha256s,
  });

  return {
    revisionId: revision.id,
    revisionSha256: revision.contentSha256,
    rendererVersion: RENDERER_VERSION,
    manifestSha256,
    outputs,
    assetSha256s,
    validation,
  };
}

/**
 * Payload hash for a publication intent: the exact bytes being published, plus
 * the channel and target identity. Excludes volatile timestamps so a retry of
 * the same logical operation produces the same payload hash.
 */
export function publicationPayloadHash(input: {
  manifestSha256: string;
  revisionSha256: string;
  channel: string;
  targetRef: string;
  operationKey: string;
}): string {
  return hashCanonical({
    manifestSha256: input.manifestSha256,
    revisionSha256: input.revisionSha256,
    channel: input.channel,
    targetRef: input.targetRef,
    operationKey: input.operationKey,
  });
}
