// tests/e2e/first-issue/verify-live.mjs
//
// Gate B / S06 real-interface verification.
//
// Runs against a REAL production build served on a loopback port and drives the
// REAL HTTP API: create issue -> approve exact artifact -> publish -> read the
// public page back unauthenticated -> check the revision marker and canonical ->
// check leak boundaries. `--phase=recheck` repeats only the read-back so it can
// be run again after a server restart on the same database.
//
// The admin key passed here is a TEST-ONLY value for the isolated loopback
// server. It is never a real credential and is never written into an artifact.
//
// Evidence class: real interface (HTTP against a production build) with
// SYNTHETIC content. Not browser acceptance, and not human editorial evidence.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const nodeRequire = createRequire(import.meta.url);

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, value] = entry.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);

const ORIGIN = args.get("origin") ?? "http://127.0.0.1:3410";
const ADMIN_KEY = args.get("admin-key");
const PHASE = args.get("phase") ?? "publish";
const SLUG = args.get("slug") ?? "verify-live-first-loop";
const STATE_FILE = args.get("state") ?? null;
const BUILD_DIR = args.get("build-dir") ?? null;
// Optional, read-only: used by the recheck phase to prove no second intent was
// created. Never opened for writing.
const DB_PATH = args.get("db") ?? null;

