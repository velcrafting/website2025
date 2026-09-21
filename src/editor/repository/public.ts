// Gate B: the published projection.
//
// Public routes read ONLY this projection. An item becomes readable when all of
// the following hold, in the database:
//   - the item is an `issue` with visibility `public`;
//   - a published pointer exists;
//   - a render bundle exists for exactly that revision;
//   - a website publication intent for that item+revision reached a COMMITTED
//     state.
//
// "Committed" means the pointer moved, i.e. any state after `committing`:
// stored / verification_pending / verified / failed / unknown. The pre-commit
// states (`intent_recorded`, `committing`) are excluded, so an intent that never
// reached commit cannot publish anything.
//
// Verification is deliberately NOT a visibility gate. The packet is explicit
// that the approved committed pointer may serve the article while verification is
// pending — otherwise verifying the public response would be circular — and a
// failure is an operational state to reconcile, not a reason to retract a live
// page on a monitoring artifact. `intentState` is exposed so the operator sees
// whether verification succeeded.
//
// The pointer is only ever written by the publisher in the same transaction as
// the intent, so "pointer set" and "intent committed" cannot drift apart.

import type { EditorDatabase } from "./store";

import type { Block, Environment, IntentState } from "../contracts/types";
import { parseJsonColumn } from "./store";

/** Intent states that mean "the published pointer was committed". */
export const COMMITTED_INTENT_STATES: IntentState[] = [
  "stored",
  "verification_pending",
  "verified",
  "failed",
  "unknown",
];

export type PublicIssue = {
  itemId: string;
  slug: string;
  title: string;
  summary: string | null;
  byline: string | null;
  revisionId: string;
  revisionSha256: string;
  manifestSha256: string;
  rendererVersion: string;
  intentState: IntentState;
  verifiedAt: string | null;
  blocks: Block[];
};

type PublicIssueRow = {
  item_id: string;
  slug: string;
  title: string;
  summary: string | null;
  byline: string | null;
  published_revision_id: string;
  content_sha256: string;
  blocks: string;
  manifest_sha256: string;
  renderer_version: string;
  state: string;
  verified_at: string | null;
};

const PROJECTION_SQL = `
  SELECT i.id            AS item_id,
         i.slug          AS slug,
         i.title         AS title,
         r.summary       AS summary,
         r.byline        AS byline,
         i.published_revision_id AS published_revision_id,
         r.content_sha256 AS content_sha256,
         r.blocks        AS blocks,
         b.manifest_sha256 AS manifest_sha256,
         b.renderer_version AS renderer_version,
         n.state         AS state,
         n.verified_at   AS verified_at
  FROM content_items i
  JOIN content_revisions r ON r.id = i.published_revision_id
  JOIN render_bundles   b ON b.revision_id = r.id
  JOIN publication_intents n ON n.revision_id = r.id AND n.item_id = i.id
  WHERE i.type = 'issue'
    AND i.visibility = 'public'
    AND i.published_revision_id IS NOT NULL
    AND n.channel = 'website'
    AND n.environment = ?
    AND n.state IN ('stored','verification_pending','verified','failed','unknown')
`;

function mapIssue(row: PublicIssueRow): PublicIssue {
  return {
    itemId: String(row.item_id),
    slug: String(row.slug),
    title: String(row.title),
    summary: row.summary === null ? null : String(row.summary),
    byline: row.byline === null ? null : String(row.byline),
    revisionId: String(row.published_revision_id),
    revisionSha256: String(row.content_sha256),
    manifestSha256: String(row.manifest_sha256),
    rendererVersion: String(row.renderer_version),
    intentState: String(row.state) as IntentState,
    verifiedAt: row.verified_at === null ? null : String(row.verified_at),
    blocks: parseJsonColumn<Block[]>(row.blocks, []),
  };
}

export async function listPublicIssues(
  db: EditorDatabase,
  environment: Environment = "local_test",
): Promise<PublicIssue[]> {
  const rows = await db
    .prepare(`${PROJECTION_SQL} ORDER BY i.updated_at DESC, i.slug`)
    .all(environment) as unknown as PublicIssueRow[];
  return rows.map(mapIssue);
}

export async function getPublicIssue(
  db: EditorDatabase,
  slug: string,
  environment: Environment = "local_test",
): Promise<PublicIssue | null> {
  const row = await db
    .prepare(`${PROJECTION_SQL} AND i.slug = ? LIMIT 1`)
    .get(environment, slug) as PublicIssueRow | undefined;
  return row ? mapIssue(row) : null;
}

// ---------------------------------------------------------------------------
// Reader-visible provenance.
//
// A revision pins the exact source versions it was written from. This is the
// structured link R10 asks for, and it is what the public page renders as source
// references with an honest access label. A revision with no pinned versions
// returns an empty list — the page must say so plainly rather than implying the
// claims are sourced.

export type RevisionProvenance = {
  sourceId: string;
  versionId: string;
  provider: string;
  upstreamId: string | null;
  sourceTitle: string;
  canonicalUrl: string;
  retrievedUrl: string;
  retrievedAt: string;
  versionLabel: string | null;
  accessLevel: string;
};

type ProvenanceRow = {
  source_id: string;
  version_id: string;
  provider: string;
  upstream_id: string | null;
  source_title: string;
  canonical_url: string;
  retrieved_url: string;
  retrieved_at: string;
  version_label: string | null;
  access_level: string;
};

export async function listProvenanceForRevision(
  db: EditorDatabase,
  revisionId: string,
): Promise<RevisionProvenance[]> {
  const revision = await db
    .prepare(`SELECT source_version_ids FROM content_revisions WHERE id = ?`)
    .get(revisionId) as { source_version_ids: string } | undefined;
  if (!revision) return [];
  const versionIds = parseJsonColumn<string[]>(revision.source_version_ids, []);
  if (versionIds.length === 0) return [];

  const placeholders = versionIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT sv.source_id       AS source_id,
              sv.id              AS version_id,
              s.provider         AS provider,
              s.upstream_id      AS upstream_id,
              s.title            AS source_title,
              s.canonical_url    AS canonical_url,
              sv.retrieved_url   AS retrieved_url,
              sv.retrieved_at    AS retrieved_at,
              sv.version_label   AS version_label,
              sv.access_level    AS access_level
         FROM source_versions sv
         JOIN sources s ON s.id = sv.source_id
        WHERE sv.id IN (${placeholders})
        ORDER BY sv.retrieved_at, sv.id`,
    )
    .all(...versionIds) as unknown as ProvenanceRow[];

  return rows.map((row) => ({
    sourceId: String(row.source_id),
    versionId: String(row.version_id),
    provider: String(row.provider),
    upstreamId: row.upstream_id === null ? null : String(row.upstream_id),
    sourceTitle: String(row.source_title),
    canonicalUrl: String(row.canonical_url),
    retrievedUrl: String(row.retrieved_url),
    retrievedAt: String(row.retrieved_at),
    versionLabel: row.version_label === null ? null : String(row.version_label),
    accessLevel: String(row.access_level),
  }));
}

/**
 * Reader-facing wording for an access level. It never upgrades what was read: a
 * metadata-only source stays visibly metadata-only.
 */
export function accessLevelLabel(accessLevel: string): string {
  switch (accessLevel) {
    case "full_verified":
      return "Full text read";
    case "partial":
      return "Partial text read";
    case "abstract_only":
      return "Abstract only — full text was not read";
    case "metadata_only":
      return "Metadata only — full text was not read";
    case "unavailable":
      return "Source unavailable at retrieval";
    case "blocked":
      return "Retrieval blocked";
    default:
      return `Access level: ${accessLevel}`;
  }
}
