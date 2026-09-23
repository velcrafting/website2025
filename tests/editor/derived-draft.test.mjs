// tests/editor/derived-draft.test.mjs
//
// "Prepare another draft": reuse a saved draft's own writing as the start of a new one.
//
// This is REUSE, not generation. The copied words are the author's, so the checks that matter are
// about fidelity and independence:
//
//   - The new draft carries the saved title, summary, byline, blocks and pinned sources EXACTLY.
//   - The provenance of those words is recorded in an existing supported field.
//   - The original draft, its hash and its approval/publication state are untouched.
//   - The new draft is independent: editing it does not touch the original.
//   - It carries no approval and no publication authority of its own.
//   - An unauthorized call creates nothing, and a validation failure leaves no partial item.
//
// Real store in a temporary database through the project loader: the action body runs for real,
// against real repositories, with the framework boundaries stubbed.

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createModuleLoader } from "./_module-loader.mjs";
import { loadPageModule } from "./_transform.mjs";

const loader = createModuleLoader();
const { openEditorStore } = loader.load("src/editor/repository/store.ts");
const { createIssue, saveIssueRevision } = loader.load("src/editor/revision/service.ts");
const { listItems, getRevision, listRevisions } = loader.load(
  "src/editor/repository/revisions.ts",
);

const PAGE = "src/app/admin/editor/[id]/page.tsx";
const ADMIN_KEY = "test-admin-key-xyz";

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

function counts(db) {
  const one = (sql) => db.prepare(sql).get().c;
  return {
    items: one("SELECT COUNT(*) c FROM content_items"),
    revisions: one("SELECT COUNT(*) c FROM content_revisions"),
    bundles: one("SELECT COUNT(*) c FROM render_bundles"),
    approvals: one("SELECT COUNT(*) c FROM approvals"),
    intents: one("SELECT COUNT(*) c FROM publication_intents"),
  };
}

const SOURCE_BLOCKS = [
  {
    heading: "How I package a project",
    markdown: "The words I actually wrote.\n\nA second paragraph.",
    humanLocked: true,
    origin: "human",
    // Persisted metadata the editor form does NOT carry. Seeded so a later edit can be checked for
    // silently resetting it.
    section: "opening",
    claims: ["claim_alpha"],
    publicPermissionRecordIds: ["perm_alpha"],
  },
  {
    kind: "figure",
    heading: "",
    markdown: "",
    humanLocked: false,
    origin: "human",
    data: { src: "/projects/x/hero.png", alt: "The dashboard", caption: "Shipped" },
  },
];

function form(fields) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function runAction(dbPath, { authorized = true } = {}) {
  const mod = loadPageModule(PAGE, {
    env: { ADMIN_KEY, EDITOR_DB_PATH: dbPath, EDITOR_HUMAN_SUBJECT_ID: "human_test_subject" },
    cookieStore: authorized ? new Map([["admin", ADMIN_KEY]]) : new Map(),
    // The store resolves its migrations relative to process.cwd(). Pointing it at the repository
    // root is what makes the action's own store open find `db/migrations` — with the default "/"
    // it looks for /db/migrations and the action fails with an ENOENT instead of doing its work.
    cwd: loader.repo,
    // Drive the REAL store and revision service against a temporary database, so the action's
    // effects are inspected in the database rather than recorded by a stub.
    realStore: true,
  });
  return mod;
}

async function invokeAction(mod, fields) {
  let redirected = null;
  let unauthorized = false;
  try {
    await mod.exports.prepareAnotherDraftAction(form(fields));
  } catch (error) {
    if (error && error.__redirect) redirected = error.__redirect;
    else if (error && error.message === "Unauthorized") unauthorized = true;
    else throw error;
  }
  return { redirected, unauthorized };
}

async function inFreshDb(fn) {
  const dir = mkdtempSync(join(tmpdir(), "derived-draft-"));
  const dbPath = join(dir, "editor.db");
  try {
    await fn(dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Create the source draft and return its ids. */
async function seedSource(dbPath) {
  const store = openEditorStore({ dbPath });
  try {
    const created = (await createIssue(store, {
      slug: "packaging-notes",
      title: "Shipping a small tool",
      summary: "What I learned",
      byline: "Steven Pajewski",
      blocks: SOURCE_BLOCKS,
      sourceVersionIds: ["ver_source_alpha"],
      createdBy: "human_test_subject",
    }));
    return { itemId: created.item.id, revisionId: created.revision.id };
  } finally {
    store.close();
  }
}

console.log("\nprepare another draft: exact reuse");

await test("the new draft carries the saved title, summary, byline and blocks exactly", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const before = (() => {
      const store = openEditorStore({ dbPath });
      const snapshot = counts(store.db);
      store.close();
      return snapshot;
    })();

    const { redirected } = await invokeAction(runAction(dbPath), { itemId, revisionId });
    assert.match(String(redirected), /^\/admin\/editor\/item_[^?]+\?status=draft_prepared$/);

    const store = openEditorStore({ dbPath });
    try {
      const after = counts(store.db);
      assert.equal(after.items, before.items + 1);
      assert.equal(after.revisions, before.revisions + 1);
      assert.equal(after.bundles, before.bundles + 1);

      const derivedId = String(redirected).replace("/admin/editor/", "").split("?")[0];
      const derived = (await getRevision(store.db, (await listRevisions(store.db, derivedId))[0].id));
      assert.equal(derived.title, "Shipping a small tool");
      assert.equal(derived.summary, "What I learned");
      assert.equal(derived.byline, "Steven Pajewski");
      assert.equal(derived.blocks.length, 2);
      assert.equal(derived.blocks[0].heading, "How I package a project");
      assert.equal(derived.blocks[0].markdown, "The words I actually wrote.\n\nA second paragraph.");
      assert.equal(derived.blocks[0].humanLocked, true);
      assert.equal(derived.blocks[1].data.src, "/projects/x/hero.png");
      assert.equal(derived.blocks[1].data.alt, "The dashboard");
      assert.equal(derived.blocks[1].data.caption, "Shipped");
    } finally {
      store.close();
    }
  });
});