const DRAFT_SENTINEL = "DRAFT_LEAK_SENTINEL_9f3a";
const PUBLISHED_SENTINEL = "PUBLISHED_BODY_SENTINEL_4b81";
// The body text expected on the served page. The publish phase creates its own
// fixture text; `--body-sentinel` lets the recheck phase assert the real body of
// an item the agent did not author (for example a human-edited issue).
const EXPECTED_BODY = args.get("body-sentinel") ?? PUBLISHED_SENTINEL;

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readState() {
  if (!STATE_FILE) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function api(path, body) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `admin=${ADMIN_KEY}`,
    },
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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function unauthGet(path) {
  const response = await fetch(`${ORIGIN}${path}`, { redirect: "manual" });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

async function publishPhase() {
  console.log(`\nphase=publish against ${ORIGIN}\n`);

  const created = await api("/api/editor/items", {
    slug: SLUG,
    title: "Gate B Live Verification Issue",
    summary: "Synthetic content for real-interface verification.",
    byline: "fixture",
    blocks: [
      {
        heading: "Published section",
        markdown: `Published body text ${PUBLISHED_SENTINEL}.\n\nSecond paragraph.`,
        humanLocked: true,
      },
    ],
  });
  check(
    "authorized create returns 201 with artifact hashes",
    created.status === 201 && (await /^[0-9a-f]{64}$/.test(created.json?.revisionSha256 ?? "")),
    `status ${created.status}`,
  );
  if (created.status !== 201) return;

  const approval = await api("/api/editor/approvals", {
    itemId: created.json.itemId,
    revisionId: created.json.revisionId,
    revisionSha256: created.json.revisionSha256,
    manifestSha256: created.json.manifestSha256,
  });
  check(
    "approval of the exact artifact returns 201",
    approval.status === 201,
    `status ${approval.status} ${approval.text.slice(0, 120)}`,
  );
  if (approval.status !== 201) return;

  const publish = await api("/api/editor/publication-intents", {
    itemId: created.json.itemId,
    approvalId: approval.json.approvalId,
    revisionId: created.json.revisionId,
  });
  check("publication commits", publish.json?.outcome === "committed", publish.text.slice(0, 160));
  check(
    "HTTP verification reports verified",
    publish.json?.state === "verified",
    String(publish.json?.verification?.notes ?? ""),
  );

  // The publisher's own verification is not the evidence: read it back again
  // here, unauthenticated.
  const page = await unauthGet(`/issues/${SLUG}`);
  check("unauthenticated GET returns 200", page.status === 200, `status ${page.status}`);
  check(
    "public page carries the exact revision marker",
    (await new RegExp(`<meta[^>]*name="x-content-revision"[^>]*content="${created.json.revisionSha256}"`).test(
      page.text,
    )),
  );
  check(
    "public page carries a canonical URL for the issue",
    page.text.includes(`<link rel="canonical" href="${ORIGIN}/issues/${SLUG}"`),
  );
  check("public page renders the body text", page.text.includes(PUBLISHED_SENTINEL));
  check(
    "public page renders the section heading",
    page.text.includes("Published section"),
  );

  const archive = await unauthGet("/issues");
  check("archive lists the published issue", archive.text.includes(SLUG));
  check("archive page returns 200", archive.status === 200, `status ${archive.status}`);

  // Reader-visible provenance: this fixture pins no source, so the page must say
  // so plainly instead of implying the claims are sourced.
  check("the public page renders a Sources section", page.text.includes("Sources"));
  check(
    "an unsourced revision states that no structured source link is recorded",
    page.text.includes("No structured source link is recorded"),
  );
  check(
    'the provenance count matches the pinned source count (0)',
    page.text.includes('data-provenance-count="0"'),
  );

  // Leak boundaries.
  const preview = await unauthGet(`/admin/editor/preview/${created.json.revisionId}`);
  check(
    "unauthenticated preview is refused (401 or a login redirect, never a 200 or a 500)",
    preview.status === 401 || (preview.status >= 300 && preview.status < 400),
    `status ${preview.status}`,
  );
  check(
    "unauthenticated preview leaks no draft body",
    !preview.text.includes(PUBLISHED_SENTINEL),
  );

  const editorPage = await unauthGet("/admin/editor");
  check(
    "unauthenticated editor page redirects to the login page rather than erroring",
    editorPage.status >= 300 && editorPage.status < 400,
    `status ${editorPage.status}`,
  );
  check(
    "unauthenticated editor page leaks no draft text",
    !editorPage.text.includes(PUBLISHED_SENTINEL),
  );

  const denied = await fetch(`${ORIGIN}/api/editor/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "unauthorized", title: "x", blocks: [{ markdown: "x" }] }),
  });
  check("unauthenticated mutation is refused", denied.status === 401, `status ${denied.status}`);

  if (STATE_FILE) {
    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          slug: SLUG,
          itemId: created.json.itemId,
          revisionId: created.json.revisionId,
          revisionSha256: created.json.revisionSha256,
          intentId: publish.json?.intentId ?? null,
        },
        null,
        2,
      ),
    );
  }
}

async function recheckPhase() {
  const state = readState();
  console.log(`\nphase=recheck against ${ORIGIN} (after restart)\n`);
  if (!state) {
    check("state file from the publish phase is available", false);
    return;
  }

  const page = await unauthGet(`/issues/${state.slug}`);
  check("A11: the issue still resolves after a server restart", page.status === 200, `status ${page.status}`);
  check(
    "A11: the revision marker is identical after the restart",
    (await new RegExp(`<meta[^>]*name="x-content-revision"[^>]*content="${state.revisionSha256}"`).test(
      page.text,
    )),
  );
  check("A11: the body text is still served", page.text.includes(EXPECTED_BODY));

  const archive = await unauthGet("/issues");
  check("A11: archive membership survives the restart", archive.text.includes(state.slug));

  // READ-ONLY from here on. This phase is used to verify a human-owned database,
  // so it must not POST anything: the mutating duplicate-dispatch check lives in
  // tests/e2e/first-issue/verify-idempotency.mjs and runs against a disposable
  // fixture database instead.
  if (DB_PATH) {
    const { DatabaseSync } = nodeRequire("node:sqlite");
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    try {
      const intents = db
        .prepare("SELECT id, state, attempt_count FROM publication_intents WHERE revision_id = ?")
        .all(state.revisionId);
      check(
        "A11: the restart did not create a second intent for this revision",
        intents.length === 1,
        `found ${intents.length}`,
      );
      check(
        "A11: the intent is still verified after the restart",
        intents.length === 1 && String(intents[0].state) === "verified",
        `state ${intents.length === 1 ? intents[0].state : "n/a"}`,
      );
      const jobs = (await db
        .prepare("SELECT COUNT(*) AS n FROM outbox_jobs WHERE intent_id = ?")
        .get(state.intentId));
      check("A11: exactly one outbox job remains", Number(jobs.n) === 1, `found ${jobs.n}`);
    } finally {
      db.close();
    }
  } else {
    note("no --db supplied: the read-only intent-count check was skipped");
  }
}

async function builtAssetScan() {
  if (!BUILD_DIR) return;
  console.log("\nbuilt-asset scan\n");
  const hits = [];
  for (const file of walk(BUILD_DIR)) {
    if (!(await /\.(js|html|json|txt|rsc)$/.test(file))) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes(DRAFT_SENTINEL)) hits.push(`${file} [draft sentinel]`);
  }
  check(
    "no draft sentinel appears in built assets",
    hits.length === 0,
    hits.slice(0, 3).join(", "),
  );
}

if (PHASE === "publish") {
  await publishPhase();
} else {
  await recheckPhase();
}
await builtAssetScan();

console.log(`\nverify-live (${PHASE}): ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
