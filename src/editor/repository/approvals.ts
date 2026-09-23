// Gate B / S04b: approvals.
//
// An approval binds exact bytes. The server re-derives every hash from what is
// actually stored and refuses a submitted value that disagrees, so an approval
// can never be created for content that was not rendered and validated. A
// changed revision invalidates the approval in the same transaction that stores
// the change (see src/editor/revision/service.ts), and a stale approval cannot
// be used to publish.

import type { EditorDatabase } from "./store";

import { EditorError } from "../contracts/errors";
import type { ApprovalRecord, ApprovalState, Channel, Environment } from "../contracts/types";
import { CHANNELS, ENVIRONMENTS } from "../contracts/types";
import { assertApprovalTarget } from "../validation/target";
import { getRevision } from "./revisions";
import { ID_PREFIXES, assertInTransaction, newId, nowIso, parseJsonColumn } from "./store";

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

type ApprovalRow = {
  id: string;
  human_subject_id: string;
  revision_id: string;
  revision_sha256: string;
  bundle_id: string;
  manifest_sha256: string;
  environment: string;
  channels: string;
  target_ref: string;
  approved_at: string;
  expires_at: string;
  state: string;
  invalidated_at: string | null;
  invalidated_reason: string | null;
};

function mapApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: String(row.id),
    humanSubjectId: String(row.human_subject_id),
    revisionId: String(row.revision_id),
    revisionSha256: String(row.revision_sha256),
    bundleId: String(row.bundle_id),
    manifestSha256: String(row.manifest_sha256),
    environment: String(row.environment) as Environment,
    channels: parseJsonColumn<Channel[]>(row.channels, []),
    targetRef: String(row.target_ref),
    approvedAt: String(row.approved_at),
    expiresAt: String(row.expires_at),
    state: String(row.state) as ApprovalState,
    invalidatedAt: row.invalidated_at === null ? null : String(row.invalidated_at),
    invalidatedReason:
      row.invalidated_reason === null ? null : String(row.invalidated_reason),
  };
}

export type CreateApprovalInput = {
  /** The authenticated human whose action this is. Never a capture token. */
  humanSubjectId: string;
  revisionId: string;
  /** Hashes the client believes it is approving. Verified, not trusted. */
  revisionSha256: string;
  manifestSha256: string;
  environment?: Environment;
  channels?: Channel[];
  /** Exact origin approved for this runtime environment. */
  targetRef: string;
  ttlMs?: number;
  now?: string;
};

export async function createApproval(db: EditorDatabase, input: CreateApprovalInput): Promise<ApprovalRecord> {
  assertInTransaction(db, "createApproval");

  const subject = String(input.humanSubjectId ?? "").trim();
  if (!subject) {
    throw new EditorError("SESSION_REQUIRED", "An approval requires an identified human subject");
  }

  const revision = await getRevision(db, input.revisionId);
  if (!revision) {
    throw new EditorError("NOT_FOUND", "revision not found", { revisionId: input.revisionId });
  }
  const bundleRef = await getBundleForRevisionId(db, revision.id);
  if (!bundleRef) {
    throw new EditorError("APPROVAL_INVALID", "Revision has no render bundle to approve", {
      revisionId: revision.id,
    });
  }
  return await createApprovalWithBundle(
    db,
    input,
    revision.contentSha256,
    bundleRef.id,
    bundleRef.manifestSha256,
    subject,
  );
}

async function getBundleForRevisionId(db: EditorDatabase, revisionId: string) {
  const row = await db
    .prepare(`SELECT * FROM render_bundles WHERE revision_id = ?`)
    .get(revisionId) as { id: string; manifest_sha256: string } | undefined;
  if (!row) return null;
  return { id: String(row.id), manifestSha256: String(row.manifest_sha256) };
}

async function createApprovalWithBundle(
  db: EditorDatabase,
  input: CreateApprovalInput,
  storedRevisionSha256: string,
  bundleId: string,
  storedManifestSha256: string,
  subject: string,
): Promise<ApprovalRecord> {
  // The server's own hashes win. A mismatch means the client approved something
  // other than what is stored, which is a refusal, not a correction.
  if (String(input.revisionSha256 ?? "") !== storedRevisionSha256) {
    throw new EditorError(
      "APPROVAL_REVISION_MISMATCH",
      "Approval revision hash does not match the stored revision",
      { submitted: input.revisionSha256, stored: storedRevisionSha256 },
    );
  }
  if (String(input.manifestSha256 ?? "") !== storedManifestSha256) {
    throw new EditorError(
      "APPROVAL_REVISION_MISMATCH",
      "Approval manifest hash does not match the stored bundle",
      { submitted: input.manifestSha256, stored: storedManifestSha256 },
    );
  }

  const environment = (input.environment ?? "local_test") as Environment;
  if (!ENVIRONMENTS.includes(environment)) {
    throw new EditorError("VALIDATION_FAILED", "unknown environment", { environment });
  }
  const channels = input.channels ?? ["website"];
  if (channels.length === 0) {
    throw new EditorError("VALIDATION_FAILED", "at least one channel is required");
  }
  for (const channel of channels) {
    if (!CHANNELS.includes(channel)) {
      throw new EditorError("VALIDATION_FAILED", "Gate B approves the website channel only", {
        channel,
      });
    }
  }

  const targetRef = assertApprovalTarget(input.targetRef, environment);
  const now = input.now ?? nowIso();
  const expiresAt = new Date(
    Date.parse(now) + (input.ttlMs ?? APPROVAL_TTL_MS),
  ).toISOString();

  const id = newId(ID_PREFIXES.approval);
  await db.prepare(
    `INSERT INTO approvals (
       id, human_subject_id, revision_id, revision_sha256, bundle_id, manifest_sha256,
       environment, channels, target_ref, approved_at, expires_at, state,
       invalidated_at, invalidated_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', NULL, NULL)`,
  ).run(
    id,
    subject,
    input.revisionId,
    storedRevisionSha256,
    bundleId,
    storedManifestSha256,
    environment,
    JSON.stringify(channels),
    targetRef,
    now,
    expiresAt,
  );

  const approval = await getApproval(db, id);
  if (!approval) {
    throw new EditorError("INTERNAL", "approval vanished immediately after insert");
  }
  return approval;
}

