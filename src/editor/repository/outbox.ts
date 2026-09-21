// Gate B / S04b: outbox job leases.
//
// One executor claims a job at a time. Claims are fenced with a token and an
// expiry: a worker that timed out cannot write after a newer worker took over,
// and a claim on a live lease is refused rather than queued.

import type { EditorDatabase } from "./store";

import { EditorError } from "../contracts/errors";
import type { IntentState, OutboxJobRecord } from "../contracts/types";
import { assertInTransaction, nowIso } from "./store";
import { PostgresEditorDatabase } from "./postgres";
import { getIntentForUpdate } from "./intents";

export const DEFAULT_LEASE_MS = 30_000;

type OutboxRow = {
  id: string;
  intent_id: string;
  operation_key: string;
  state: string;
  attempt_count: number;
  lease_token: string | null;
  lease_expires_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

function mapJob(row: OutboxRow): OutboxJobRecord {
  return {
    id: String(row.id),
    intentId: String(row.intent_id),
    operationKey: String(row.operation_key),
    state: String(row.state) as IntentState,
    attemptCount: Number(row.attempt_count),
    leaseToken: row.lease_token === null ? null : String(row.lease_token),
    leaseExpiresAt: row.lease_expires_at === null ? null : String(row.lease_expires_at),
    lastErrorCode: row.last_error_code === null ? null : String(row.last_error_code),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getOutboxJobForIntent(
  db: EditorDatabase,
  intentId: string,
): Promise<OutboxJobRecord | null> {
  const row = await db.prepare(`SELECT * FROM outbox_jobs WHERE intent_id = ?`).get(intentId) as
    | OutboxRow
    | undefined;
  return row ? mapJob(row) : null;
}

export async function getOutboxJobForUpdate(
  db: EditorDatabase,
  intentId: string,
): Promise<OutboxJobRecord | null> {
  if (!(db instanceof PostgresEditorDatabase)) return getOutboxJobForIntent(db, intentId);
  const row = await db.prepare(`SELECT * FROM outbox_jobs WHERE intent_id = ? FOR UPDATE`).get(intentId) as
    | OutboxRow
    | undefined;
  return row ? mapJob(row) : null;
}

export type ClaimResult = {
  job: OutboxJobRecord;
  intentId: string;
  leaseToken: string;
  leaseExpiresAt: string;
};

/**
 * Claim the job for `intentId`. Refuses when a live (unexpired) lease is held by
 * a different token. A stale worker's token therefore cannot make progress.
 */
export async function claimLease(
  db: EditorDatabase,
  intentId: string,
  options: { leaseToken: string; ttlMs?: number; now?: string; state?: IntentState } = {
    leaseToken: "",
  },
): Promise<ClaimResult> {
  assertInTransaction(db, "claimLease");
  const token = String(options.leaseToken ?? "");
  if (!token) {
    throw new EditorError("VALIDATION_FAILED", "a lease token is required");
  }
  const intent = await getIntentForUpdate(db, intentId);
  if (!intent) throw new EditorError("NOT_FOUND", "intent not found", { intentId });
  const job = await getOutboxJobForUpdate(db, intentId);
  if (!job) {
    throw new EditorError("NOT_FOUND", "outbox job not found", { intentId });
  }
  const now = options.now ?? nowIso();
  const liveLease =
    job.leaseToken !== null &&
    job.leaseExpiresAt !== null &&
    Date.parse(job.leaseExpiresAt) > Date.parse(now);
  if (liveLease && job.leaseToken !== token) {
    throw new EditorError("LEASE_HELD", "Job is leased to another attempt", {
      intentId,
      heldBy: job.leaseToken,
      expiresAt: job.leaseExpiresAt,
    });
  }

  const expiresAt = new Date(Date.parse(now) + (options.ttlMs ?? DEFAULT_LEASE_MS)).toISOString();
  await db.prepare(
    `UPDATE outbox_jobs
        SET lease_token = ?, lease_expires_at = ?, attempt_count = attempt_count + 1,
            state = ?, updated_at = ?
      WHERE intent_id = ?`,
  ).run(token, expiresAt, options.state ?? "committing", now, intentId);
  await db.prepare(
    `UPDATE publication_intents
        SET lease_token = ?, lease_expires_at = ?, attempt_count = attempt_count + 1,
            state = ?, updated_at = ?
      WHERE id = ?`,
  ).run(token, expiresAt, options.state ?? "committing", now, intentId);

  const claimed = await getOutboxJobForIntent(db, intentId);
  if (!claimed) {
    throw new EditorError("INTERNAL", "outbox job disappeared during claim");
  }
  return { job: claimed, intentId, leaseToken: token, leaseExpiresAt: expiresAt };
}

export async function releaseLease(db: EditorDatabase, intentId: string, leaseToken: string): Promise<void> {
  assertInTransaction(db, "releaseLease");
  const intent = await getIntentForUpdate(db, intentId);
  if (!intent) throw new EditorError("NOT_FOUND", "intent not found", { intentId });
  const job = await getOutboxJobForUpdate(db, intentId);
  if (!job) {
    throw new EditorError("NOT_FOUND", "outbox job not found", { intentId });
  }
  if (job.leaseToken !== null && job.leaseToken !== leaseToken) {
    throw new EditorError("LEASE_HELD", "Cannot release a lease owned by another attempt", {
      intentId,
    });
  }
  const now = nowIso();
  await db.prepare(
    `UPDATE outbox_jobs SET lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE intent_id = ?`,
  ).run(now, intentId);
  await db.prepare(
    `UPDATE publication_intents SET lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ?`,
  ).run(now, intentId);
}

export async function countOutboxJobs(db: EditorDatabase, intentId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM outbox_jobs WHERE intent_id = ?`)
    .get(intentId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}
