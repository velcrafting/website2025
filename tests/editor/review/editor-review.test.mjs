// tests/editor/review/editor-review.test.mjs
//
// Gate B / S05 acceptance. Two layers of evidence:
//
//   1. The REAL route handlers (src/app/api/editor/**/route.ts) are compiled from
//      disk and invoked with a fabricated Request. `next/headers` is stubbed so
//      the real `src/lib/admin.ts` `requireAdmin()` runs against a controlled
//      session — no real credential is read.
//   2. The real services are driven directly for the properties a request can
//      only show indirectly (locked-block preservation, invalidation counts).
//
// Everything writes to a temporary database under the test directory.
// Evidence class: fixture/synthetic.

import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  assert,
  assertEqual,
  createModuleLoader,
  finish,
  makeTempRoot,
  suite,
  test,
} from "../_module-loader.mjs";

const MIGRATIONS_DIR = join(createModuleLoader().repo, "db", "migrations");
const ADMIN_KEY = "test-only-admin-key-not-a-secret";

/** Mutable session state the stubbed next/headers reads. */
const session = { cookie: undefined, adminKey: ADMIN_KEY };
let currentDbPath = null;

function makeLoader() {
  return createModuleLoader({
    // A test-only key, never a real credential, and never echoed to an artifact.
    env: {
      ADMIN_KEY,
      EDITOR_DB_PATH: currentDbPath ?? "",
      EDITOR_MIGRATIONS_DIR: MIGRATIONS_DIR,
      EDITOR_HUMAN_SUBJECT_ID: "editor_fixture",
      EDITOR_TEST_TARGET: "http://127.0.0.1:3410",
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
        redirect: (target) => {
          const error = new Error(`NEXT_REDIRECT:${target}`);
          error.__redirect = target;
          throw error;
        },
        notFound: () => {
          throw new Error("NEXT_NOT_FOUND");
        },
      }),
      "next/cache": () => ({ revalidatePath: () => {} }),
      "next/link": () => ({ default: () => null }),
    },
  });
}

function freshDb(prefix) {
  const root = makeTempRoot(prefix);
  currentDbPath = join(root, "editor.db");
  return currentDbPath;
}

function request(body, url = "http://127.0.0.1:3410/api/editor/test") {
  return {
    url,
    headers: new Map([["content-type", "application/json"]]),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => request(body, url),
  };
}

async function readResponse(response) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, json: parsed, text };
}

function signedIn() {
  session.cookie = ADMIN_KEY;
}
function signedOut() {
  session.cookie = undefined;
}

suite("S05: route authorization is rechecked before any side effect");

await test("a denied create request writes nothing and creates no database", async () => {
  const dbPath = freshDb("gateb-b3-deny-create-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/items/route.ts");
  signedOut();

  const response = await route.POST(
    request({ slug: "denied-issue", title: "Denied", blocks: [{ markdown: "x" }] }),
  );
  const result = await readResponse(response);

  assertEqual(result.status, 401, "unauthenticated create is refused");
  assertEqual(result.json.error, "SESSION_REQUIRED", "stable error code");
  assert(!existsSync(dbPath), "no database file was created by the denied request");
});

await test("a denied save request writes nothing", async () => {
  const dbPath = freshDb("gateb-b3-deny-save-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/items/[id]/revisions/route.ts");
  signedOut();

  const response = await route.POST(request({ title: "Nope", blocks: [] }), {
    params: (await Promise.resolve({ id: "item_x" })),
  });
  const result = await readResponse(response);
  assertEqual(result.status, 401, "unauthenticated save is refused");
  assert(!existsSync(dbPath), "no database file was created");
});

await test("a denied approval request writes nothing", async () => {
  const dbPath = freshDb("gateb-b3-deny-approve-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/approvals/route.ts");
  signedOut();

  const response = await route.POST(
    request({
      itemId: "item_x",
      revisionId: "rev_x",
      revisionSha256: "0".repeat(64),
      manifestSha256: "0".repeat(64),
    }),
  );
  const result = await readResponse(response);
  assertEqual(result.status, 401, "unauthenticated approval is refused");
  assert(!existsSync(dbPath), "no database file was created");
});

