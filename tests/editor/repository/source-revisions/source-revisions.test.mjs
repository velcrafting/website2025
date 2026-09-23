// tests/editor/repository/source-revisions/source-revisions.test.mjs
//
// Gate B / S04a acceptance. Everything here runs against a REAL SQLite database
// in a temporary directory and executes the REAL repository source compiled from
// disk. No mirrored logic, no fake store.
//
// Evidence class: fixture/synthetic (temporary database, fabricated inputs).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

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
} from "../../_module-loader.mjs";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite");

const loader = createModuleLoader();
const store = loader.load("src/editor/repository/store.ts");
const sources = loader.load("src/editor/repository/sources.ts");
const revisions = loader.load("src/editor/repository/revisions.ts");

const MIGRATIONS_DIR = join(loader.repo, "db", "migrations");

function freshStore(prefix = "gateb-b1-") {
  const root = makeTempRoot(prefix);
  const dbPath = join(root, "editor.db");
  const opened = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  return { root, dbPath, opened };
}

const GOOD_SOURCE = {
  provider: "arxiv",
  upstreamId: "2401.00001v1",
  canonicalUrl: "https://arxiv.org/abs/2401.00001v1",
  title: "A Fixture Paper For Plumbing",
  authors: ["Fixture Author"],
  publishedAt: "2024-01-01T00:00:00Z",
  accessLevel: "abstract_only",
  note: "fixture only",
};

suite("S04a: migrations");

await test("migrations create the schema and record a receipt", async () => {
  const { opened } = freshStore();
  try {
    assert(opened.migrationsApplied.length >= 1, "expected at least one migration applied");
    const receipt = store
      ? (await opened.db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get())
      : null;
    assertEqual(Number(receipt.n), opened.migrationsApplied.length, "receipt count");
    const tables = opened.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => String(r.name));
    for (const expected of [
      "capture_events",
      "content_items",
      "content_revisions",
      "schema_migrations",
      "source_versions",
      "sources",
    ]) {
      assert(tables.includes(expected), `missing table ${expected}`);
    }
  } finally {
    opened.close();
  }
});

await test("re-opening the same database applies nothing and keeps data", async () => {
  const { dbPath, opened } = freshStore();
  const revisionId = (await store.withTransaction(opened.db, async () => {
    const item = (await revisions.createItem(opened.db, {
      type: "issue",
      slug: "durable-issue",
      title: "Durable Issue",
    }));
    return (await revisions.insertRevision(opened.db, {
      itemId: item.id,
      expectedRevisionId: null,
      title: "Durable Issue",
      blocks: [{ markdown: "First body." }],
      createdBy: "fixture",
      origin: "fixture",
    })).id;
  }));
  opened.close();

  // A1: durability across a full close/reopen of the connection.
  const reopened = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  try {
    assertEqual(reopened.migrationsApplied.length, 0, "no migrations re-applied");
    const revision = (await revisions.getRevision(reopened.db, revisionId));
    assert(revision, "revision survived reopen");
    assertEqual(revision.revisionNumber, 1, "revision number preserved");
    assert(
      (await /^[0-9a-f]{64}$/.test(revision.contentSha256)),
      "content hash preserved as sha256 hex",
    );
    assertEqual(revision.blocks[0].markdown, "First body.", "block body preserved");
  } finally {
    reopened.close();
  }
});

suite("S04a: sources and immutable source versions");

await test("a capture writes source, capture event and first version atomically", async () => {
  const { opened } = freshStore();
  try {
    const result = (await store.withTransaction(opened.db, async () =>
      (await sources.createSourceWithCapture(opened.db, GOOD_SOURCE)),
    ));
    assert(result.source.id.startsWith("src_"), "source id prefixed");
    assertEqual(result.source.accessLevel, "abstract_only", "honest access level kept");
    assertEqual(
      (await sources.countCaptureEvents(opened.db, result.source.id)),
      1,
      "exactly one capture event",
    );
    const versions = (await sources.listSourceVersions(opened.db, result.source.id));
    assertEqual(versions.length, 1, "exactly one source version");
    assertEqual(
      result.source.currentVersionId,
      versions[0].id,
      "source points at its current version",
    );
    assertEqual(result.source.authors.join(","), "Fixture Author", "authors preserved");
  } finally {
    opened.close();
  }
});

