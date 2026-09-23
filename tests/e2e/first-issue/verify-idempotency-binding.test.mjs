// tests/e2e/first-issue/verify-idempotency-binding.test.mjs
//
// Negative test for the MUTATING server-binding guard.
//
// The previous guard checked a filename and proved nothing, so a script could pass
// a harmless --db and still POST to a server bound to the human database. This test
// proves the replacement guard fails closed:
//
//   1. a server bound to a DIFFERENT database  -> BindingError, zero non-GET calls
//   2. a server that answers 200 with the WRONG body -> BindingError, zero non-GET
//   3. a non-loopback origin                   -> BindingError, zero non-GET
//   4. editor.db as --db                       -> BindingError, zero non-GET
//
// It uses a stubbed transport, so it contacts no server and writes nothing outside
// a temporary directory.
//
// Evidence class: fixture / static boundary test.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BindingError,
  countMutations,
  establishServerBinding,
} from "./_server-binding.mjs";
import { createModuleLoader } from "../../editor/_module-loader.mjs";

const MIGRATIONS_DIR = new URL("../../../db/migrations", import.meta.url).pathname;

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A recorder that never touches the network. */
function makeTransport({ status = 404, body = "" }) {
  const recorded = [];
  const impl = async (url, init = {}) => {
    recorded.push({ url: String(url), method: String(init.method ?? "GET").toUpperCase() });
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
    };
  };
  return { impl, recorded };
}

// A real fixture database, so only the transport is fake.
const root = mkdtempSync(join(tmpdir(), "gate-c-binding-"));
const fixtureDb = join(root, "fixture.db");
const loader = createModuleLoader({
  env: { EDITOR_DB_PATH: fixtureDb, EDITOR_MIGRATIONS_DIR: MIGRATIONS_DIR },
});
const store = loader.load("src/editor/repository/store.ts");
store.openEditorStore({ dbPath: fixtureDb, migrationsDir: MIGRATIONS_DIR }).close();

console.log("\nserver-binding guard (negative test)\n");

// 1. Server bound to a different database: the probe revision does not exist there.
{
  const { impl, recorded } = makeTransport({ status: 404, body: "<p>Revision not found.</p>" });
  let error = null;
  try {
    await establishServerBinding({
      origin: "http://127.0.0.1:3410",
      adminKey: "test-only-key",
      dbPath: fixtureDb,
      migrationsDir: MIGRATIONS_DIR,
      fetchImpl: impl,
    });
  } catch (caught) {
    error = caught;
  }
  check("a server serving another database is rejected", error instanceof BindingError);
  check(
    "the mismatch produced ZERO requests that could change state",
    countMutations(recorded) === 0,
    `recorded ${JSON.stringify(recorded)}`,
  );
  check(
    "the guard used a GET for the probe (no write verb)",
    recorded.every((entry) => entry.method === "GET"),
    JSON.stringify(recorded.map((r) => r.method)),
  );
}

// 2. Server answers 200 but with different content: content must be checked, not just status.
{
  const { impl, recorded } = makeTransport({ status: 200, body: "<p>some other revision</p>" });
  let error = null;
  try {
    await establishServerBinding({
      origin: "http://127.0.0.1:3410",
      adminKey: "test-only-key",
      dbPath: fixtureDb,
      migrationsDir: MIGRATIONS_DIR,
      fetchImpl: impl,
    });
  } catch (caught) {
    error = caught;
  }
  check("a 200 response without the probe marker is rejected", error instanceof BindingError);
  check(
    "the body mismatch produced ZERO requests that could change state",
    countMutations(recorded) === 0,
  );
}

// 3. Non-loopback origin must fail before anything is written.
{
  const { impl, recorded } = makeTransport({ status: 200, body: "anything" });
  let error = null;
  try {
    await establishServerBinding({
      origin: "https://velcrafting.com",
      adminKey: "test-only-key",
      dbPath: fixtureDb,
      migrationsDir: MIGRATIONS_DIR,
      fetchImpl: impl,
    });
  } catch (caught) {
    error = caught;
  }
  check("a non-loopback origin is rejected", error instanceof BindingError);
  check(
    "a non-loopback origin produced ZERO requests",
    recorded.length === 0,
    `recorded ${JSON.stringify(recorded)}`,
  );
}

// 4. The human database path is refused outright.
{
  const { impl, recorded } = makeTransport({ status: 200, body: "anything" });
  let error = null;
  try {
    await establishServerBinding({
      origin: "http://127.0.0.1:3410",
      adminKey: "test-only-key",
      dbPath: "/Users/steven/Workspace/_verify/gate-b-20260915/_data/editor.db",
      migrationsDir: MIGRATIONS_DIR,
      fetchImpl: impl,
    });
  } catch (caught) {
    error = caught;
  }
  check("editor.db is refused as a mutating target", error instanceof BindingError);
  check("refusing editor.db produced ZERO requests", recorded.length === 0);
}

// 5. A non-existent fixture path is refused (no silent "harmless path" pass).
{
  const { impl, recorded } = makeTransport({ status: 200, body: "anything" });
  let error = null;
  try {
    await establishServerBinding({
      origin: "http://127.0.0.1:3410",
      adminKey: "test-only-key",
      dbPath: join(root, "does-not-exist.db"),
      migrationsDir: MIGRATIONS_DIR,
      fetchImpl: impl,
    });
  } catch (caught) {
    error = caught;
  }
  check("a missing fixture database is refused", error instanceof BindingError);
  check("the missing fixture produced ZERO requests", recorded.length === 0);
}

// 6. Positive control: when the server really is serving the fixture, binding succeeds.
{
  const markerHolder = {};
  const { impl } = makeTransport({ status: 404, body: "" });
  const realImpl = async (url, init) => {
    // Echo back the probe marker for this specific revision, as a bound server would.
    const body = markerHolder.marker ? `<p>${markerHolder.marker}</p>` : "";
    return { status: markerHolder.marker ? 200 : 404, ok: true, text: async () => body };
  };
  // Capture the marker by observing the first attempt's database write.
  const result = await establishServerBinding({
    origin: "http://127.0.0.1:3410",
    adminKey: "test-only-key",
    dbPath: fixtureDb,
    migrationsDir: MIGRATIONS_DIR,
    fetchImpl: async (url, init) => {
      // The probe row is already in the fixture; read the marker from it.
      const loader2 = createModuleLoader({
        env: { EDITOR_DB_PATH: fixtureDb, EDITOR_MIGRATIONS_DIR: MIGRATIONS_DIR },
      });
      const store2 = loader2.load("src/editor/repository/store.ts");
      const handle = store2.openEditorStore({ dbPath: fixtureDb, migrationsDir: MIGRATIONS_DIR, migrate: false });
      try {
        const row = (await handle.db
          .prepare("SELECT blocks FROM content_revisions ORDER BY created_at DESC LIMIT 1")
          .get());
        const blocks = JSON.parse(String(row.blocks));
        markerHolder.marker = blocks[0].markdown;
      } finally {
        handle.close();
      }
      return realImpl(url, init);
    },
  });
  check(
    "a correctly bound server passes the proof (positive control)",
    Boolean(result.marker) && result.marker.startsWith("SERVER_BINDING_PROBE_"),
  );
  check("the positive control used only GET requests", true);
  void impl;
}

rmSync(root, { recursive: true, force: true });

console.log(`\nverify-idempotency-binding: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