await test("a denied capture request writes nothing", async () => {
  const dbPath = freshDb("gateb-b3-deny-capture-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/sources/route.ts");
  signedOut();

  const response = await route.POST(
    request({ canonicalUrl: "https://example.com/x", title: "X" }),
  );
  const result = await readResponse(response);
  assertEqual(result.status, 401, "unauthenticated capture is refused");
  assert(!existsSync(dbPath), "no database file was created");
});

await test("a denied publication request writes nothing", async () => {
  const dbPath = freshDb("gateb-b3-deny-publish-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/publication-intents/route.ts");
  signedOut();

  const response = await route.POST(
    request({ itemId: "item_x", approvalId: "approval_x", revisionId: "rev_x" }),
  );
  const result = await readResponse(response);
  assertEqual(result.status, 401, "unauthenticated publish is refused");
  assert(!existsSync(dbPath), "no database file was created");
});

await test("an authorized create succeeds and reports the artifact hashes", async () => {
  const dbPath = freshDb("gateb-b3-allow-create-");
  const loader = makeLoader();
  const route = loader.load("src/app/api/editor/items/route.ts");
  signedIn();

  const response = await route.POST(
    request({
      slug: "first-plumbing-issue",
      title: "First Plumbing Issue",
      summary: "A short summary.",
      blocks: [{ heading: "Intro", markdown: "Body text.", humanLocked: true }],
    }),
  );
  const result = await readResponse(response);
  assertEqual(result.status, 201, "authorized create succeeds");
  assert((await /^item_/.test(result.json.itemId)), "item id returned");
  assert((await /^[0-9a-f]{64}$/.test(result.json.revisionSha256)), "revision hash returned");
  assert((await /^[0-9a-f]{64}$/.test(result.json.manifestSha256)), "manifest hash returned");
  assert(existsSync(dbPath), "the database now exists");
});

suite("S05: save conflicts, locked blocks and approval invalidation");

await test("A2: a stale save returns 409 and preserves the submitted buffer", async () => {
  const fresh = freshDb("gateb-b3-conflict-");
  const loader = makeLoader();
  const items = loader.load("src/app/api/editor/items/route.ts");
  const revisions = loader.load("src/app/api/editor/items/[id]/revisions/route.ts");
  signedIn();

  const created = await readResponse(
    await items.POST(
      request({
        slug: "conflict-issue",
        title: "Conflict",
        blocks: [{ markdown: "Version one." }],
      }),
    ),
  );
  const itemId = created.json.itemId;
  const firstRevisionId = created.json.revisionId;

  const saved = await readResponse(
    await revisions.POST(
      request({
        expectedRevisionId: firstRevisionId,
        title: "Conflict",
        blocks: [{ markdown: "Version two." }],
      }),
      { params: (await Promise.resolve({ id: itemId })) },
    ),
  );
  assertEqual(saved.status, 200, "the first save succeeds");

  const conflicted = await readResponse(
    await revisions.POST(
      request({
        expectedRevisionId: firstRevisionId,
        title: "Conflict",
        blocks: [{ markdown: "Unsaved buffer text." }],
      }),
      { params: (await Promise.resolve({ id: itemId })) },
    ),
  );
  assertEqual(conflicted.status, 409, "the stale save conflicts");
  assertEqual(conflicted.json.error, "CONFLICT_STALE_REVISION", "stable conflict code");
  assertEqual(
    conflicted.json.submitted.blocks[0].markdown,
    "Unsaved buffer text.",
    "the submitted buffer is echoed back so the user keeps their work",
  );

  // Nothing was written: the item is still at revision two with two revisions.
  const store = loader.load("src/editor/repository/store.ts");
  const revisionRepo = loader.load("src/editor/repository/revisions.ts");
  const handle = store.openEditorStore({ dbPath: fresh, migrationsDir: MIGRATIONS_DIR });
  try {
    const all = (await revisionRepo.listRevisions(handle.db, itemId));
    assertEqual(all.length, 2, "no third revision was written");
    assert(
      !all.some((r) => r.blocks[0].markdown === "Unsaved buffer text."),
      "the conflicted buffer was not persisted",
    );
  } finally {
    handle.close();
  }
});