export async function getApproval(db: EditorDatabase, id: string): Promise<ApprovalRecord | null> {
  const row = await db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as
    | ApprovalRow
    | undefined;
  return row ? mapApproval(row) : null;
}

export async function listApprovalsForRevision(
  db: EditorDatabase,
  revisionId: string,
): Promise<ApprovalRecord[]> {
  const rows = await db
    .prepare(`SELECT * FROM approvals WHERE revision_id = ? ORDER BY approved_at DESC`)
    .all(revisionId) as unknown as ApprovalRow[];
  return rows.map(mapApproval);
}

/**
 * Invalidate every live approval for every revision of an item. Called inside
 * the same transaction that stores a new revision, which is what makes "a
 * changed artifact invalidates approval" true rather than aspirational.
 */
export async function invalidateApprovalsForItem(
  db: EditorDatabase,
  itemId: string,
  reason: string,
  now = nowIso(),
): Promise<number> {
  assertInTransaction(db, "invalidateApprovalsForItem");
  const result = await db
    .prepare(
      `UPDATE approvals
          SET state = 'invalidated', invalidated_at = ?, invalidated_reason = ?
        WHERE state = 'approved'
          AND revision_id IN (SELECT id FROM content_revisions WHERE item_id = ?)`,
    )
    .run(now, reason, itemId);
  return Number(result.changes ?? 0);
}

export type UseApprovalInput = {
  approvalId: string;
  itemId: string;
  revisionId: string;
  channel: Channel;
  environment: Environment;
  targetRef: string;
  now?: string;
};

/**
 * Validate an approval for immediate use. Deny-first: an invalidated, expired,
 * mismatched or wrong-target approval is refused with no side effect.
 */
export async function assertApprovalUsable(
  db: EditorDatabase,
  input: UseApprovalInput,
): Promise<ApprovalRecord> {
  const approval = await getApproval(db, input.approvalId);
  if (!approval) {
    throw new EditorError("APPROVAL_INVALID", "approval not found", {
      approvalId: input.approvalId,
    });
  }
  if (approval.state === "invalidated") {
    throw new EditorError("APPROVAL_INVALIDATED", "That approval was invalidated by a later change", {
      approvalId: approval.id,
      reason: approval.invalidatedReason,
    });
  }
  if (approval.state !== "approved") {
    throw new EditorError("APPROVAL_INVALID", "approval is not in a usable state", {
      state: approval.state,
    });
  }
  const now = input.now ?? nowIso();
  if (Date.parse(approval.expiresAt) <= Date.parse(now)) {
    throw new EditorError("APPROVAL_EXPIRED", "approval has expired", {
      expiresAt: approval.expiresAt,
    });
  }
  if (approval.revisionId !== input.revisionId) {
    throw new EditorError("APPROVAL_REVISION_MISMATCH", "approval names a different revision", {
      approvalRevisionId: approval.revisionId,
      requestedRevisionId: input.revisionId,
    });
  }
  if (!approval.channels.includes(input.channel)) {
    throw new EditorError("APPROVAL_INVALID", "approval does not cover this channel", {
      channel: input.channel,
    });
  }
  if (approval.environment !== input.environment) {
    throw new EditorError("APPROVAL_INVALID", "approval names a different environment", {
      approvalEnvironment: approval.environment,
      requestedEnvironment: input.environment,
    });
  }
  const requestedTarget = assertApprovalTarget(input.targetRef, input.environment);
  if (approval.targetRef !== requestedTarget) {
    throw new EditorError("TARGET_NOT_ALLOWED", "approval names a different target", {
      approvalTarget: approval.targetRef,
      requestedTarget,
    });
  }
  if (approval.humanSubjectId.trim().length === 0) {
    throw new EditorError("APPROVAL_INVALID", "approval has no human subject");
  }
  return approval;
}

export async function consumeApproval(db: EditorDatabase, approvalId: string): Promise<void> {
  assertInTransaction(db, "consumeApproval");
  await db.prepare(`UPDATE approvals SET state = 'consumed' WHERE id = ? AND state = 'approved'`).run(
    approvalId,
  );
}
