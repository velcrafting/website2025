// Gate B: the storage port.
//
// Mirrors the existing convention in src/lib/storage.ts — the backend is chosen
// by configuration with an explicit local default, and nothing about the choice
// is hidden from callers. This is a LOCAL milestone store: see
// hermes-handoff/GATE_B_PREP.md section 5 and GATE_B_PREP_REVIEW.md
// correction 1. It is not hosted qualification and there is deliberately no
// Postgres adapter here; requalification (concurrency, locking, permissions,
// transaction behaviour) must happen against Postgres before hosted editorial
// use.

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { EditorError } from "../contracts/errors";
import { editorStorageMode } from "../storage-mode";
import { PostgresEditorDatabase } from "./postgres";
import { runMigrations } from "./migrate";

export const DEFAULT_DB_RELATIVE_PATH = join("_data", "editor.db");
export const DEFAULT_MIGRATIONS_RELATIVE_PATH = join("db", "migrations");

export type EditorStore = {
  db: EditorDatabase;
  path: string;
  migrationsApplied: string[];
  close(): void | Promise<void>;
};

export type EditorDatabase = DatabaseSync | PostgresEditorDatabase;

export function resolveEditorDbPath(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.EDITOR_DB_PATH ?? "").trim();
  if (raw) return raw;
  return join(process.cwd(), DEFAULT_DB_RELATIVE_PATH);
}

export function resolveMigrationsDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = (env.EDITOR_MIGRATIONS_DIR ?? "").trim();
  if (raw) return raw;
  return join(process.cwd(), DEFAULT_MIGRATIONS_RELATIVE_PATH);
}

export type OpenStoreOptions = {
  dbPath?: string;
  migrationsDir?: string;
  migrate?: boolean;
  env?: Record<string, string | undefined>;
};

/**
 * Open (creating if needed) the local editor database and apply forward-only
 * migrations. Callers that must not have side effects when authorization fails
 * are responsible for checking authorization BEFORE calling this — that ordering
 * is a requirement, not a convention.
 */
export function openEditorStore(options: OpenStoreOptions = {}): EditorStore | Promise<EditorStore> {
  const env = options.env ?? process.env;
  const storageMode = editorStorageMode(env);
  if (storageMode === "postgres") {
    const url = (env.POSTGRES_URL ?? "").trim();
    if (!url) throw new EditorError("INTERNAL", "POSTGRES_URL is required in hosted storage mode");
    const db = new PostgresEditorDatabase(url);
    return Promise.resolve({ db, path: "postgres", migrationsApplied: [], close: () => db.close() });
  }
  if (storageMode !== "sqlite") {
    throw new EditorError("INTERNAL", "EDITOR_STORAGE_MODE must be sqlite or postgres");
  }
  if (env.VERCEL === "1") {
    throw new EditorError("INTERNAL", "Hosted runtime requires explicit Postgres storage mode");
  }
  const dbPath = options.dbPath ?? resolveEditorDbPath(env);
  const inMemory = dbPath === ":memory:";

  if (!inMemory) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  if (!inMemory) {
    // WAL keeps a reader (the public projection) from blocking a writer
    // (the editor save) and survives an abrupt process stop.
    db.exec("PRAGMA journal_mode = WAL");
  }

  const migrationsApplied =
    options.migrate === false
      ? []
      : runMigrations(db, options.migrationsDir ?? resolveMigrationsDir(env));

  return {
    db,
    path: dbPath,
    migrationsApplied,
    close: () => db.close(),
  };
}

/**
 * Tracks which connections currently have an open write transaction. Mutating
 * repositories assert on this so a caller cannot accidentally run a
 * multi-statement change outside a transaction and lose atomicity.
 */
const ACTIVE_TRANSACTIONS = new WeakSet<DatabaseSync>();

export function inTransaction(db: EditorDatabase): boolean {
  return db instanceof PostgresEditorDatabase ? db.inTransaction() : ACTIVE_TRANSACTIONS.has(db);
}

export function assertInTransaction(db: EditorDatabase, operation: string): void {
  if (!inTransaction(db)) {
    throw new EditorError(
      "INTERNAL",
      `${operation} must run inside withTransaction()`,
    );
  }
}

/**
 * Run `fn` inside a single write transaction. Any throw rolls the whole thing
 * back, so a partially applied intent+outbox or revision+invalidation is not
 * representable.
 */
export function withTransaction<T>(db: EditorDatabase, fn: () => T | Promise<T>): T | Promise<T> {
  if (db instanceof PostgresEditorDatabase) return db.transaction(fn);
  assertNotNested(db);
  db.exec("BEGIN IMMEDIATE");
  ACTIVE_TRANSACTIONS.add(db);
  let result: T | Promise<T>;
  try {
    result = fn();
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // A rollback failure must not mask the original error.
    }
    ACTIVE_TRANSACTIONS.delete(db);
    throw error;
  }
  if (result !== null && typeof result === "object" && "then" in result && typeof result.then === "function") {
    return Promise.resolve(result).then((value) => {
      db.exec("COMMIT");
      return value;
    }).catch((error: unknown) => {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }).finally(() => ACTIVE_TRANSACTIONS.delete(db));
  }
  try {
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    ACTIVE_TRANSACTIONS.delete(db);
  }
}

function assertNotNested(db: DatabaseSync): void {
  if (ACTIVE_TRANSACTIONS.has(db)) {
    throw new EditorError("INTERNAL", "Nested transactions are not supported");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export const ID_PREFIXES = {
  source: "src",
  captureEvent: "cap",
  sourceVersion: "ver",
  item: "item",
  revision: "rev",
  bundle: "bundle",
  approval: "approval",
  intent: "intent",
  outbox: "job",
} as const;

export function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
