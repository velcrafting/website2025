// Gate B / S04a contracts.
//
// Fixed authoring forms and the record shapes shared by the repositories, the
// API routes and the published projection. Every list below is the same
// vocabulary the database CHECK constraints enforce; keep them in step.

export const ITEM_TYPES = ["article", "project", "issue"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const VISIBILITIES = ["private", "review", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ORIGINS = ["human", "model", "fixture"] as const;
export type Origin = (typeof ORIGINS)[number];

/**
 * Access level describes what was actually read. It is never upgraded to
 * `full_verified` because a PDF exists somewhere; an abstract-only read stays
 * abstract-only.
 */
export const ACCESS_LEVELS = [
  "metadata_only",
  "abstract_only",
  "partial",
  "full_verified",
  "unavailable",
  "blocked",
] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const RETRIEVAL_STATES = [
  "queued",
  "fetching",
  "metadata_only",
  "abstract_only",
  "partial",
  "full_verified",
  "unavailable",
  "blocked",
  "retry_wait",
] as const;
export type RetrievalState = (typeof RETRIEVAL_STATES)[number];

export const EDITORIAL_STATES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "superseded",
] as const;
export type EditorialState = (typeof EDITORIAL_STATES)[number];

/** Gate B publishes to the website channel only. */
export const CHANNELS = ["website"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Publication approvals are bound to one runtime environment and origin. */
export const ENVIRONMENTS = ["local_test", "hosted_preview", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export type SourceRecord = {
  id: string;
  kind: string;
  provider: string;
  upstreamId: string | null;
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  authors: string[] | null;
  publishedAt: string | null;
  updatedAt: string | null;
  retrievedAt: string;
  accessLevel: AccessLevel;
  retrievalState: RetrievalState;
  currentVersionId: string | null;
  privacyFlags: Record<string, unknown>;
  createdAt: string;
};

export type SourceVersionRecord = {
  id: string;
  sourceId: string;
  fingerprint: string;
  versionLabel: string | null;
  retrievedUrl: string;
  retrievedAt: string;
  sourceUpdatedAt: string | null;
  accessLevel: AccessLevel;
  outcome: RetrievalState;
  contentSha256: string | null;
  metadata: Record<string, unknown>;
  extractLocators: string[];
  backend: string | null;
  createdAt: string;
};

export type ContentItemRecord = {
  id: string;
  type: ItemType;
  slug: string;
  title: string;
  visibility: Visibility;
  currentRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Block kinds for reachable authoring (docs/2026-refresh.md §10, package 1).
 *
 * `paragraph` and `heading` are the original shapes, expressed as kinds. `callout`
 * and `figure` are the first rich kinds.
 *
 * PERSISTENCE: `blocks` is stored as JSON, so adding a kind is additive data, not a
 * schema migration. An older revision whose blocks carry no `kind` reads back with
 * the original shape (see `blockKindOf`) and is never rewritten.
 */
export const BLOCK_KINDS = ["paragraph", "heading", "callout", "figure"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const CALLOUT_TONES = ["note", "tip", "warning"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/**
 * Version of the structured block payload. Bumped when the shape of `data` changes
 * in a way a reader must understand, so a future reader can migrate deliberately
 * instead of guessing. The renderer carries its own separate version.
 */
export const BLOCK_SCHEMA_VERSION = 1;

/**
 * Kind-specific payload, validated per kind in `normaliseBlocks`. Deliberately a
 * shallow, explicit record: no executable content, no arbitrary JSX, and every
 * asset reference is a local path validated at the boundary.
 */
export type BlockData = {
  /** callout — visual tone; the word is still rendered for assistive tech */
  tone?: CalloutTone;
  /** callout / figure — optional short label */
  title?: string;
  /** figure — local asset path under /public */
  src?: string;
  /** figure — required alternative text */
  alt?: string;
  /** figure — optional caption */
  caption?: string;
};

/**
 * Block schema versions this build can read. A block that carries a version outside this
 * list is rejected rather than stored, so a shape this reader does not understand is never
 * persisted where it would be silently misinterpreted.
 */
export const SUPPORTED_BLOCK_SCHEMA_VERSIONS: readonly number[] = [BLOCK_SCHEMA_VERSION];

/**
 * A stable block. `humanLocked` marks text Steven authored or accepted: it must
 * survive any later regeneration byte-for-byte.
 *
 * `kind`/`data`/`blockSchemaVersion` are OPTIONAL on purpose. A block written before kinds
 * existed carries none of them, and `blockKindOf` derives its meaning at read time. Keeping
 * them optional is also what lets an unchanged legacy block re-save to exactly its original
 * content hash: `revisionContentHash` includes the kind payload only when a block has one,
 * and an approval binds that hash, so attaching it to a no-op save would invalidate an
 * approval over a change in bookkeeping rather than a change in the words.
 */
export type Block = {
  id: string;
  kind?: BlockKind;
  data?: BlockData;
  blockSchemaVersion?: number;
  section: string;
  heading: string;
  markdown: string;
  humanLocked: boolean;
  origin: Origin;
  claims: string[];
  linkedArticleRevisionId: string | null;
  publicPermissionRecordIds: string[];
};

/**
 * Read the kind of a block from any revision, including one written before kinds
 * existed. A block with an explicit kind keeps it; a legacy block is a `heading`
 * when it has a heading, otherwise a `paragraph`. This is a READ-time derivation —
 * stored blocks are never rewritten by it.
 */
export function blockKindOf(block: { kind?: unknown; heading?: unknown }): BlockKind {
  const kind = block?.kind;
  if (typeof kind === "string" && (BLOCK_KINDS as readonly string[]).includes(kind)) {
    return kind as BlockKind;
  }
  return typeof block?.heading === "string" && block.heading.trim() ? "heading" : "paragraph";
}

export type ContentRevisionRecord = {
  id: string;
  itemId: string;
  parentRevisionId: string | null;
  revisionNumber: number;
  origin: Origin;
  createdBy: string;
  createdAt: string;
  title: string;
  summary: string | null;
  byline: string | null;
  blocks: Block[];
  sourceVersionIds: string[];
  assetIds: string[];
  contentSha256: string;
  editorialState: EditorialState;
  unresolvedQuestionIds: string[];
};

export type RenderBundleRecord = {
  id: string;
  revisionId: string;
  revisionSha256: string;
  rendererVersion: string;
  manifestSha256: string;
  outputs: Record<string, string>;
  assetSha256s: string[];
  validation: Record<string, unknown>;
  createdAt: string;
};

export const APPROVAL_STATES = ["approved", "invalidated", "consumed"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export type ApprovalRecord = {
  id: string;
  humanSubjectId: string;
  revisionId: string;
  revisionSha256: string;
  bundleId: string;
  manifestSha256: string;
  environment: Environment;
  channels: Channel[];
  approvedAt: string;
  expiresAt: string;
  targetRef: string;
  state: ApprovalState;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
};

export const INTENT_STATES = [
  "intent_recorded",
  "committing",
  "stored",
  "verification_pending",
  "verified",
  "failed",
  "unknown",
] as const;
export type IntentState = (typeof INTENT_STATES)[number];

export type PublicationIntentRecord = {
  id: string;
  approvalId: string;
  revisionId: string;
  itemId: string;
  channel: Channel;
  environment: Environment;
  operationKey: string;
  payloadSha256: string;
  targetRef: string;
  state: IntentState;
  providerRecordId: string | null;
  attemptCount: number;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  verifiedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OutboxJobRecord = {
  id: string;
  intentId: string;
  operationKey: string;
  state: IntentState;
  attemptCount: number;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};