await test("missing author and date stay null rather than being invented", async () => {
  const { opened } = freshStore();
  try {
    const result = (await store.withTransaction(opened.db, async () =>
      (await sources.createSourceWithCapture(opened.db, {
        canonicalUrl: "https://example.com/no-metadata",
        title: "No Metadata",
      })),
    ));
    assertEqual(result.source.authors, null, "authors null");
    assertEqual(result.source.publishedAt, null, "publishedAt null");
  } finally {
    opened.close();
  }
});

await test("a repeated provider identity is rejected", async () => {
  const { opened } = freshStore();
  try {
    (await store.withTransaction(opened.db, async () => (await sources.createSourceWithCapture(opened.db, GOOD_SOURCE))));
    await assertRejects(
      async () =>
        (await store.withTransaction(opened.db, async () =>
          (await sources.createSourceWithCapture(opened.db, GOOD_SOURCE)),
        )),
      expectCode("DUPLICATE_SOURCE"),
      "duplicate source",
    );
    assertEqual((await sources.listSources(opened.db)).length, 1, "still exactly one source");
  } finally {
    opened.close();
  }
});

await test("a repeated source-version fingerprint is rejected and history is not rewritten", async () => {
  const { opened } = freshStore();
  try {
    const { source } = (await store.withTransaction(opened.db, async () =>
      (await sources.createSourceWithCapture(opened.db, GOOD_SOURCE)),
    ));
    const fingerprint = "f".repeat(64);
    (await store.withTransaction(opened.db, async () =>
      (await sources.recordSourceVersion(opened.db, {
        sourceId: source.id,
        fingerprint,
        retrievedUrl: source.canonicalUrl,
        accessLevel: "partial",
      })),
    ));
    await assertRejects(
      async () =>
        (await store.withTransaction(opened.db, async () =>
          (await sources.recordSourceVersion(opened.db, {
            sourceId: source.id,
            fingerprint,
            retrievedUrl: source.canonicalUrl,
            accessLevel: "full_verified",
          })),
        )),
      expectCode("DUPLICATE_SOURCE_VERSION"),
      "duplicate fingerprint",
    );
    const versions = (await sources.listSourceVersions(opened.db, source.id));
    assertEqual(versions.length, 2, "first version row is never overwritten");
    assert(
      versions.some((v) => v.accessLevel === "partial"),
      "the earlier partial read is preserved",
    );
  } finally {
    opened.close();
  }
});

await test("unsafe capture URLs are rejected before any write", async () => {
  const { opened } = freshStore();
  try {
    const bad = [
      ["loopback", "http://localhost/x"],
      ["private ip", "http://10.0.0.5/x"],
      ["link local", "http://169.254.169.254/latest/meta-data"],
      ["ipv6 loopback", "http://[::1]/x"],
      ["credentials", "https://user:pass@example.com/x"],
      ["scheme", "ftp://example.com/x"],
      ["not a url", "not-a-url"],
    ];
    for (const [label, url] of bad) {
      await assertRejects(
        async () =>
          (await store.withTransaction(opened.db, async () =>
            (await sources.createSourceWithCapture(opened.db, { canonicalUrl: url, title: label })),
          )),
        expectCode("UNSAFE_URL"),
        `reject ${label}`,
      );
    }
    assertEqual((await sources.listSources(opened.db)).length, 0, "no source rows written");
    assertEqual(
      Number((await opened.db.prepare("SELECT COUNT(*) AS n FROM capture_events").get()).n),
      0,
      "no capture events written",
    );
  } finally {
    opened.close();
  }
});

suite("S04a: content items and compare-and-swap revisions");

