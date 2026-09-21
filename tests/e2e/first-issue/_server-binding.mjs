// tests/e2e/first-issue/_server-binding.mjs
//
// Server-binding proof for MUTATING verification.
//
// Why this exists: a filename allowlist on --db does not establish which database
// the HTTP server actually writes. A script could pass a harmless fixture path and
// still POST to a server bound to the human database. The guard must prove what
// the target is serving BEFORE the first mutation.
//
// The proof, in order:
//   1. the origin must be loopback (fail closed otherwise);
//   2. a probe revision with a random marker is written into the FIXTURE database
//      on disk (not over HTTP);
//   3. the marker is read back over HTTP through an authenticated read of the same
//      revision;
//   4. only if the marker comes back does the caller proceed to mutate.
//
// If the server is bound to any other database, step 3 returns 404 and the caller
// aborts having issued zero mutating requests.
//
// The returned `countMutations` helper exists so a negative test can prove that
// property against a stub transport.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { createModuleLoader } from "../../editor/_module-loader.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class BindingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BindingError";
    this.details = details;
  }
}

export function assertLoopbackOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new BindingError(`origin is not a valid URL: ${origin}`);
  }
  if (url.protocol !== "http:") {
    throw new BindingError(`origin must use http (loopback test server): ${origin}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new BindingError(
      `refusing to mutate a non-loopback origin: ${url.hostname}. Mutating verification targets an owned loopback server only.`,
    );
  }
  return url.origin;
}

/** Refuse an obvious human-database path before doing any work. */
export async function assertFixtureDbPath(dbPath) {
  if (!dbPath) throw new BindingError("--db=<fixture database> is required");
  if (!existsSync(dbPath)) {
    throw new BindingError(
      `fixture database does not exist: ${dbPath}. Create it with a fixture server; do not point mutating checks at an unknown file.`,
    );
  }
  if ((await /(^|\/)editor\.db$/.test(dbPath))) {
    throw new BindingError(
      "refusing to run: editor.db is the human database. Mutating verification requires a disposable fixture database.",
    );
  }
  return dbPath;
}

/**
 * Write a probe revision into the fixture database and prove over HTTP that the
 * target server is the one reading that database. Throws BindingError if it is not.
 */
export async function establishServerBinding({
  origin,
  adminKey,
  dbPath,
  migrationsDir,
  fetchImpl = fetch,
}) {
  const base = assertLoopbackOrigin(origin);
  assertFixtureDbPath(dbPath);

  if (!adminKey) throw new BindingError("--admin-key is required to read the probe back");

  const marker = `SERVER_BINDING_PROBE_${randomUUID().replace(/-/g, "")}`;
  const loader = createModuleLoader({
    env: {
      EDITOR_DB_PATH: dbPath,
      EDITOR_MIGRATIONS_DIR: migrationsDir,
    },
  });
  const store = loader.load("src/editor/repository/store.ts");
  const revisions = loader.load("src/editor/repository/revisions.ts");
  const { createIssue } = loader.load("src/editor/revision/service.ts");

  const handle = store.openEditorStore({ dbPath, migrationsDir });
  let probeRevisionId;
  try {
    const probe = (await createIssue(handle, {
      slug: `binding-probe-${marker.slice(-12).toLowerCase()}`,
      title: "Server binding probe (synthetic)",
      blocks: [{ id: "blk_probe", heading: "Probe", markdown: marker, humanLocked: true }],
      createdBy: "binding-probe",
      origin: "fixture",
    }));
    probeRevisionId = probe.revision.id;
    // Confirm the row is really in this file before asking the server about it.
    if (!(await revisions.getRevision(handle.db, probeRevisionId))) {
      throw new BindingError("probe revision was not written to the fixture database");
    }
  } finally {
    handle.close();
  }

  const response = await fetchImpl(`${base}/admin/editor/preview/${probeRevisionId}`, {
    method: "GET",
    headers: { cookie: `admin=${adminKey}` },
  });
  const text = typeof response.text === "function" ? await response.text() : "";

  if (response.status !== 200 || !text.includes(marker)) {
    throw new BindingError(
      `server at ${base} is NOT reading ${dbPath} (probe GET returned ${response.status}). Mutating checks aborted before any write.`,
      { status: response.status, probeRevisionId },
    );
  }

  return { origin: base, dbPath, probeRevisionId, marker };
}

/** Remove a probe item from the fixture database. Best effort, fixture only. */
export async function removeProbe(dbPath, migrationsDir, itemId) {
  try {
    const loader = createModuleLoader({
      env: { EDITOR_DB_PATH: dbPath, EDITOR_MIGRATIONS_DIR: migrationsDir },
    });
    const store = loader.load("src/editor/repository/store.ts");
    const handle = store.openEditorStore({ dbPath, migrationsDir, migrate: false });
    try {
      (await handle.db.prepare("DELETE FROM content_revisions WHERE item_id = ?").run(itemId));
      (await handle.db.prepare("DELETE FROM content_items WHERE id = ?").run(itemId));
    } finally {
      handle.close();
    }
  } catch {
    // The fixture database is disposable; a failed cleanup is not a test failure.
  }
}

/**
 * Count requests that could change state. Used by the negative test: after a
 * failed binding proof this must be 0.
 */
export function countMutations(recorded) {
  return recorded.filter((entry) => String(entry.method).toUpperCase() !== "GET").length;
}
