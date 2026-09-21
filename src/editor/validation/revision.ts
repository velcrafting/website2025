// Gate B: validation and hashing for authored content.
//
// The content hash is the exact-artifact identity an approval binds. It covers
// authored content only — never timestamps, ids of the record itself, or the
// author — so re-saving the same words cannot silently pass as a new artifact,
// and a re-render cannot change identity.

import { randomUUID } from "node:crypto";
import { EditorError } from "../contracts/errors";
import { hashCanonical } from "../contracts/hash";
import {
  ORIGINS,
  EDITORIAL_STATES,
  BLOCK_KINDS,
  BLOCK_SCHEMA_VERSION,
  CALLOUT_TONES,
  SUPPORTED_BLOCK_SCHEMA_VERSIONS,
  blockKindOf,
  type Block,
  type BlockData,
  type BlockKind,
  type EditorialState,
  type Origin,
} from "../contracts/types";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 80;

/**
 * Newlines are canonicalised to LF on the way in. An HTML form submits CRLF, so
 * without this every save would rewrite every block's line endings — which
 * changes a locked provenance block's bytes even when the author did not touch it,
 * and changes the content hash for a purely transport-level reason. Existing rows
 * are immutable and are not rewritten; the renderer also tolerates CRLF so
 * already-stored text displays correctly.
 */
function canonicalNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** Strict slug: no separators, no dots, no traversal, no encoded forms. */
export function assertSlug(raw: unknown, field = "slug"): string {
  const slug = typeof raw === "string" ? raw.trim() : "";
  if (!slug) {
    throw new EditorError("VALIDATION_FAILED", `${field} is required`, { field });
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new EditorError("VALIDATION_FAILED", `${field} is too long`, {
      field,
      max: MAX_SLUG_LENGTH,
    });
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new EditorError(
      "VALIDATION_FAILED",
      `${field} must be lowercase alphanumeric words separated by single hyphens`,
      { field, value: slug },
    );
  }
  return slug;
}

export type BlockInput = {
  id?: string;
  kind?: BlockKind;
  data?: BlockData;
  blockSchemaVersion?: number;
  section?: string;
  heading?: string;
  markdown?: string;
  humanLocked?: boolean;
  origin?: Origin;
  claims?: string[];
  linkedArticleRevisionId?: string | null;
  publicPermissionRecordIds?: string[];
};

function optionalText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) {
    throw new EditorError("VALIDATION_FAILED", `${field} is too long`, { field, max });
  }
  return text;
}

/**
 * A figure asset must be a LOCAL path under /public, in canonical form.
 *
 * Anything that would have to be decoded or interpreted before we can say where it points is
 * refused, rather than decoded and then re-checked: a browser, a proxy or an image optimiser
 * may decode differently from us, so `/%2e%2e/secret` and `/%2F%2Fevil.example/x` must never
 * reach a boundary that has to trust its own decoding. Percent escapes are therefore not in
 * the allowed alphabet at all.
 *
 * The allowed character class subsumes the earlier separate checks: no scheme (`https:`,
 * `data:`, `javascript:`), no query or fragment, no backslash, no NUL. Segments are then
 * checked individually so an empty, current or parent segment cannot hide inside a path.
 */
const ASSET_PATH_PATTERN = /^\/[A-Za-z0-9._~\-/]+$/;
const MAX_ASSET_PATH_LENGTH = 300;

function assertAssetPath(raw: unknown, field: string): string {
  const src = typeof raw === "string" ? raw.trim() : "";
  if (!src) {
    throw new EditorError("VALIDATION_FAILED", `${field} is required`, { field });
  }
  if (src.length > MAX_ASSET_PATH_LENGTH) {
    throw new EditorError("VALIDATION_FAILED", `${field} is too long`, {
      field,
      max: MAX_ASSET_PATH_LENGTH,
    });
  }
  if (!ASSET_PATH_PATTERN.test(src)) {
    throw new EditorError(
      "VALIDATION_FAILED",
      `${field} must be a plain local path under /public (letters, digits, dot, dash, underscore, slash)`,
      { field, value: src },
    );
  }
  const segments = src.split("/").slice(1);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new EditorError(
      "VALIDATION_FAILED",
      `${field} contains an empty, current-directory or parent-directory segment`,
      { field, value: src },
    );
  }
  return src;
}