await test("the pinned sources are carried over, and provenance records the source revision", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const { redirected } = await invokeAction(runAction(dbPath), { itemId, revisionId });
    const derivedId = String(redirected).replace("/admin/editor/", "").split("?")[0];

    const store = openEditorStore({ dbPath });
    try {
      const derived = (await listRevisions(store.db, derivedId))[0];
      // Compared structurally: these values come from modules loaded inside the harness's VM, so
      // their Array prototype differs from this file's and `deepEqual` would reject identical
      // contents. Same assertion, expressed in a realm-independent way.
      assert.equal(
        JSON.stringify(derived.sourceVersionIds),
        JSON.stringify(["ver_source_alpha"]),
        `the pinned sources must carry over, so nothing is re-entered (got ${JSON.stringify(derived.sourceVersionIds)})`,
      );
      assert.equal(
        derived.blocks[0].linkedArticleRevisionId,
        revisionId,
        "provenance must name the saved revision the words came from",
      );
      assert.equal(derived.blocks[1].linkedArticleRevisionId, revisionId);
    } finally {
      store.close();
    }
  });
});

console.log("\nprepare another draft: the original is untouched and the copy is independent");

await test("the original draft, its hash and its revision count are unchanged", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    let hashBefore = null;
    let sourceBefore = null;
    {
      const store = openEditorStore({ dbPath });
      sourceBefore = (await listItems(store.db)).find((item) => item.id === itemId);
      hashBefore = (await getRevision(store.db, revisionId)).contentSha256;
      store.close();
    }

    await invokeAction(runAction(dbPath), { itemId, revisionId });

    const store = openEditorStore({ dbPath });
    try {
      const sourceAfter = (await listItems(store.db)).find((item) => item.id === itemId);
      assert.equal((await listRevisions(store.db, itemId)).length, 1);
      assert.equal((await getRevision(store.db, revisionId)).contentSha256, hashBefore);
      assert.equal(sourceAfter.currentRevisionId, sourceBefore.currentRevisionId);
      assert.equal(sourceAfter.publishedRevisionId, sourceBefore.publishedRevisionId);
    } finally {
      store.close();
    }
  });
});

await test("editing the new draft does not touch the original", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const { redirected } = await invokeAction(runAction(dbPath), { itemId, revisionId });
    const derivedId = String(redirected).replace("/admin/editor/", "").split("?")[0];

    const store = openEditorStore({ dbPath });
    try {
      const derived = (await listRevisions(store.db, derivedId))[0];
      (await saveIssueRevision(store, {
        itemId: derivedId,
        expectedRevisionId: derived.id,
        title: "A different second draft",
        summary: null,
        byline: null,
        blocks: [
          { id: "blk_new", heading: "", markdown: "Entirely different words.", origin: "human" },
        ],
        createdBy: "human_test_subject",
        origin: "human",
      }));

      const derivedNow = (await listRevisions(store.db, derivedId));
      assert.equal(derivedNow.length, 2, "the new draft gains its own revision");
      assert.equal((await getRevision(store.db, revisionId)).blocks[0].markdown, "The words I actually wrote.\n\nA second paragraph.");
      assert.equal((await listRevisions(store.db, itemId)).length, 1, "the original gained nothing");
    } finally {
      store.close();
    }
  });
});

await test("the new draft carries no approval and no publication authority", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const { redirected } = await invokeAction(runAction(dbPath), { itemId, revisionId });
    const derivedId = String(redirected).replace("/admin/editor/", "").split("?")[0];

    const store = openEditorStore({ dbPath });
    try {
      const after = counts(store.db);
      assert.equal(after.approvals, 0, "no approval may be carried over or created");
      assert.equal(after.intents, 0, "no publication intent may be carried over or created");
      const derivedItem = (await listItems(store.db)).find((item) => item.id === derivedId);
      assert.equal(derivedItem.publishedRevisionId, null, "the copy has no published revision");
      assert.equal(derivedItem.visibility, "private", "the copy starts private, like any draft");
      const derived = (await listRevisions(store.db, derivedId))[0];
      assert.equal(derived.editorialState, "draft");
    } finally {
      store.close();
    }
  });
});