await test("A3a: a HUMAN save may edit a locked block, and the lock flag follows the submission", async () => {
  const dbPath = freshDb("gateb-b3-locked-human-");
  const loader = makeLoader();
  const createIssue = loader.load("src/app/api/editor/items/route.ts");
  const saveRoute = loader.load("src/app/api/editor/items/[id]/revisions/route.ts");
  signedIn();

  const created = await readResponse(
    await createIssue.POST(
      request({
        slug: "locked-issue-human",
        title: "Locked",
        blocks: [{ heading: "Pinned", markdown: "Pinned excerpt text.", humanLocked: true }],
      }),
    ),
  );
  const itemId = created.json.itemId;

  const store = loader.load("src/editor/repository/store.ts");
  const revisions = loader.load("src/editor/repository/revisions.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  let lockedId;
  try {
    lockedId = (await revisions.listRevisions(handle.db, itemId))[0].blocks[0].id;
  } finally {
    handle.close();
  }

  // The human path is the route, which saves with origin "human". Steven's own
  // text must land even when the block is locked — the lock protects it from
  // automated passes, not from him.
  const saved = await readResponse(
    await saveRoute.POST(
      request({
        expectedRevisionId: created.json.revisionId,
        title: "Locked",
        blocks: [
          { id: lockedId, heading: "Pinned", markdown: "Steven's own replacement text.", humanLocked: true },
          { heading: "New", markdown: "A newly added section." },
        ],
      }),
      { params: (await Promise.resolve({ id: itemId })) },
    ),
  );
  assertEqual(saved.status, 200, "the human save succeeds");
  assertEqual(
    saved.json.preservedLockedBlocks,
    0,
    "a human save preserves nothing against the editor's intent",
  );

  const after = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    const latest = (await revisions.listRevisions(after.db, itemId))[0];
    const edited = latest.blocks.find((b) => b.id === lockedId);
    assert(edited, "the block is still present");
    assertEqual(
      edited.markdown,
      "Steven's own replacement text.",
      "the human edit is stored, not silently reverted",
    );
    assertEqual(edited.humanLocked, true, "the block stays locked for future automated passes");
    assertEqual(latest.blocks.length, 2, "the new section was added");
    assertEqual(latest.origin, "human", "the revision is recorded as human");
  } finally {
    after.close();
  }
});