await test("a revision is created and the item pointer moves with it", async () => {
  const { opened } = freshStore();
  try {
    const { item, revision } = (await store.withTransaction(opened.db, async () => {
      const created = (await revisions.createItem(opened.db, {
        type: "issue",
        slug: "first-plumbing-issue",
        title: "First Plumbing Issue",
      }));
      const rev = (await revisions.insertRevision(opened.db, {
        itemId: created.id,
        expectedRevisionId: null,
        title: "First Plumbing Issue",
        summary: "A summary.",
        byline: "Fixture",
        blocks: [{ markdown: "Body one.", humanLocked: true }],
        createdBy: "fixture",
        origin: "fixture",
      }));
      return { item: (await revisions.getItem(opened.db, created.id)), revision: rev };
    }));
    assertEqual(revision.revisionNumber, 1, "first revision number");
    assertEqual(revision.parentRevisionId, null, "no parent");
    assertEqual(item.currentRevisionId, revision.id, "item pointer updated");
    assertEqual(revision.blocks[0].humanLocked, true, "human lock recorded");
    assertEqual(revision.editorialState, "draft", "starts as draft");
  } finally {
    opened.close();
  }
});

await test("identical content is not stored twice (A3 support)", async () => {
  const { opened } = freshStore();
  try {
    const item = (await store.withTransaction(opened.db, async () =>
      (await revisions.createItem(opened.db, { type: "issue", slug: "dup-issue", title: "Dup" })),
    ));
    const rev = (await store.withTransaction(opened.db, async () =>
      (await revisions.insertRevision(opened.db, {
        itemId: item.id,
        expectedRevisionId: null,
        title: "Dup",
        blocks: [{ markdown: "Same words." }],
        createdBy: "fixture",
        origin: "fixture",
      })),
    ));
    await assertRejects(
      async () =>
        (await store.withTransaction(opened.db, async () =>
          (await revisions.insertRevision(opened.db, {
            itemId: item.id,
            expectedRevisionId: rev.id,
            title: "Dup",
            blocks: [{ markdown: "Same words.", humanLocked: false, id: rev.blocks[0].id }],
            createdBy: "fixture",
            origin: "fixture",
          })),
        )),
      expectCode("DUPLICATE_REVISION"),
      "identical content rejected",
    );
    assertEqual((await revisions.listRevisions(opened.db, item.id)).length, 1, "no extra revision");
  } finally {
    opened.close();
  }
});

await test("A2: a stale expected revision is a conflict and writes nothing", async () => {
  const { opened } = freshStore();
  try {
    const item = (await store.withTransaction(opened.db, async () =>
      (await revisions.createItem(opened.db, { type: "issue", slug: "cas-issue", title: "CAS" })),
    ));
    const first = (await store.withTransaction(opened.db, async () =>
      (await revisions.insertRevision(opened.db, {
        itemId: item.id,
        expectedRevisionId: null,
        title: "CAS",
        blocks: [{ markdown: "Version one." }],
        createdBy: "fixture",
        origin: "fixture",
      })),
    ));
    const second = (await store.withTransaction(opened.db, async () =>
      (await revisions.insertRevision(opened.db, {
        itemId: item.id,
        expectedRevisionId: first.id,
        title: "CAS",
        blocks: [{ markdown: "Version two." }],
        createdBy: "fixture",
        origin: "fixture",
      })),
    ));

    // A save built on revision ONE must now conflict: the item is at TWO.
    const error = await assertRejects(
      async () =>
        (await store.withTransaction(opened.db, async () =>
          (await revisions.insertRevision(opened.db, {
            itemId: item.id,
            expectedRevisionId: first.id,
            title: "CAS",
            blocks: [{ markdown: "Version two point five." }],
            createdBy: "fixture",
            origin: "fixture",
          })),
        )),
      expectCode("CONFLICT_STALE_REVISION"),
      "stale save conflicts",
    );
    assertEqual(error.details.currentRevisionId, second.id, "conflict names the current revision");

    const all = (await revisions.listRevisions(opened.db, item.id));
    assertEqual(all.length, 2, "the stale save added no revision");
    assert(
      !all.some((r) => r.blocks[0].markdown === "Version two point five."),
      "the stale buffer was not persisted",
    );
    assertEqual(
      (await revisions.getItem(opened.db, item.id)).currentRevisionId,
      second.id,
      "pointer unchanged",
    );
  } finally {
    opened.close();
  }
});