/**
 * Validate and normalise one block's kind-specific payload.
 *
 * Each kind states exactly what it needs. A missing required field is a rejection with
 * a readable reason, never a silently empty block. Unknown kinds are rejected rather
 * than stored — an unrecognised kind must not be persisted where a reader cannot render
 * it.
 */
function normaliseBlockData(
  kind: BlockKind,
  raw: BlockData | undefined,
  index: number,
  markdown: string,
  heading: string,
): BlockData {
  const source = (raw ?? {}) as BlockData;

  switch (kind) {
    case "paragraph": {
      if (!markdown.trim()) {
        throw new EditorError("VALIDATION_FAILED", `block ${index} has no text`, { index });
      }
      return {};
    }
    case "heading": {
      if (!heading.trim() && !markdown.trim()) {
        throw new EditorError(
          "VALIDATION_FAILED",
          `block ${index} needs heading text or markdown`,
          { index },
        );
      }
      return {};
    }
    case "callout": {
      if (!markdown.trim()) {
        throw new EditorError("VALIDATION_FAILED", `block ${index} has no callout text`, { index });
      }
      const tone = source.tone ?? "note";
      if (!(CALLOUT_TONES as readonly string[]).includes(tone)) {
        throw new EditorError("VALIDATION_FAILED", `block ${index} has an unknown callout tone`, {
          index,
          tone,
        });
      }
      return {
        tone,
        title: optionalText(source.title, `block ${index} callout title`, 120) || undefined,
      };
    }
    case "figure": {
      const src = assertAssetPath(source.src, `block ${index} figure src`);
      const alt = optionalText(source.alt, `block ${index} figure alt`, 300);
      if (!alt) {
        // Alt text is required, not optional: a figure without it is unreadable for a
        // screen reader, and the later newsletter text fallback depends on it too.
        throw new EditorError("VALIDATION_FAILED", `block ${index} figure needs alt text`, {
          index,
        });
      }
      return {
        src,
        alt,
        caption: optionalText(source.caption, `block ${index} figure caption`, 300) || undefined,
      };
    }
    default: {
      throw new EditorError("VALIDATION_FAILED", `block ${index} has an unknown kind`, {
        index,
        kind: kind as string,
      });
    }
  }
}

export function normaliseBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) {
    throw new EditorError("VALIDATION_FAILED", "blocks must be an array");
  }
  if (input.length === 0) {
    throw new EditorError("VALIDATION_FAILED", "at least one block is required");
  }
  if (input.length > 200) {
    throw new EditorError("VALIDATION_FAILED", "too many blocks", { count: input.length });
  }
  const seen = new Set<string>();
  return input.map((raw, index) => {
    const block = (raw ?? {}) as BlockInput;
    const markdown =
      typeof block.markdown === "string" ? canonicalNewlines(block.markdown) : "";
    const heading = canonicalNewlines(optionalText(block.heading, `block ${index} heading`, 200));
    const origin = (block.origin ?? "human") as Origin;
    if (!ORIGINS.includes(origin)) {
      throw new EditorError("VALIDATION_FAILED", `block ${index} has an unknown origin`, {
        index,
        origin,
      });
    }
    const id = block.id ? String(block.id) : `blk_${randomUUID()}`;
    if (seen.has(id)) {
      throw new EditorError("VALIDATION_FAILED", `duplicate block id ${id}`, { id });
    }
    seen.add(id);

    // A block with no explicit kind keeps working: its stored shape decides, so an
    // older revision submitted back through the editor is not silently reinterpreted.
    const requestedKind = block.kind;
    const impliedKind = blockKindOf({ heading });
    const kind = requestedKind ?? impliedKind;
    if (!(BLOCK_KINDS as readonly string[]).includes(kind)) {
      throw new EditorError("VALIDATION_FAILED", `block ${index} has an unknown kind`, {
        index,
        kind: kind as string,
      });
    }

    // Only schema versions this build understands are stored. A version we cannot read is
    // rejected here rather than persisted where a reader would silently misinterpret it.
    if (block.blockSchemaVersion !== undefined && block.blockSchemaVersion !== null) {
      const version = Number(block.blockSchemaVersion);
      if (!SUPPORTED_BLOCK_SCHEMA_VERSIONS.includes(version)) {
        throw new EditorError(
          "VALIDATION_FAILED",
          `block ${index} has an unsupported block schema version`,
          { index, version: block.blockSchemaVersion },
        );
      }
    }

    const data = normaliseBlockData(kind, block.data, index, markdown, heading);

    // The kind payload is attached only when it is MATERIAL — when the resolved kind is not
    // the one this block's own shape already implies, or when the payload holds something.
    // So an unchanged legacy block re-saves to exactly its original bytes and its original
    // content hash, and a save that changed no words cannot invalidate an approval.
    const carriesKindPayload =
      kind !== impliedKind || Object.values(data).some((value) => value !== undefined && value !== "");

    const base = {
      id,
      section: optionalText(block.section ?? "none", `block ${index} section`, 80) || "none",
      heading,
      markdown,
      humanLocked: Boolean(block.humanLocked),
      origin,
      claims: Array.isArray(block.claims) ? block.claims.map((c) => String(c)) : [],
      linkedArticleRevisionId: block.linkedArticleRevisionId ?? null,
      publicPermissionRecordIds: Array.isArray(block.publicPermissionRecordIds)
        ? block.publicPermissionRecordIds.map((c) => String(c))
        : [],
    };

    return carriesKindPayload
      ? { ...base, kind, data, blockSchemaVersion: BLOCK_SCHEMA_VERSION }
      : base;
  });
}

