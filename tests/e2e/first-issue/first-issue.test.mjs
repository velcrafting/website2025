// tests/e2e/first-issue/first-issue.test.mjs
//
// Gate B / S06 acceptance, fixture layer. Drives the REAL publishing service and
// the REAL editor routes against a temporary database. The HTTP verification step
// is fed a synthetic response body so the verification logic itself is exercised
// offline; the genuine HTTP layer is verified separately against a real isolated
// server (see the Gate B result).
//
// Evidence class: fixture/synthetic.

import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  assert,
  assertEqual,
  assertRejects,
  createModuleLoader,
  expectCode,
  finish,
  makeTempRoot,
  suite,
  test,
} from "../../editor/_module-loader.mjs";

const seedLoader = createModuleLoader();
const MIGRATIONS_DIR = join(seedLoader.repo, "db", "migrations");
const ADMIN_KEY = "test-only-admin-key-not-a-secret";
const TARGET = "http://127.0.0.1:3410";

const session = { cookie: undefined };
let currentDbPath = null;
let fetchBehaviour = null;

function makeLoader(extra = {}) {
  return createModuleLoader({
    env: {
      ADMIN_KEY,
      EDITOR_DB_PATH: currentDbPath ?? "",
      EDITOR_MIGRATIONS_DIR: MIGRATIONS_DIR,
      EDITOR_HUMAN_SUBJECT_ID: "editor_fixture",
      EDITOR_TEST_TARGET: TARGET,
    },
    fetchImpl: (...args) => {
      if (!fetchBehaviour) throw new Error("fetch was not expected in this test");
      return fetchBehaviour(...args);
    },
    stubs: {
      "next/headers": () => ({
        cookies: async () => ({
          get: (name) =>
            name === "admin" && session.cookie !== undefined
              ? { value: session.cookie }
              : undefined,
          set: () => {},
        }),
      }),
      "next/navigation": () => ({
        redirect: () => {
          throw new Error("NEXT_REDIRECT");
        },
        notFound: () => {
          throw new Error("NEXT_NOT_FOUND");
        },
      }),
      "next/cache": () => ({ revalidatePath: () => {} }),
      "next/link": () => ({ default: () => null }),
    },
    ...extra,
  });
}

function freshDb(prefix) {
  const root = makeTempRoot(prefix);
  currentDbPath = join(root, "editor.db");
  return currentDbPath;
}

function request(body) {
  return {
    url: `${TARGET}/api/editor/test`,
    headers: new Map(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => request(body),
  };
}

async function readResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

/** Build the synthetic public page for a revision, as the real route would. */
function syntheticPublicPage(revisionSha256, slug, body) {
  return (
    `<!doctype html><html><head>` +
    `<meta name="x-content-revision" content="${revisionSha256}"/>` +
    `<link rel="canonical" href="${TARGET}/issues/${slug}"/>` +
    `</head><body><article data-revision="${revisionSha256}">${body}</article></body></html>`
  );
}

/** Walk a fixture issue all the way to a stored intent. */
async function seedPublishedIssue(loader, slug, options = {}) {
  const items = loader.load("src/app/api/editor/items/route.ts");
  const approvals = loader.load("src/app/api/editor/approvals/route.ts");
  session.cookie = ADMIN_KEY;

  const created = await readResponse(
    await items.POST(
      request({
        slug,
        title: "First Loop Issue",
        summary: "A fixture issue.",
        blocks: [
          { heading: "Pinned", markdown: "Pinned excerpt for the first loop.", humanLocked: true },
          { heading: "Digest", markdown: "Fixture digest text." },
        ],
      }),
    ),
  );
  assertEqual(created.status, 201, "fixture issue created");

  const approval = await readResponse(
    await approvals.POST(
      request({
        itemId: created.json.itemId,
        revisionId: created.json.revisionId,
        revisionSha256: created.json.revisionSha256,
        manifestSha256: created.json.manifestSha256,
        targetRef: options.targetRef ?? TARGET,
      }),
    ),
  );
  assertEqual(approval.status, 201, "fixture approval created");

  return {
    itemId: created.json.itemId,
    revisionId: created.json.revisionId,
    revisionSha256: created.json.revisionSha256,
    manifestSha256: created.json.manifestSha256,
    approvalId: approval.json.approvalId,
    slug,
  };
}

suite("S06: capture through the real route");

await test("an authorized capture records a source with honest access level", async () => {
  const dbPath = freshDb("gateb-b4-capture-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/sources/route.ts");
  session.cookie = ADMIN_KEY;

  const response = await readResponse(
    await route.POST(
      request({
        canonicalUrl: "https://arxiv.org/abs/2401.00001v1",
        title: "Fixture Source For The First Loop",
        provider: "arxiv",
        kind: "paper",
        upstreamId: "2401.00001v1",
        authors: ["Fixture Author"],
        publishedAt: "2024-01-01T00:00:00Z",
        accessLevel: "abstract_only",
        note: "Abstract-only fixture read.",
      }),
    ),
  );
  assertEqual(response.status, 201, "capture succeeds");
  assertEqual(response.json.accessLevel, "abstract_only", "access level is not upgraded");
  assertEqual(response.json.provider, "arxiv", "provider recorded");

  const sources = loader.load("src/editor/repository/sources.ts");
  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual((await sources.listSources(handle.db)).length, 1, "one source stored");
    assertEqual(
      (await sources.countCaptureEvents(handle.db, response.json.sourceId)),
      1,
      "one capture event stored",
    );
  } finally {
    handle.close();
  }
});

