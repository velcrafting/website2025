// Gate B: forward-only migration runner.
//
// A migration is identified by its filename prefix (001, 002, ...). Once
// applied, the recorded sha256 is authoritative: if the file later changes, the
// runner refuses rather than silently running a different schema. There are no
// down migrations — the disposable local database is removed as a file.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { EditorError } from "../contracts/errors";
import { sha256Hex } from "../contracts/hash";

export const MIGRATIONS_TABLE = "schema_migrations";

type MigrationRow = { version: string; sha256: string };

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       version    TEXT PRIMARY KEY,
       file       TEXT NOT NULL,
       sha256     TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
}

export function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function appliedMigrations(db: DatabaseSync): MigrationRow[] {
  ensureMigrationsTable(db);
  const rows = db
    .prepare(`SELECT version, sha256 FROM ${MIGRATIONS_TABLE} ORDER BY version`)
    .all() as unknown as MigrationRow[];
  return rows.map((row) => ({ version: String(row.version), sha256: String(row.sha256) }));
}

/** Apply every not-yet-applied migration; returns the files applied this call. */
export function runMigrations(db: DatabaseSync, migrationsDir: string): string[] {
  ensureMigrationsTable(db);
  const recorded = new Map(
    appliedMigrations(db).map((row) => [row.version, row.sha256] as const),
  );

  const appliedNow: string[] = [];
  for (const file of listMigrationFiles(migrationsDir)) {
    const version = file.split("-")[0];
    if (!/^\d+$/.test(version)) {
      throw new EditorError("INTERNAL", `Migration filename has no numeric prefix: ${file}`);
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const digest = sha256Hex(sql);

    const prior = recorded.get(version);
    if (prior !== undefined) {
      if (prior !== digest) {
        throw new EditorError(
          "INTERNAL",
          `Migration ${version} changed after it was applied; refusing to run`,
          { version, file },
        );
      }
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare(
        `INSERT INTO ${MIGRATIONS_TABLE} (version, file, sha256, applied_at) VALUES (?, ?, ?, ?)`,
      ).run(version, file, digest, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    }
    appliedNow.push(file);
  }
  return appliedNow;
}