export type RevisionContentInput = {
  title: string;
  summary?: string | null;
  byline?: string | null;
  blocks: Block[];
  sourceVersionIds?: string[];
  assetIds?: string[];
};

/**
 * Hash of the authored content. Stable across re-saves of identical text and
 * across renders; changes whenever the words, block structure or pinned
 * sources change. Deliberately excludes timestamps and the record's own id.
 */
export function revisionContentHash(input: RevisionContentInput): string {
  return hashCanonical({
    title: input.title,
    summary: input.summary ?? null,
    byline: input.byline ?? null,
    blocks: input.blocks.map((b) => ({
      id: b.id,
      section: b.section,
      heading: b.heading,
      markdown: b.markdown,
      humanLocked: b.humanLocked,
      origin: b.origin,
      claims: b.claims,
      linkedArticleRevisionId: b.linkedArticleRevisionId,
      publicPermissionRecordIds: b.publicPermissionRecordIds,
      // Kind payload is hashed ONLY when the block actually carries a kind, so a revision
      // written before block kinds existed still produces exactly its original hash.
      // Spreading these unconditionally would silently change every legacy revision's
      // identity — and an approval binds that hash.
      ...(b.kind ? { kind: b.kind, data: b.data, blockSchemaVersion: b.blockSchemaVersion } : {}),
    })),
    sourceVersionIds: input.sourceVersionIds ?? [],
    assetIds: input.assetIds ?? [],
  });
}

export function assertEditorialState(raw: unknown, fallback: EditorialState = "draft"): EditorialState {
  const state = (raw ?? fallback) as EditorialState;
  if (!EDITORIAL_STATES.includes(state)) {
    throw new EditorError("VALIDATION_FAILED", "unknown editorial state", { state: raw });
  }
  return state;
}

export function assertTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) {
    throw new EditorError("VALIDATION_FAILED", "title is required");
  }
  if (title.length > 300) {
    throw new EditorError("VALIDATION_FAILED", "title is too long", { max: 300 });
  }
  return title;
}

/** Blocks that must survive later regeneration byte-for-byte. */
export function lockedBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => b.humanLocked);
}

export function lockedBlocksPreserved(before: Block[], after: Block[]): boolean {
  const byId = new Map(after.map((b) => [b.id, b]));
  return lockedBlocks(before).every((b) => {
    const now = byId.get(b.id);
    return Boolean(now) && now!.markdown === b.markdown && now!.heading === b.heading;
  });
}
