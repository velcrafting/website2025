// tests/e2e/first-issue/verify-provenance.mjs
//
// Gate B / S06: proves the reader-visible provenance panel end to end.
//
// The human-authored published item pins no source, so its panel correctly shows
// the empty state. This script creates a SYNTHETIC published fixture that does
// pin a captured source, so the populated panel — the source link, the access
// label and the count — is verified against a real production build over real
// HTTP rather than left as an unexercised renderer.
//
// It writes only to a verification database. Never run it against the human
// database.
//
// Evidence class: real interface (HTTP against a production build) with
// SYNTHETIC content.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite");

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const ORIGIN = args.get("origin") ?? "http://127.0.0.1:3410";
const ADMIN_KEY = args.get("admin-key");
const DB_PATH = args.get("db");
const SLUG = args.get("slug") ?? "verify-provenance-issue";
const SOURCE_URL = "https://info.arxiv.org/help/api/user-manual.html";
// publish: create + approve + publish a source-linked fixture.
// recheck: READ-ONLY. Re-assert the published source links after a server restart.
const PHASE = args.get("phase") ?? "publish";
const STATE_FILE = args.get("state") ?? null;

if (!ADMIN_KEY && PHASE !== "recheck") {
  console.error("--admin-key=<test-only key> is required");
  process.exit(2);
}
if (!DB_PATH) {
  console.error("--db=<verification database> is required (never the human database)");
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

console.log(`\nreader-visible provenance against ${ORIGIN} (phase=${PHASE})\n`);

if (PHASE === "recheck") {
  // Read-only: no POSTs. Used after a server restart to prove the source-linked
  // publication still resolves with its structured provenance intact.
  const state = STATE_FILE && existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
    : null;
  if (!state) {
    check("a state file from the publish phase is available", false, String(STATE_FILE));
  } else {
    const response = await fetch(`${ORIGIN}/issues/${state.slug}`, { cache: "no-store" });
    const page = await response.text();
    check("the source-linked issue still resolves after a restart", response.status === 200, `status ${response.status}`);
    check(
      "the structured source panel survives the restart",
      page.includes('data-provenance-count="1"'),
    );
    check("the source link survives the restart", page.includes(`href="${state.sourceUrl}"`));
    check(
      "the honest access label survives the restart",
      page.includes("Metadata only — full text was not read"),
    );
    check(
      "the revision marker is unchanged after the restart",
      new RegExp(`<meta[^>]*name="x-content-revision"[^>]*content="${state.revisionSha256}"`).test(page),
    );
  }
  console.log(`\nverify-provenance (recheck): ${passed}/${passed + failures.length} passed`);
  if (failures.length) {
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
  process.exit();
}

// 1. Capture a source (ordinary public URL, metadata-only access level).
const captured = await api("/api/editor/sources", {
  canonicalUrl: SOURCE_URL,
  title: "arXiv API User Manual (provenance render check)",
  provider: "arxiv-docs",
  kind: "documentation",
  accessLevel: "metadata_only",
  note: "metadata_only fixture for the provenance panel",
});
check("capture accepts an ordinary public source", captured.status === 201, `status ${captured.status}`);
if (captured.status !== 201) {
  console.log(`\nverify-provenance: ${passed}/${passed + failures.length} passed`);
  process.exitCode = 1;
  process.exit();
}

// The capture route returns the source id; the version id comes from the store.
const db = new DatabaseSync(DB_PATH, { readOnly: true });
let versionIds = [];
try {
  versionIds = db
    .prepare("SELECT id FROM source_versions WHERE source_id = ? ORDER BY created_at")
    .all(captured.json.sourceId)
    .map((row) => String(row.id));
} finally {
  db.close();
}
check("the capture recorded a source version to pin", versionIds.length === 1, `found ${versionIds.length}`);

// 2. Create an issue that PINS that source version.
const created = await api("/api/editor/items", {
  slug: SLUG,
  title: "Provenance Render Check",
  summary: "Synthetic fixture with a pinned source.",
  blocks: [{ heading: "Digest", markdown: "Fixture digest for the provenance check." }],
  sourceVersionIds: versionIds,
});
check("an issue can be created pinning a source version", created.status === 201, `status ${created.status}`);
if (created.status !== 201) {
  console.log(`\nverify-provenance: ${passed}/${passed + failures.length} passed`);
  process.exitCode = 1;
  process.exit();
}

// 3. Approve and publish.
const approval = await api("/api/editor/approvals", {
  itemId: created.json.itemId,
  revisionId: created.json.revisionId,
  revisionSha256: created.json.revisionSha256,
  manifestSha256: created.json.manifestSha256,
});
check("the pinned revision can be approved", approval.status === 201, `status ${approval.status}`);

const publish = await api("/api/editor/publication-intents", {
  itemId: created.json.itemId,
  approvalId: approval.json.approvalId,
  revisionId: created.json.revisionId,
});
check("the pinned revision publishes and verifies", publish.json?.state === "verified", String(publish.json?.verification?.notes ?? ""));

// 4. Read the public page back unauthenticated.
const response = await fetch(`${ORIGIN}/issues/${SLUG}`, { cache: "no-store" });
const page = await response.text();
check("the public page returns 200", response.status === 200, `status ${response.status}`);
check('the provenance panel reports one pinned source', page.includes('data-provenance-count="1"'));
check("the source link points at the canonical source URL", page.includes(`href="${SOURCE_URL}"`));
check("the source title is reader-visible", page.includes("arXiv API User Manual (provenance render check)"));
check('the honest access label is preserved verbatim', page.includes("Metadata only — full text was not read"));
check("the provider is named as reader context", page.includes("arxiv-docs"));
check(
  "the page does not fall back to the empty-state wording",
  !page.includes("No structured source link is recorded"),
);
check("the revision marker is still present", /<meta[^>]*name="x-content-revision"[^>]*content="[0-9a-f]{64}"/.test(page));

if (STATE_FILE) {
  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      { slug: SLUG, revisionSha256: created.json.revisionSha256, sourceUrl: SOURCE_URL },
      null,
      2,
    ),
  );
}

console.log(`\nverify-provenance: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