await test("a capture of a loopback URL is refused before any write", async () => {
  const dbPath = freshDb("gateb-b4-capture-bad-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/sources/route.ts");
  session.cookie = ADMIN_KEY;

  const response = await readResponse(
    await route.POST(request({ canonicalUrl: "http://127.0.0.1:3410/secret", title: "X" })),
  );
  assertEqual(response.status, 400, "loopback capture refused");
  assertEqual(response.json.error, "UNSAFE_URL", "stable code");

  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM sources").get()).n),
      0,
      "no source written",
    );
  } finally {
    handle.close();
  }
});

suite("S06: isolated publication and HTTP verification");

await test("A6/A8: an approved revision is committed once and verified over the marker", async () => {
  const dbPath = freshDb("gateb-b4-publish-");
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "first-loop-issue");

  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  const asked = [];
  fetchBehaviour = async (url) => {
    asked.push(String(url));
    return {
      ok: true,
      status: 200,
      text: async () =>
        syntheticPublicPage(
          fixture.revisionSha256,
          fixture.slug,
          "<p>Fixture digest text.</p>",
        ),
    };
  };

  const response = await readResponse(
    await publishRoute.POST(
      request({
        itemId: fixture.itemId,
        approvalId: fixture.approvalId,
        revisionId: fixture.revisionId,
        targetRef: TARGET,
      }),
    ),
  );
  assertEqual(response.status, 201, "publication request accepted");
  assertEqual(response.json.outcome, "committed", "first attempt commits");
  assertEqual(response.json.state, "verified", "intent becomes verified");
  assertEqual(
    response.json.verification.revisionMarker,
    fixture.revisionSha256,
    "the marker read back matches the approved revision",
  );
  assertEqual(
    asked[0],
    `${TARGET}/issues/${fixture.slug}`,
    "verification fetched the public issue URL",
  );

  const store = loader.load("src/editor/repository/store.ts");
  const { listPublicIssues, getPublicIssue } = loader.load("src/editor/repository/public.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    const listed = (await listPublicIssues(handle.db));
    assertEqual(listed.length, 1, "the issue is now public");
    assertEqual(listed[0].intentState, "verified", "projection reports verified");
    const detail = (await getPublicIssue(handle.db, fixture.slug));
    assertEqual(detail.revisionSha256, fixture.revisionSha256, "detail carries the revision");
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      1,
      "exactly one intent",
    );
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM outbox_jobs").get()).n),
      1,
      "exactly one outbox job",
    );
  } finally {
    handle.close();
  }
});

await test("A7: publishing the same logical operation again reuses the intent", async () => {
  const dbPath = freshDb("gateb-b4-retry-");
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "retry-issue");
  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  fetchBehaviour = async () => ({
    ok: true,
    status: 200,
    text: async () => syntheticPublicPage(fixture.revisionSha256, fixture.slug, "<p>Body.</p>"),
  });

  const body = {
    itemId: fixture.itemId,
    approvalId: fixture.approvalId,
    revisionId: fixture.revisionId,
    targetRef: TARGET,
  };
  const first = await readResponse(await publishRoute.POST(request(body)));
  const second = await readResponse(await publishRoute.POST(request(body)));
  assertEqual(first.json.outcome, "committed", "first commits");
  assertEqual(second.json.outcome, "reused_existing_intent", "second reuses the intent");
  assertEqual(second.json.intentId, first.json.intentId, "same intent id");
  assertEqual(second.status, 201, "the retry is still reported as accepted");

  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      1,
      "a retry never creates a second logical publication",
    );
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM outbox_jobs").get()).n),
      1,
      "and never a second outbox job",
    );
  } finally {
    handle.close();
  }
});

