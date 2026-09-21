// Gate B / S04a: source, capture-event and immutable source-version records.
//
// Mutating functions require an open transaction (assertInTransaction) so a
// caller cannot half-apply a capture. Reads are plain queries.

import type { EditorDatabase } from "./store";

import { EditorError } from "../contracts/errors";
import { hashCanonical } from "../contracts/hash";
import type {
  AccessLevel,
  RetrievalState,
  SourceRecord,
  SourceVersionRecord,
} from "../contracts/types";
import { validateSourceInput, type ManualSourceInput } from "../validation/source";
import {
  ID_PREFIXES,
  assertInTransaction,
  newId,
  nowIso,
  parseJsonColumn,
} from "./store";

type SourceRow = {
  id: string;
  kind: string;
  provider: string;
  upstream_id: string | null;
  canonical_url: string;
  original_url: string;
  title: string;
  authors: string | null;
  published_at: string | null;
  updated_at: string | null;
  retrieved_at: string;
  access_level: string;
  retrieval_state: string;
  current_version_id: string | null;
  privacy_flags: string;
  created_at: string;
};

type SourceVersionRow = {
  id: string;
  source_id: string;
  fingerprint: string;
  version_label: string | null;
  retrieved_url: string;
  retrieved_at: string;
  source_updated_at: string | null;
  access_level: string;
  outcome: string;
  content_sha256: string | null;
  metadata: string;
  extract_locators: string;
  backend: string | null;
  created_at: string;
};

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: String(row.id),
    kind: String(row.kind),
    provider: String(row.provider),
    upstreamId: row.upstream_id === null ? null : String(row.upstream_id),
    canonicalUrl: String(row.canonical_url),
    originalUrl: String(row.original_url),
    title: String(row.title),
    authors: parseJsonColumn<string[] | null>(row.authors, null),
    publishedAt: row.published_at === null ? null : String(row.published_at),
    updatedAt: row.updated_at === null ? null : String(row.updated_at),
    retrievedAt: String(row.retrieved_at),
    accessLevel: String(row.access_level) as AccessLevel,
    retrievalState: String(row.retrieval_state) as RetrievalState,
    currentVersionId: row.current_version_id === null ? null : String(row.current_version_id),
    privacyFlags: parseJsonColumn<Record<string, unknown>>(row.privacy_flags, {}),
    createdAt: String(row.created_at),
  };
}

