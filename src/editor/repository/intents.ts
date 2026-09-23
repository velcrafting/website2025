// Gate B / S04b: publication intents, results and the published pointer.
//
// An intent is one logical publication. It is inserted in the SAME transaction
// as its outbox job, and its `operation_key` is unique, so a retry reads the
// existing intent instead of creating a second logical publication.

import type { EditorDatabase } from "./store";

import { EditorError } from "../contracts/errors";
import type {
  Channel,
  Environment,
  IntentState,
  PublicationIntentRecord,
} from "../contracts/types";
import { ID_PREFIXES, assertInTransaction, newId, nowIso } from "./store";
import { getApproval } from "./approvals";
import { PostgresEditorDatabase } from "./postgres";

type IntentRow = {
  id: string;
  approval_id: string;
  revision_id: string;
  item_id: string;
  channel: string;
  environment: string;
  operation_key: string;
  payload_sha256: string;
  target_ref: string;
  state: string;
  provider_record_id: string | null;
  attempt_count: number;
  lease_token: string | null;
  lease_expires_at: string | null;
  verified_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

function mapIntent(row: IntentRow): PublicationIntentRecord {
  return {
    id: String(row.id),
    approvalId: String(row.approval_id),
    revisionId: String(row.revision_id),
    itemId: String(row.item_id),
    channel: String(row.channel) as Channel,
    environment: String(row.environment) as Environment,
    operationKey: String(row.operation_key),
    payloadSha256: String(row.payload_sha256),
    targetRef: String(row.target_ref),
    state: String(row.state) as IntentState,
    providerRecordId: row.provider_record_id === null ? null : String(row.provider_record_id),
    attemptCount: Number(row.attempt_count),
    leaseToken: row.lease_token === null ? null : String(row.lease_token),
    leaseExpiresAt: row.lease_expires_at === null ? null : String(row.lease_expires_at),
    verifiedAt: row.verified_at === null ? null : String(row.verified_at),
    lastErrorCode: row.last_error_code === null ? null : String(row.last_error_code),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

/** The canonical operation key for one logical website publication. */
export function websiteOperationKey(itemId: string, revisionId: string): string {
  return `${itemId}:${revisionId}:website`;
}

export type InsertIntentInput = {
  approvalId: string;
  revisionId: string;
  itemId: string;
  channel?: Channel;
  environment?: Environment;
  operationKey: string;
  payloadSha256: string;
  targetRef: string;
  now?: string;
};

export async function insertIntentWithOutbox(
  db: EditorDatabase,
  input: InsertIntentInput,
): Promise<PublicationIntentRecord> {
  assertInTransaction(db, "insertIntentWithOutbox");

  const approval = await getApproval(db, input.approvalId);
  if (!approval) {
    throw new EditorError("APPROVAL_INVALID", "approval not found", {
      approvalId: input.approvalId,
    });
  }
  if (approval.revisionId !== input.revisionId) {
    throw new EditorError("APPROVAL_REVISION_MISMATCH", "intent revision differs from approval", {
      approvalRevisionId: approval.revisionId,
      intentRevisionId: input.revisionId,
    });
  }

  const now = input.now ?? nowIso();
  const intentId = newId(ID_PREFIXES.intent);
  try {
    await db.prepare(
      `INSERT INTO publication_intents (
         id, approval_id, revision_id, item_id, channel, environment, operation_key,
         payload_sha256, target_ref, state, provider_record_id, attempt_count,
         lease_token, lease_expires_at, verified_at, last_error_code, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'intent_recorded', NULL, 0, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(
      intentId,
      input.approvalId,
      input.revisionId,
      input.itemId,
      input.channel ?? "website",
      input.environment ?? "local_test",
      input.operationKey,
      input.payloadSha256,
      input.targetRef,
      now,
      now,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EditorError(
        "DUPLICATE_OPERATION",
        "That logical publication already has an intent",
        { operationKey: input.operationKey },
      );
    }
    throw error;
  }

  // Same transaction: an intent without its outbox row is not representable.
  await db.prepare(
    `INSERT INTO outbox_jobs (
       id, intent_id, operation_key, state, attempt_count, lease_token, lease_expires_at,
       last_error_code, created_at, updated_at
     ) VALUES (?, ?, ?, 'intent_recorded', 0, NULL, NULL, NULL, ?, ?)`,
  ).run(newId(ID_PREFIXES.outbox), intentId, input.operationKey, now, now);

  const intent = await getIntent(db, intentId);
  if (!intent) {
    throw new EditorError("INTERNAL", "intent vanished immediately after insert");
  }
  return intent;
}

export async function getIntent(db: EditorDatabase, id: string): Promise<PublicationIntentRecord | null> {
  const row = await db.prepare(`SELECT * FROM publication_intents WHERE id = ?`).get(id) as
    | IntentRow
    | undefined;
  return row ? mapIntent(row) : null;
}

export async function getIntentForUpdate(
  db: EditorDatabase,
  id: string,
): Promise<PublicationIntentRecord | null> {
  if (!(db instanceof PostgresEditorDatabase)) return getIntent(db, id);
  const row = await db.prepare(`SELECT * FROM publication_intents WHERE id = ? FOR UPDATE`).get(id) as
    | IntentRow
    | undefined;
  return row ? mapIntent(row) : null;
}

export async function findIntentByOperationKey(
  db: EditorDatabase,
  operationKey: string,
): Promise<PublicationIntentRecord | null> {
  const row = await db
    .prepare(`SELECT * FROM publication_intents WHERE operation_key = ?`)
    .get(operationKey) as IntentRow | undefined;
  return row ? mapIntent(row) : null;
}

export async function listIntentsForItem(
  db: EditorDatabase,
  itemId: string,
): Promise<PublicationIntentRecord[]> {
  const rows = await db
    .prepare(`SELECT * FROM publication_intents WHERE item_id = ? ORDER BY created_at DESC`)
    .all(itemId) as unknown as IntentRow[];
  return rows.map(mapIntent);
}

export async function countIntentsForRevision(db: EditorDatabase, revisionId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM publication_intents WHERE revision_id = ?`)
    .get(revisionId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export type IntentUpdate = {
  state?: IntentState;
  errorCode?: string | null;
  verifiedAt?: string | null;
  providerRecordId?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  incrementAttempt?: boolean;
  now?: string;
};

/**
 * Update intent and outbox state together. Fencing: when a lease token is
 * supplied it must still be the live token, so a timed-out worker cannot write
 * after a newer worker claimed the job.
 */
export async function updateIntentState(
  db: EditorDatabase,
  intentId: string,
  update: IntentUpdate,
): Promise<PublicationIntentRecord> {
  assertInTransaction(db, "updateIntentState");
  const intent = await getIntentForUpdate(db, intentId);
  if (!intent) {
    throw new EditorError("NOT_FOUND", "intent not found", { intentId });
  }
  const now = update.now ?? nowIso();

  if (update.leaseToken !== undefined && update.leaseToken !== null) {
    if (intent.leaseToken !== update.leaseToken) {
      throw new EditorError("LEASE_HELD", "This job is owned by another attempt", {
        intentId,
        expected: intent.leaseToken,
        supplied: update.leaseToken,
      });
    }
  }

  const nextState = update.state ?? intent.state;
  await db.prepare(
    `UPDATE publication_intents
        SET state = ?,
            provider_record_id = COALESCE(?, provider_record_id),
            attempt_count = attempt_count + ?,
            lease_token = ?,
            lease_expires_at = ?,
            verified_at = COALESCE(?, verified_at),
            last_error_code = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    nextState,
    update.providerRecordId ?? null,
    update.incrementAttempt ? 1 : 0,
    update.leaseToken === undefined ? intent.leaseToken : update.leaseToken,
    update.leaseExpiresAt === undefined ? intent.leaseExpiresAt : update.leaseExpiresAt,
    update.verifiedAt ?? null,
    update.errorCode === undefined ? intent.lastErrorCode : update.errorCode,
    now,
    intentId,
  );

  await db.prepare(
    `UPDATE outbox_jobs
        SET state = ?,
            attempt_count = attempt_count + ?,
            lease_token = ?,
            lease_expires_at = ?,
            last_error_code = ?,
            updated_at = ?
      WHERE intent_id = ?`,
  ).run(
    nextState,
    update.incrementAttempt ? 1 : 0,
    update.leaseToken === undefined ? intent.leaseToken : update.leaseToken,
    update.leaseExpiresAt === undefined ? intent.leaseExpiresAt : update.leaseExpiresAt,
    update.errorCode === undefined ? intent.lastErrorCode : update.errorCode,
    now,
    intentId,
  );

  const updated = await getIntent(db, intentId);
  if (!updated) {
    throw new EditorError("INTERNAL", "intent disappeared during update");
  }
  return updated;
}

/**
 * Set the published pointer. Only the publisher calls this, in the same
 * transaction as the committed intent, which is why the projection can trust the
 * pointer on its own.
 */
export async function setPublishedPointer(
  db: EditorDatabase,
  itemId: string,
  revisionId: string,
  now = nowIso(),
): Promise<void> {
  assertInTransaction(db, "setPublishedPointer");
  const result = await db
    .prepare(
      `UPDATE content_items
          SET published_revision_id = ?, visibility = 'public', updated_at = ?
        WHERE id = ?`,
    )
    .run(revisionId, now, itemId);
  if (Number(result.changes ?? 0) !== 1) {
    throw new EditorError("NOT_FOUND", "item not found while setting the published pointer", {
      itemId,
    });
  }
}

export type RecordResultInput = {
  intentId: string;
  state: IntentState;
  httpStatus?: number | null;
  responseSha256?: string | null;
  revisionMarker?: string | null;
  canonicalUrl?: string | null;
  notes?: string | null;
  now?: string;
};

export async function recordPublicationResult(db: EditorDatabase, input: RecordResultInput): Promise<string> {
  assertInTransaction(db, "recordPublicationResult");
  const id = newId("result");
  await db.prepare(
    `INSERT INTO publication_results (
       id, intent_id, observed_at, state, http_status, response_sha256, revision_marker,
       canonical_url, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.intentId,
    input.now ?? nowIso(),
    input.state,
    input.httpStatus ?? null,
    input.responseSha256 ?? null,
    input.revisionMarker ?? null,
    input.canonicalUrl ?? null,
    input.notes ?? null,
  );
  return id;
}

export async function listPublicationResults(db: EditorDatabase, intentId: string): Promise<Array<{
  state: string;
  httpStatus: number | null;
  revisionMarker: string | null;
  observedAt: string;
}>> {
  const rows = await db
    .prepare(
      `SELECT state, http_status, revision_marker, observed_at
         FROM publication_results WHERE intent_id = ? ORDER BY observed_at`,
    )
    .all(intentId) as unknown as Array<{
    state: string;
    http_status: number | null;
    revision_marker: string | null;
    observed_at: string;
  }>;
  return rows.map((row) => ({
    state: String(row.state),
    httpStatus: row.http_status === null ? null : Number(row.http_status),
    revisionMarker: row.revision_marker === null ? null : String(row.revision_marker),
    observedAt: String(row.observed_at),
  }));
}