await test("a verification failure is recorded as failed and does not duplicate the item", async () => {
  const dbPath = freshDb("gateb-b4-verify-fail-");
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "verify-fail-issue");
  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  fetchBehaviour = async () => ({
    ok: true,
    status: 200,
    // Wrong revision marker: the page is serving something else.
    text: async () => syntheticPublicPage("f".repeat(64), fixture.slug, "<p>Stale.</p>"),
  });

  const response = await readResponse(
    await publishRoute.POST(
      request({
        itemId: fixture.itemId,
        approvalId: fixture.approvalId,
        revisionId: fixture.revisionId,
        targetRef: TARGET,
      }),
    ),
  );
  assertEqual(response.json.state, "failed", "intent is not verified");
  assertEqual(response.json.verification.verified, false, "verification reports false");
  assert(
    String(response.json.verification.notes).includes("does not match"),
    "the failure explains the mismatch",
  );

  const store = loader.load("src/editor/repository/store.ts");
  const { listPublicIssues } = loader.load("src/editor/repository/public.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      1,
      "still one intent",
    );
    assertEqual((await listPublicIssues(handle.db)).length, 1, "the committed item still resolves");
    assertEqual(
      String(
        (await handle.db.prepare("SELECT state FROM publication_intents").get()).state,
      ),
      "failed",
      "intent records the failed verification",
    );
  } finally {
    handle.close();
  }
});

await test("an unreachable public URL fails verification without duplicating anything", async () => {
  const dbPath = freshDb("gateb-b4-verify-net-");
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "verify-net-issue");
  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  fetchBehaviour = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:3410");
  };

  const response = await readResponse(
    await publishRoute.POST(
      request({
        itemId: fixture.itemId,
        approvalId: fixture.approvalId,
        revisionId: fixture.revisionId,
        targetRef: TARGET,
      }),
    ),
  );
  assertEqual(response.json.state, "failed", "network failure is not a verification");
  assert(
    String(response.json.verification.notes).includes("request failed"),
    "the transport failure is recorded",
  );
  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      1,
      "no second intent on a transport failure",
    );
  } finally {
    handle.close();
  }
});

suite("S06: publication refusals have zero effects");

async function expectRefusal(setup, expectedCode, expectedStatus) {
  const dbPath = freshDb(`gateb-b4-refuse-${expectedCode}-`);
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "refuse-issue");
  await setup({ loader, fixture });
  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  fetchBehaviour = async () => {
    throw new Error("fetch must not be reached");
  };

  const response = await readResponse(
    await publishRoute.POST(
      request({
        itemId: fixture.itemId,
        approvalId: fixture.approvalId,
        revisionId: fixture.revisionId,
        targetRef: TARGET,
      }),
    ),
  );
  assertEqual(response.status, expectedStatus, `${expectedCode} status`);
  assertEqual(response.json.error, expectedCode, "stable error code");
  assert(dbPath, "database path recorded");
  return { loader, fixture, dbPath };
}

await test("publication with an invalidated approval is refused with zero effects", async () => {
  const { loader, fixture, dbPath } = await expectRefusal(
    async ({ loader: l, fixture: f }) => {
      // A later save invalidates the approval.
      session.cookie = ADMIN_KEY;
      const saves = l.load("src/app/api/editor/items/[id]/revisions/route.ts");
      const saved = await readResponse(
        await saves.POST(
          request({
            expectedRevisionId: f.revisionId,
            title: "First Loop Issue",
            blocks: [{ markdown: "Changed after approval." }],
          }),
          { params: (await Promise.resolve({ id: f.itemId })) },
        ),
      );
      assertEqual(saved.status, 200, "the edit that invalidates is saved");
    },
    "APPROVAL_INVALIDATED",
    409,
  );

  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      0,
      "no intent written",
    );
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM outbox_jobs").get()).n),
      0,
      "no outbox job written",
    );
    const item = (await handle.db.prepare("SELECT published_revision_id FROM content_items").get());
    assertEqual(item.published_revision_id, null, "no published pointer set");
  } finally {
    handle.close();
  }
  assert(fixture.approvalId, "fixture approval existed");
});