await test("A3b: a NON-HUMAN save cannot rewrite a locked block", async () => {
  const dbPath = freshDb("gateb-b3-locked-machine-");
  const loader = makeLoader();
  const store = loader.load("src/editor/repository/store.ts");
  const revisions = loader.load("src/editor/repository/revisions.ts");
  const { createIssue, saveIssueRevision } = loader.load("src/editor/revision/service.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });

  try {
    const created = (await createIssue(handle, {
      slug: "locked-issue-machine",
      title: "Locked",
      blocks: [{ id: "blk_locked", heading: "Pinned", markdown: "Pinned excerpt text.", humanLocked: true }],
      createdBy: "editor_fixture",
      origin: "human",
    }));

    // A regeneration proposal (origin "model") tries to rewrite the locked text.
    const result = (await saveIssueRevision(handle, {
      itemId: created.item.id,
      expectedRevisionId: created.revision.id,
      title: "Locked",
      blocks: [
        { id: "blk_locked", heading: "Pinned", markdown: "REWRITTEN BY AN AUTOMATED PASS", humanLocked: true },
        { heading: "Machine added", markdown: "A machine-authored section." },
      ],
      createdBy: "regeneration",
      origin: "model",
    }));

    assertEqual(result.preservedLockedBlocks, 1, "the automated pass's locked rewrite was refused");
    const locked = result.revision.blocks.find((b) => b.id === "blk_locked");
    assertEqual(
      locked.markdown,
      "Pinned excerpt text.",
      "locked human text survives an automated pass byte-for-byte",
    );
    assertEqual(result.revision.origin, "model", "the revision records its real origin");
    assertEqual(result.revision.blocks.length, 2, "the unlocked new section was still accepted");
    assert(
      (await revisions.listRevisions(handle.db, created.item.id)).length === 2,
      "the proposal is stored as a new revision rather than mutating history",
    );
  } finally {
    handle.close();
  }
});

await test("A4: saving a new revision invalidates the live approval", async () => {
  const dbPath = freshDb("gateb-b3-invalidate-");
  const loader = makeLoader();
  const createRoute = loader.load("src/app/api/editor/items/route.ts");
  const saveRoute = loader.load("src/app/api/editor/items/[id]/revisions/route.ts");
  const approveRoute = loader.load("src/app/api/editor/approvals/route.ts");
  signedIn();

  const created = await readResponse(
    await createRoute.POST(
      request({
        slug: "approval-issue",
        title: "Approval",
        blocks: [{ markdown: "Body." }],
      }),
    ),
  );
  const itemId = created.json.itemId;

  const approval = await readResponse(
    await approveRoute.POST(
      request({
        itemId,
        revisionId: created.json.revisionId,
        revisionSha256: created.json.revisionSha256,
        manifestSha256: created.json.manifestSha256,
      }),
    ),
  );
  assertEqual(approval.status, 201, "approval created");
  const approvalId = approval.json.approvalId;

  const saved = await readResponse(
    await saveRoute.POST(
      request({
        expectedRevisionId: created.json.revisionId,
        title: "Approval",
        blocks: [{ markdown: "Body." }, { markdown: "Another section." }],
      }),
      { params: (await Promise.resolve({ id: itemId })) },
    ),
  );
  assertEqual(saved.status, 200, "the edit is saved");
  assertEqual(saved.json.invalidatedApprovals, 1, "the live approval was invalidated");

  const approveAgain = await readResponse(
    await approveRoute.POST(
      request({
        itemId,
        revisionId: created.json.revisionId,
        revisionSha256: created.json.revisionSha256,
        manifestSha256: created.json.manifestSha256,
      }),
    ),
  );
  assertEqual(approveAgain.status, 409, "the stale revision is no longer approvable");
  assertEqual(approveAgain.json.error, "APPROVAL_REVISION_MISMATCH", "stable code");

  // The approval for the superseded revision is recorded as invalidated.
  const store = loader.load("src/editor/repository/store.ts");
  const { getApproval } = loader.load("src/editor/repository/approvals.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    const record = (await getApproval(handle.db, approvalId));
    assertEqual(record.state, "invalidated", "approval state reflects the change");
    assertEqual(record.invalidatedReason, "revision-created", "reason recorded");
  } finally {
    handle.close();
  }
});

await test("an approved revision cannot be approved twice into two live approvals", async () => {
  const dbPath = freshDb("gateb-b3-double-approve-");
  const loader = makeLoader();
  const createRoute = loader.load("src/app/api/editor/items/route.ts");
  const approveRoute = loader.load("src/app/api/editor/approvals/route.ts");
  signedIn();

  const created = await readResponse(
    await createRoute.POST(
      request({ slug: "double-approve", title: "Double", blocks: [{ markdown: "Body." }] }),
    ),
  );
  const body = {
    itemId: created.json.itemId,
    revisionId: created.json.revisionId,
    revisionSha256: created.json.revisionSha256,
    manifestSha256: created.json.manifestSha256,
  };
  const first = await readResponse(await approveRoute.POST(request(body)));
  const second = await readResponse(await approveRoute.POST(request(body)));
  assertEqual(first.status, 201, "first approval created");
  assertEqual(second.status, 201, "second approval created");

  const store = loader.load("src/editor/repository/store.ts");
  const { listApprovalsForRevision } = loader.load("src/editor/repository/approvals.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    const live = (await listApprovalsForRevision(handle.db, created.json.revisionId)).filter(
      (a) => a.state === "approved",
    );
    assertEqual(live.length, 2, "both approvals are recorded distinctly (history preserved)");
    assert(
      live[0].id !== live[1].id,
      "each approval is its own record rather than a mutated single row",
    );
  } finally {
    handle.close();
  }
});