suite("S04a: constraints, guards and rollback");

await test("a foreign key violation is refused by the database", async () => {
  const { opened } = freshStore();
  try {
    await assertRejects(
      async () =>
        (await store.withTransaction(opened.db, async () => {
          (await opened.db
            .prepare(
              `INSERT INTO content_revisions (
                 id, item_id, parent_revision_id, revision_number, origin, created_by, created_at,
                 title, summary, byline, blocks, source_version_ids, asset_ids, content_sha256,
                 editorial_state, unresolved_questions
               ) VALUES ('rev_orphan','item_missing',NULL,1,'fixture','fixture','2026-01-01T00:00:00Z',
                 'Orphan',NULL,NULL,'[]','[]','[]','${"0".repeat(64)}','draft','[]')`,
            )
            .run());
        })),
      async (error) => (await /FOREIGN KEY constraint failed/i.test(String(error.message))),
      "orphan revision refused",
    );
  } finally {
    opened.close();
  }
});

await test("a failure inside a transaction rolls back every earlier statement", async () => {
  const { opened } = freshStore();
  try {
    await assertRejects(
      async () =>
        (await store.withTransaction(opened.db, async () => {
          (await revisions.createItem(opened.db, { type: "issue", slug: "rollback-issue", title: "R" }));
          throw new Error("simulated failure after the first write");
        })),
      async (error) => (await /simulated failure/.test(error.message)),
      "transaction rethrows",
    );
    assertEqual((await revisions.listItems(opened.db)).length, 0, "no item survived the rollback");
  } finally {
    opened.close();
  }
});

await test("mutating repositories refuse to run outside a transaction", async () => {
  const { opened } = freshStore();
  try {
    await assertRejects(
      async () =>
        (await revisions.createItem(opened.db, { type: "issue", slug: "no-tx", title: "No TX" })),
      expectCode("INTERNAL"),
      "createItem requires a transaction",
    );
  } finally {
    opened.close();
  }
});

await test("an unsafe slug is rejected", async () => {
  const { opened } = freshStore();
  try {
    for (const slug of ["../escape", "a/b", "UPPER", "-leading", "trailing-", "a..b", "%2e%2e"]) {
      await assertRejects(
        async () =>
          (await store.withTransaction(opened.db, async () =>
            (await revisions.createItem(opened.db, { type: "issue", slug, title: "T" })),
          )),
        expectCode("VALIDATION_FAILED"),
        `reject slug ${slug}`,
      );
    }
    assertEqual((await revisions.listItems(opened.db)).length, 0, "no items written");
  } finally {
    opened.close();
  }
});

await test("a private item holds no published pointer", async () => {
  const { opened } = freshStore();
  try {
    const item = (await store.withTransaction(opened.db, async () =>
      (await revisions.createItem(opened.db, {
        type: "issue",
        slug: "not-published",
        title: "Not Published",
        visibility: "private",
      })),
    ));
    const revision = (await store.withTransaction(opened.db, async () =>
      (await revisions.insertRevision(opened.db, {
        itemId: item.id,
        expectedRevisionId: null,
        title: "Not Published",
        blocks: [{ markdown: "Draft body sentinel DRAFT_LEAK_9f3a." }],
        createdBy: "fixture",
        origin: "fixture",
      })),
    ));
    const after = (await revisions.getItem(opened.db, item.id));
    assertEqual(after.visibility, "private", "stays private");
    assertEqual(after.publishedRevisionId, null, "no published pointer");
    assertEqual(after.currentRevisionId, revision.id, "but the draft revision exists");

    // The published projection query is exercised in B2 and B4, where the
    // approval/intent tables it joins exist.
  } finally {
    opened.close();
  }
});

await test("the database file is not created when nothing opens it", async () => {
  const root = makeTempRoot("gateb-b1-lazy-");
  const dbPath = join(root, "editor.db");
  assert(!existsSync(dbPath), "no database file before it is opened");
  const opened = store.openEditorStore({ dbPath, migrationsDir: MIGRATIONS_DIR });
  opened.close();
  assert(existsSync(dbPath), "database file exists after it is opened");
});

finish("S04a source-revision store");