await test("publication of a revision other than the approved one is refused", async () => {
  const dbPath = freshDb("gateb-b4-refuse-mismatch-");
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "mismatch-issue");
  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  fetchBehaviour = async () => {
    throw new Error("fetch must not be reached");
  };

  const response = await readResponse(
    await publishRoute.POST(
      request({
        itemId: fixture.itemId,
        approvalId: fixture.approvalId,
        revisionId: "rev_some_other_revision",
        targetRef: TARGET,
      }),
    ),
  );
  assertEqual(response.status, 404, "an unknown revision is refused");
  assertEqual(response.json.error, "NOT_FOUND", "stable code");

  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      0,
      "no intent written",
    );
  } finally {
    handle.close();
  }
});

suite("S06: restart recovery (fixture layer)");

await test("A11: closing and reopening the database preserves the publication", async () => {
  const dbPath = freshDb("gateb-b4-restart-");
  const loader = makeLoader();
  const fixture = await seedPublishedIssue(loader, "restart-issue");
  const publishRoute = loader.load("src/app/api/editor/publication-intents/route.ts");
  fetchBehaviour = async () => ({
    ok: true,
    status: 200,
    text: async () => syntheticPublicPage(fixture.revisionSha256, fixture.slug, "<p>Body.</p>"),
  });
  const published = await readResponse(
    await publishRoute.POST(
      request({
        itemId: fixture.itemId,
        approvalId: fixture.approvalId,
        revisionId: fixture.revisionId,
        targetRef: TARGET,
      }),
    ),
  );
  assertEqual(published.json.state, "verified", "published before the restart");

  // Simulate a process stop: every connection closes, then the database is
  // re-opened from the same path by a fresh loader.
  const store = loader.load("src/editor/repository/store.ts");
  const first = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  const before = {
    attempts: Number(
      (await first.db
        .prepare("SELECT attempt_count FROM publication_intents WHERE id = ?")
        .get(published.json.intentId)).attempt_count,
    ),
    state: String(
      (await first.db.prepare("SELECT state FROM publication_intents WHERE id = ?").get(
        published.json.intentId,
      )).state,
    ),
  };
  first.close();
  assert(existsSync(dbPath), "the database file persists");

  const restarted = makeLoader();
  const projection = restarted.load("src/editor/repository/public.ts");
  const second = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    const detail = (await projection.getPublicIssue(second.db, fixture.slug));
    assert(detail, "the published issue resolves after the restart");
    assertEqual(detail.revisionSha256, fixture.revisionSha256, "same revision after restart");
    assertEqual(detail.intentState, "verified", "still verified after restart");
    const after = {
      attempts: Number(
        (await second.db
          .prepare("SELECT attempt_count FROM publication_intents WHERE id = ?")
          .get(published.json.intentId)).attempt_count,
      ),
      state: String(
        (await second.db
          .prepare("SELECT state FROM publication_intents WHERE id = ?")
          .get(published.json.intentId)).state,
      ),
    };
    assertEqual(after.state, before.state, "intent state unchanged by the restart");
    assertEqual(after.attempts, before.attempts, "the restart did not re-execute the publication");
    assertEqual(
      Number((await second.db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      1,
      "still exactly one intent",
    );
  } finally {
    second.close();
  }
});

await test("the draft sentinel never reaches the published projection", async () => {
  const dbPath = freshDb("gateb-b4-sentinel-");
  const loader = makeLoader();
  const items = loader.load("src/app/api/editor/items/route.ts");
  session.cookie = ADMIN_KEY;
  const created = await readResponse(
    await items.POST(
      request({
        slug: "draft-sentinel-issue",
        title: "Draft Sentinel",
        blocks: [{ markdown: "DRAFT_LEAK_SENTINEL_9f3a must never be public." }],
      }),
    ),
  );
  assertEqual(created.status, 201, "draft created");

  const store = loader.load("src/editor/repository/store.ts");
  const projection = loader.load("src/editor/repository/public.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual((await projection.listPublicIssues(handle.db)).length, 0, "no public issues");
    assertEqual(
      (await projection.getPublicIssue(handle.db, "draft-sentinel-issue")),
      null,
      "the draft slug does not resolve publicly",
    );
  } finally {
    handle.close();
  }
});

await test("a bookkeeping guard: the publisher refuses without a transaction", async () => {
  const dbPath = freshDb("gateb-b4-no-tx-");
  const loader = makeLoader();
  const store = loader.load("src/editor/repository/store.ts");
  const { setPublishedPointer } = loader.load("src/editor/repository/intents.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    await assertRejects(
      async () => (await setPublishedPointer(handle.db, "item_x", "rev_x")),
      expectCode("INTERNAL"),
      "the pointer can only move inside a transaction",
    );
  } finally {
    handle.close();
  }
});

finish("S06 first real loop (fixture layer)");