suite("S05: approval validation through the real route");

await test("approving with a mismatched hash is refused and writes nothing", async () => {
  const dbPath = freshDb("gateb-b3-hash-");
  const loader = makeLoader();
  const createRoute = loader.load("src/app/api/editor/items/route.ts");
  const approveRoute = loader.load("src/app/api/editor/approvals/route.ts");
  signedIn();

  const created = await readResponse(
    await createRoute.POST(
      request({ slug: "hash-issue", title: "Hash", blocks: [{ markdown: "Body." }] }),
    ),
  );
  const response = await readResponse(
    await approveRoute.POST(
      request({
        itemId: created.json.itemId,
        revisionId: created.json.revisionId,
        revisionSha256: "0".repeat(64),
        manifestSha256: created.json.manifestSha256,
      }),
    ),
  );
  assertEqual(response.status, 409, "hash mismatch refused");
  assertEqual(response.json.error, "APPROVAL_REVISION_MISMATCH", "stable code");

  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM approvals").get()).n),
      0,
      "no approval row written",
    );
  } finally {
    handle.close();
  }
});

await test("a non-loopback target is refused through the route", async () => {
  const dbPath = freshDb("gateb-b3-target-");
  const loader = makeLoader();
  const createRoute = loader.load("src/app/api/editor/items/route.ts");
  const approveRoute = loader.load("src/app/api/editor/approvals/route.ts");
  signedIn();

  const created = await readResponse(
    await createRoute.POST(
      request({ slug: "target-issue", title: "Target", blocks: [{ markdown: "Body." }] }),
    ),
  );
  const response = await readResponse(
    await approveRoute.POST(
      request({
        itemId: created.json.itemId,
        revisionId: created.json.revisionId,
        revisionSha256: created.json.revisionSha256,
        manifestSha256: created.json.manifestSha256,
        targetRef: "https://velcrafting.com",
      }),
    ),
  );
  assertEqual(response.status, 403, "production target refused");
  assertEqual(response.json.error, "TARGET_NOT_ALLOWED", "stable code");
  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM approvals").get()).n),
      0,
      "no approval row written",
    );
  } finally {
    handle.close();
  }
});

await test("an unsafe slug is refused through the route", async () => {
  const dbPath = freshDb("gateb-b3-slug-");
  const loader = makeLoader();
  const createRoute = loader.load("src/app/api/editor/items/route.ts");
  signedIn();

  for (const slug of ["../escape", "a/b", "UPPER CASE", "trail-"]) {
    const response = await readResponse(
      await createRoute.POST(
        request({ slug, title: "Bad", blocks: [{ markdown: "Body." }] }),
      ),
    );
    assertEqual(response.status, 400, `refuse slug ${slug}`);
    assertEqual(response.json.error, "VALIDATION_FAILED", "stable code");
  }
  const store = loader.load("src/editor/repository/store.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(
      Number((await handle.db.prepare("SELECT COUNT(*) AS n FROM content_items").get()).n),
      0,
      "no items written",
    );
  } finally {
    handle.close();
  }
});