function mapSourceVersion(row: SourceVersionRow): SourceVersionRecord {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    fingerprint: String(row.fingerprint),
    versionLabel: row.version_label === null ? null : String(row.version_label),
    retrievedUrl: String(row.retrieved_url),
    retrievedAt: String(row.retrieved_at),
    sourceUpdatedAt: row.source_updated_at === null ? null : String(row.source_updated_at),
    accessLevel: String(row.access_level) as AccessLevel,
    outcome: String(row.outcome) as RetrievalState,
    contentSha256: row.content_sha256 === null ? null : String(row.content_sha256),
    metadata: parseJsonColumn<Record<string, unknown>>(row.metadata, {}),
    extractLocators: parseJsonColumn<string[]>(row.extract_locators, []),
    backend: row.backend === null ? null : String(row.backend),
    createdAt: String(row.created_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

export type CreateSourceOptions = {
  origin?: "human" | "fixture";
  adapter?: string;
  now?: string;
};

export type CreateSourceResult = {
  source: SourceRecord;
  captureEventId: string;
};

/**
 * Create a source plus its capture event, then its first (immutable) version.
 * All four writes are one transaction: a capture that fails part-way leaves no
 * source behind.
 */
export async function createSourceWithCapture(
  db: EditorDatabase,
  input: ManualSourceInput,
  options: CreateSourceOptions = {},
): Promise<CreateSourceResult> {
  assertInTransaction(db, "createSourceWithCapture");
  const clean = validateSourceInput(input);
  const now = options.now ?? nowIso();
  const origin = options.origin ?? "human";
  const adapter = options.adapter ?? "manual-source";

  const sourceId = newId(ID_PREFIXES.source);
  try {
    await db.prepare(
      `INSERT INTO sources (
         id, kind, provider, upstream_id, canonical_url, original_url, title, authors,
         published_at, updated_at, retrieved_at, access_level, retrieval_state,
         current_version_id, privacy_flags, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      sourceId,
      clean.kind,
      clean.provider,
      clean.upstreamId,
      clean.canonicalUrl,
      clean.canonicalUrl,
      clean.title,
      clean.authors === null ? null : JSON.stringify(clean.authors),
      clean.publishedAt,
      clean.updatedAt,
      now,
      clean.accessLevel,
      clean.accessLevel,
      JSON.stringify({}),
      now,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EditorError("DUPLICATE_SOURCE", "That provider identity is already captured", {
        provider: clean.provider,
        upstreamId: clean.upstreamId,
      });
    }
    throw error;
  }

  const captureEventId = newId(ID_PREFIXES.captureEvent);
  await db.prepare(
    `INSERT INTO capture_events (
       id, source_id, adapter, captured_at, origin, note, referring_url, upstream_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    captureEventId,
    sourceId,
    adapter,
    now,
    origin,
    clean.note,
    clean.referringUrl,
    clean.upstreamId,
  );

  // The first retrieval is recorded as an immutable version immediately, so a
  // source never exists without provenance.
  await recordSourceVersion(db, {
    sourceId,
    fingerprint: sourceFingerprint({
      provider: clean.provider,
      upstreamId: clean.upstreamId,
      canonicalUrl: clean.canonicalUrl,
      versionLabel: null,
    }),
    versionLabel: null,
    retrievedUrl: clean.canonicalUrl,
    retrievedAt: now,
    sourceUpdatedAt: clean.updatedAt,
    accessLevel: clean.accessLevel,
    outcome: clean.accessLevel,
    contentSha256: null,
    metadata: { title: clean.title, authors: clean.authors },
    extractLocators: [],
    backend: adapter,
  });

  const source = await getSource(db, sourceId);
  if (!source) {
    throw new EditorError("INTERNAL", "source vanished immediately after insert");
  }
  return { source, captureEventId };
}

/** Stable identity of one retrieval of one source. */
export function sourceFingerprint(input: {
  provider: string;
  upstreamId: string | null;
  canonicalUrl: string;
  versionLabel: string | null;
}): string {
  return hashCanonical({
    provider: input.provider,
    upstreamId: input.upstreamId,
    canonicalUrl: input.canonicalUrl,
    versionLabel: input.versionLabel,
  });
}

export type RecordSourceVersionInput = {
  sourceId: string;
  fingerprint: string;
  versionLabel?: string | null;
  retrievedUrl: string;
  retrievedAt?: string;
  sourceUpdatedAt?: string | null;
  accessLevel: AccessLevel;
  outcome?: RetrievalState;
  contentSha256?: string | null;
  metadata?: Record<string, unknown>;
  extractLocators?: string[];
  backend?: string | null;
};

/**
 * Append an immutable source version. A repeated fingerprint is a duplicate, not
 * an update — history is never rewritten.
 */
export async function recordSourceVersion(
  db: EditorDatabase,
  input: RecordSourceVersionInput,
): Promise<SourceVersionRecord> {
  assertInTransaction(db, "recordSourceVersion");
  const source = await getSource(db, input.sourceId);
  if (!source) {
    throw new EditorError("NOT_FOUND", "source not found", { sourceId: input.sourceId });
  }
  const now = input.retrievedAt ?? nowIso();
  const id = newId(ID_PREFIXES.sourceVersion);
  try {
    await db.prepare(
      `INSERT INTO source_versions (
         id, source_id, fingerprint, version_label, retrieved_url, retrieved_at,
         source_updated_at, access_level, outcome, content_sha256, metadata,
         extract_locators, backend, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.sourceId,
      input.fingerprint,
      input.versionLabel ?? null,
      input.retrievedUrl,
      now,
      input.sourceUpdatedAt ?? null,
      input.accessLevel,
      input.outcome ?? input.accessLevel,
      input.contentSha256 ?? null,
      JSON.stringify(input.metadata ?? {}),
      JSON.stringify(input.extractLocators ?? []),
      input.backend ?? null,
      now,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EditorError(
        "DUPLICATE_SOURCE_VERSION",
        "That source version fingerprint is already recorded",
        { sourceId: input.sourceId, fingerprint: input.fingerprint },
      );
    }
    throw error;
  }

  await db.prepare(`UPDATE sources SET current_version_id = ? WHERE id = ?`).run(id, input.sourceId);

  const version = await getSourceVersion(db, id);
  if (!version) {
    throw new EditorError("INTERNAL", "source version vanished immediately after insert");
  }
  return version;
}

export async function getSource(db: EditorDatabase, id: string): Promise<SourceRecord | null> {
  const row = await db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as
    | SourceRow
    | undefined;
  return row ? mapSource(row) : null;
}

export async function getSourceByUpstream(
  db: EditorDatabase,
  provider: string,
  upstreamId: string,
): Promise<SourceRecord | null> {
  const row = await db
    .prepare(`SELECT * FROM sources WHERE provider = ? AND upstream_id = ?`)
    .get(provider, upstreamId) as SourceRow | undefined;
  return row ? mapSource(row) : null;
}

export async function getSourceVersion(db: EditorDatabase, id: string): Promise<SourceVersionRecord | null> {
  const row = await db.prepare(`SELECT * FROM source_versions WHERE id = ?`).get(id) as
    | SourceVersionRow
    | undefined;
  return row ? mapSourceVersion(row) : null;
}

export async function listSourceVersions(db: EditorDatabase, sourceId: string): Promise<SourceVersionRecord[]> {
  const rows = await db
    .prepare(`SELECT * FROM source_versions WHERE source_id = ? ORDER BY created_at, id`)
    .all(sourceId) as unknown as SourceVersionRow[];
  return rows.map(mapSourceVersion);
}

export async function listSources(db: EditorDatabase): Promise<SourceRecord[]> {
  const rows = await db.prepare(`SELECT * FROM sources ORDER BY created_at, id`).all() as unknown as
    SourceRow[];
  return rows.map(mapSource);
}

export async function countCaptureEvents(db: EditorDatabase, sourceId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM capture_events WHERE source_id = ?`)
    .get(sourceId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}