console.log("\nprepare another draft: persisted metadata survives an edit");

await test("editing a copied block keeps its provenance and its other persisted metadata", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const { redirected } = await invokeAction(runAction(dbPath), { itemId, revisionId });
    const derivedId = String(redirected).replace("/admin/editor/", "").split("?")[0];

    const store = openEditorStore({ dbPath });
    try {
      const derived = (await listRevisions(store.db, derivedId))[0];
      // An edit as the FORM submits it: identity and writing only, no provenance field exists in the
      // editor. The saved metadata must survive anyway.
      (await saveIssueRevision(store, {
        itemId: derivedId,
        expectedRevisionId: derived.id,
        title: derived.title,
        summary: derived.summary,
        byline: derived.byline,
        blocks: derived.blocks.map((entry) => ({
          id: entry.id,
          heading: entry.heading,
          markdown: `${entry.markdown} edited`,
          humanLocked: entry.humanLocked,
          origin: "human",
        })),
        createdBy: "human_test_subject",
        origin: "human",
      }));

      const revisions = (await listRevisions(store.db, derivedId));
      const after = revisions.find((entry) => entry.revisionNumber === 2);
      assert.ok(after, "the edit must have created a second revision");
      assert.equal(
        after.blocks[0].linkedArticleRevisionId,
        revisionId,
        "editing must not drop the provenance the block already had",
      );
      assert.ok(after.blocks[0].markdown.endsWith(" edited"), "the edit itself must apply");
      assert.equal(
        JSON.stringify(after.blocks[0].claims),
        JSON.stringify(["claim_alpha"]),
        `claims must survive an edit (got ${JSON.stringify(after.blocks[0].claims)})`,
      );
      assert.equal(
        JSON.stringify(after.blocks[0].publicPermissionRecordIds),
        JSON.stringify(["perm_alpha"]),
        `permission record ids must survive an edit (got ${JSON.stringify(after.blocks[0].publicPermissionRecordIds)})`,
      );
      assert.equal(after.blocks[0].section, "opening", "section must survive an edit");
    } finally {
      store.close();
    }
  });
});

await test("deriving from a derived draft does not erase the earlier provenance chain", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const first = await invokeAction(runAction(dbPath), { itemId, revisionId });
    const bId = String(first.redirected).replace("/admin/editor/", "").split("?")[0];
    const second = await invokeAction(runAction(dbPath), { itemId: bId, revisionId: (await listRevisions(openEditorStore({ dbPath }).db, bId))[0].id });
    const cId = String(second.redirected).replace("/admin/editor/", "").split("?")[0];

    const store = openEditorStore({ dbPath });
    try {
      const b = (await listRevisions(store.db, bId))[0];
      const c = (await listRevisions(store.db, cId))[0];
      assert.equal(b.blocks[0].linkedArticleRevisionId, revisionId, "B records where it came from");
      assert.equal(
        c.blocks[0].linkedArticleRevisionId,
        revisionId,
        "C must keep the earliest recorded source rather than silently replacing it",
      );
      assert.notEqual(c.blocks[0].linkedArticleRevisionId, b.id);
    } finally {
      store.close();
    }
  });
});

console.log("\nprepare another draft: refusals");

await test("an unauthorized call creates nothing", async () => {
  await inFreshDb(async (dbPath) => {
    const { itemId, revisionId } = await seedSource(dbPath);
    const before = (() => {
      const store = openEditorStore({ dbPath });
      const c = counts(store.db);
      store.close();
      return c;
    })();

    const { unauthorized } = await invokeAction(runAction(dbPath, { authorized: false }), {
      itemId,
      revisionId,
    });
    assert.ok(unauthorized, "the action must refuse an unauthorized caller");

    const store = openEditorStore({ dbPath });
    try {
      const after = counts(store.db);
      assert.deepEqual(after, before, "an unauthorized call must have zero effect");
    } finally {
      store.close();
    }
  });
});

await test("a validation failure leaves no partial item behind", async () => {
  await inFreshDb(async (dbPath) => {
    await seedSource(dbPath);
    const store = openEditorStore({ dbPath });
    try {
      const before = counts(store.db);
      let threw = null;
      try {
        // The same service the action uses, with blocks that cannot pass validation.
        (await createIssue(store, {
          slug: "invalid-copy",
          title: "Invalid",
          blocks: [{ id: "blk_empty", heading: "", markdown: "", origin: "human" }],
          createdBy: "human_test_subject",
        }));
      } catch (error) {
        threw = error;
      }
      assert.ok(threw, "invalid blocks must be refused");
      assert.deepEqual(
        counts(store.db),
        before,
        "a refused creation must roll back completely — no orphan item",
      );
    } finally {
      store.close();
    }
  });
});

console.log(
  `\nderived draft: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