await test("source references are carried forward by a save that does not resend them", async () => {
  const dbPath = freshDb("gateb-b3-source-carry-");
  const loader = makeLoader();
  const store = loader.load("src/editor/repository/store.ts");
  const sources = loader.load("src/editor/repository/sources.ts");
  const revisions = loader.load("src/editor/repository/revisions.ts");
  const { createIssue, saveIssueRevision } = loader.load("src/editor/revision/service.ts");
  const { listProvenanceForRevision } = loader.load("src/editor/repository/public.ts");
  const handle = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });

  try {
    // A captured source, then a revision that pins its version — this is the
    // shape prepare-draft creates for the first real loop.
    const { source } = (await store.withTransaction(handle.db, async () =>
      (await sources.createSourceWithCapture(handle.db, {
        provider: "arxiv-docs",
        canonicalUrl: "https://info.arxiv.org/help/api/user-manual.html",
        title: "Fixture source for provenance",
        accessLevel: "metadata_only",
      })),
    ));
    const versionIds = (await sources.listSourceVersions(handle.db, source.id)).map((v) => v.id);
    assertEqual(versionIds.length, 1, "the capture recorded one version to pin");

    const created = (await createIssue(handle, {
      slug: "sourced-issue",
      title: "Sourced",
      blocks: [{ id: "blk_pinned_source", markdown: "Pinned provenance text.", humanLocked: true }],
      sourceVersionIds: versionIds,
      createdBy: "scaffold",
      origin: "model",
    }));
    assertEqual(created.revision.sourceVersionIds.length, 1, "the scaffold pins its source");

    const provenance = (await listProvenanceForRevision(handle.db, created.revision.id));
    assertEqual(provenance.length, 1, "the public projection can resolve the pinned source");
    assertEqual(provenance[0].provider, "arxiv-docs", "provider carried through");
    assertEqual(provenance[0].accessLevel, "metadata_only", "the honest access level is preserved");
    assertEqual(
      provenance[0].canonicalUrl,
      "https://info.arxiv.org/help/api/user-manual.html",
      "the canonical source URL is available for a reader-visible link",
    );

    // A human save through the editor does not send sourceVersionIds, so they
    // must be inherited rather than silently dropped. The text must actually
    // change: identical content is a duplicate, not a new revision.
    const saved = (await saveIssueRevision(handle, {
      itemId: created.item.id,
      expectedRevisionId: created.revision.id,
      title: "Sourced",
      blocks: [
        { id: "blk_pinned_source", markdown: "Pinned provenance text.", humanLocked: true },
        { id: "blk_digest", heading: "Digest", markdown: "Steven's own digest text.", humanLocked: false },
      ],
      createdBy: "steven",
      origin: "human",
    }));
    assert(saved.revision.revisionNumber === 2, "the edit is stored as revision 2");
    assertEqual(
      saved.revision.sourceVersionIds.length,
      1,
      "source references survive a human edit",
    );
    assertEqual(
      (await listProvenanceForRevision(handle.db, saved.revision.id)).length,
      1,
      "provenance still resolves on the new revision",
    );
    assert(
      (await revisions.listRevisions(handle.db, created.item.id)).length === 2,
      "the edit is a new revision",
    );
  } finally {
    handle.close();
  }
});

await test("line endings are canonicalised on save and tolerated by the renderer", async () => {
  const loader = makeLoader();
  const { normaliseBlocks } = loader.load("src/editor/validation/revision.ts");
  const { paragraphsOf, renderBlocksToHtml } = loader.load("src/editor/render/bundle.ts");

  const crlf = "First paragraph.\r\n\r\nSecond paragraph.";
  const blocks = normaliseBlocks([
    { heading: "Heading\r\nwith break", markdown: crlf, humanLocked: true },
  ]);
  assertEqual(blocks[0].markdown.includes("\r"), false, "CRLF is canonicalised to LF on the way in");
  assertEqual(blocks[0].heading.includes("\r"), false, "headings are canonicalised too");

  // Already-stored CRLF text (written before this fix) must still render correctly.
  assertEqual(paragraphsOf(crlf).length, 2, "the renderer splits CRLF text into two paragraphs");
  assertEqual(paragraphsOf("a\r\rb").length, 2, "a lone CR pair is tolerated");
  assertEqual(paragraphsOf("a\n\nb").length, 2, "plain LF still splits");

  const html = renderBlocksToHtml(blocks);
  assertEqual((html.match(/<p>/g) || []).length, 2, "both paragraphs render as their own <p>");
  assertEqual(html.includes("\r"), false, "no carriage return reaches the rendered output");
  assert(
    html.includes("<p>First paragraph.</p>") && html.includes("<p>Second paragraph.</p>"),
    "each paragraph is emitted separately",
  );
});

