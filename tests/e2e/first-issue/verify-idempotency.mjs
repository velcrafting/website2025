// tests/e2e/first-issue/verify-idempotency.mjs
//
// The MUTATING half of the duplicate-dispatch check, separated from the readback
// path so a read-only verification of a human-owned database never POSTs.
//
// It creates its own synthetic item, approves it, publishes it twice, and asserts
// the second publish reuses the existing intent rather than creating a second
// logical publication.
//
// BINDING GUARD: a filename check is not enough, because it says nothing about
// which database the HTTP target is serving. Before the first mutation this script
// writes a probe revision into the fixture database and reads it back over HTTP
// through an authenticated GET. If the server is serving a different database the
// probe returns 404 and this script exits without having issued any mutating
// request. See _server-binding.mjs.
//
// Evidence class: real interface (HTTP against a production build) with
// SYNTHETIC content.

import { createRequire } from "node:module";

import { BindingError, establishServerBinding, removeProbe } from "./_server-binding.mjs";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite");

// The repository's own migrations, used only to open the fixture database.
const MIGRATIONS_DIR = new URL("../../../db/migrations", import.meta.url).pathname;

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const ORIGIN = args.get("origin") ?? "http://127.0.0.1:3410";
const ADMIN_KEY = args.get("admin-key");
const DB_PATH = args.get("db");
const SLUG = args.get("slug") ?? "verify-idempotency-issue";

if (!ADMIN_KEY) {
  console.error("--admin-key=<test-only key> is required");
  process.exit(2);
}
if (!DB_PATH) {
  console.error("--db=<disposable fixture database> is required");
  process.exit(2);
}

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

async function api(path, body) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `admin=${ADMIN_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

console.log(`\nduplicate-dispatch idempotency against ${ORIGIN} (fixture db)\n`);

// --- binding proof, before any mutation ------------------------------------
let binding;
try {
  binding = await establishServerBinding({
    origin: ORIGIN,
    adminKey: ADMIN_KEY,
    dbPath: DB_PATH,
    migrationsDir: MIGRATIONS_DIR,
  });
} catch (error) {
  if (error instanceof BindingError) {
    console.error(
      `\nBinding proof FAILED. No request that could change state was sent.\n  ${error.message}`,
    );
    process.exit(3);
  }
  throw error;
}
console.log(
  `  binding established: ${binding.origin} is serving ${binding.dbPath} (probe ${binding.probeRevisionId})\n`,
);

const created = await api("/api/editor/items", {
  slug: SLUG,
  title: "Idempotency Fixture",
  summary: "Synthetic content for the duplicate-dispatch check.",
  blocks: [{ heading: "Body", markdown: "Synthetic body for the idempotency fixture." }],
});
check("a synthetic item can be created", created.status === 201, `status ${created.status}`);
if (created.status !== 201) {
  console.log(`\nverify-idempotency: ${passed}/${passed + failures.length} passed`);
  process.exitCode = 1;
  process.exit();
}

const approval = await api("/api/editor/approvals", {
  itemId: created.json.itemId,
  revisionId: created.json.revisionId,
  revisionSha256: created.json.revisionSha256,
  manifestSha256: created.json.manifestSha256,
});
check("the synthetic revision can be approved", approval.status === 201, `status ${approval.status}`);

const publishBody = {
  itemId: created.json.itemId,
  approvalId: approval.json?.approvalId,
  revisionId: created.json.revisionId,
};
const first = await api("/api/editor/publication-intents", publishBody);
const second = await api("/api/editor/publication-intents", publishBody);

check("the first publish commits", first.json?.outcome === "committed", first.text.slice(0, 140));
check(
  "the second publish reuses the existing intent",
  second.json?.outcome === "reused_existing_intent",
  `outcome ${second.json?.outcome} ${second.text.slice(0, 140)}`,
);
check(
  "the reuse returns the same intent id",
  Boolean(second.json?.intentId) && second.json.intentId === first.json?.intentId,
  `returned ${second.json?.intentId} expected ${first.json?.intentId}`,
);

const db = new DatabaseSync(DB_PATH, { readOnly: true });
try {
  const intents = db
    .prepare("SELECT COUNT(*) AS n FROM publication_intents WHERE revision_id = ?")
    .get(created.json.revisionId);
  check("exactly one intent exists for the revision", Number(intents.n) === 1, `found ${intents.n}`);

  const jobs = db
    .prepare("SELECT COUNT(*) AS n FROM outbox_jobs WHERE intent_id = ?")
    .get(first.json.intentId);
  check(
    "exactly one outbox job exists for this intent",
    Number(jobs.n) === 1,
    `found ${jobs.n}`,
  );

  const item = db
    .prepare("SELECT published_revision_id FROM content_items WHERE id = ?")
    .get(created.json.itemId);
  check(
    "the published pointer still names the approved revision",
    String(item.published_revision_id) === created.json.revisionId,
    `pointer ${item.published_revision_id}`,
  );
} finally {
  db.close();
}

// Best-effort probe cleanup. The fixture database is disposable.
removeProbe(DB_PATH, MIGRATIONS_DIR, binding.probeRevisionId);

console.log(`\nverify-idempotency: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