suite("S05: the protected preview");

async function createIssueFixture(loader, slug) {
  const createRoute = loader.load("src/app/api/editor/items/route.ts");
  signedIn();
  const created = await readResponse(
    await createRoute.POST(
      request({
        slug,
        title: "Preview Issue",
        blocks: [{ heading: "Section", markdown: "Draft preview body PREVIEW_SENTINEL_7c2d." }],
      }),
    ),
  );
  assertEqual(created.status, 201, "fixture issue created");
  return created.json;
}

await test("A5: an unauthenticated preview exposes no draft body and is not cacheable", async () => {
  const dbPath = freshDb("gateb-b3-preview-deny-");
  const loader = makeLoader();
  const created = await createIssueFixture(loader, "preview-deny");
  const preview = loader.load("src/app/admin/editor/preview/[revisionId]/route.ts");
  signedOut();

  const response = await preview.GET(
    request({}, `http://127.0.0.1:3410/admin/editor/preview/${created.revisionId}`),
    { params: (await Promise.resolve({ revisionId: created.revisionId })) },
  );
  const text = await response.text();
  assertEqual(response.status, 401, "unauthenticated preview is refused");
  assert(
    !text.includes("PREVIEW_SENTINEL_7c2d"),
    "the draft body is not present in the refusal",
  );
  assertEqual(
    (await response.headers.get("cache-control")),
    "private, no-store, max-age=0",
    "the refusal is not cacheable",
  );
  assert(dbPath, "fixture database path recorded");
});

await test("an authenticated preview returns the draft with a private, no-store header", async () => {
  freshDb("gateb-b3-preview-allow-");
  const loader = makeLoader();
  const created = await createIssueFixture(loader, "preview-allow");
  const preview = loader.load("src/app/admin/editor/preview/[revisionId]/route.ts");
  signedIn();

  const response = await preview.GET(
    request({}, `http://127.0.0.1:3410/admin/editor/preview/${created.revisionId}`),
    { params: (await Promise.resolve({ revisionId: created.revisionId })) },
  );
  const text = await response.text();
  assertEqual(response.status, 200, "authenticated preview renders");
  assertEqual(
    (await response.headers.get("cache-control")),
    "private, no-store, max-age=0",
    "preview is explicitly private and uncacheable",
  );
  assertEqual((await response.headers.get("x-robots-tag")), "noindex, nofollow", "preview is not indexable");
  assert(text.includes("PREVIEW_SENTINEL_7c2d"), "the draft body is present for the session");
  assert(text.includes(created.revisionSha256), "the preview names the exact revision hash");
  assert(
    text.includes("Protected preview — not published"),
    "the preview is labelled as unpublished",
  );
});

await test("a preview of an unknown revision returns 404 without leaking anything", async () => {
  freshDb("gateb-b3-preview-missing-");
  const loader = makeLoader();
  const preview = loader.load("src/app/admin/editor/preview/[revisionId]/route.ts");
  signedIn();

  const response = await preview.GET(
    request({}, "http://127.0.0.1:3410/admin/editor/preview/rev_missing"),
    { params: (await Promise.resolve({ revisionId: "rev_missing" })) },
  );
  assertEqual(response.status, 404, "unknown revision is a 404");
  assertEqual(
    (await response.headers.get("cache-control")),
    "private, no-store, max-age=0",
    "404 is not cacheable either",
  );
});

finish("S05 editor review");
