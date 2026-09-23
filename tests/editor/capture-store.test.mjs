// tests/editor/capture-store.test.mjs
//
// The capture path. `/admin/new` used to write a content file, which meant the note an author
// had just written could not be opened in the editor at all — the editor reads the revision
// store, and the two disagreed about what a draft was. Capture now creates the draft in that
// same store and lands in that same editor.
//
// These cases exercise the real action body with the framework and database boundaries
// stubbed, so the assertions are about the action's own decisions: what it creates, what it
// refuses to create, and whether it touches the filesystem at all. The store is a recorder —
// no test here can open a real database.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadPageModule } from "./_transform.mjs";

const ADMIN_KEY = "test-admin-key-xyz";

function makeEnv(present) {
  return present ? { ADMIN_KEY } : {};
}

/** The action computes paths from process.cwd(); give it a throwaway content root. */
function prepContentRoot() {
  const root = mkdtempSync(join(tmpdir(), "capture-root-"));
  mkdirSync(join(root, "src", "content"), { recursive: true });
  return root;
}

function buildFormData(fields) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function run(action, fields, { authorized = true } = {}) {
  const root = prepContentRoot();
  const cookieStore = authorized ? new Map([["admin", ADMIN_KEY]]) : new Map();
  const mod = loadPageModule("src/app/admin/new/page.tsx", {
    env: makeEnv(authorized),
    cwd: root,
    cookieStore,
  });
  let redirected = null;
  let unauthorized = false;
  try {
    await mod.exports.create(buildFormData(action ? { ...fields, action } : fields));
  } catch (error) {
    if (error && error.__redirect) redirected = error.__redirect;
    else if (error && error.message === "Unauthorized") unauthorized = true;
    else {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }
  return { redirected, unauthorized, mod, root };
}

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

test("a capture with no metadata goes into the revision store, not a file", async () => {
  const { redirected, mod, root } = await run("create", {
    slug: "",
    title: "",
    body: "A note captured with no name.",
  });
  try {
    assert.equal(
      mod.fsImpl.calls.length,
      0,
      `a capture must not write a content file: ${JSON.stringify(mod.fsImpl.calls)}`,
    );
    assert.equal(mod.editorCapture.opened, 1, "the capture did not open the revision store");
    assert.equal(mod.editorCapture.issues.length, 1, "the capture did not create an issue");
    assert.equal(mod.editorCapture.closed, 1, "the store was not closed");

    const created = mod.editorCapture.issues[0];
    assert.equal(created.slug, "untitled-note", "an untitled capture needs a generated identity");
    assert.equal(created.title, "Untitled");
    assert.equal(created.blocks.length, 1);
    assert.equal(created.blocks[0].markdown, "A note captured with no name.");
    assert.equal(created.blocks[0].humanLocked, true, "captured writing is the author's own");

    assert.ok(
      String(redirected).startsWith("/admin/editor/"),
      `a capture must open the editor for the note just created, got ${redirected}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a named capture uses the name the author typed", async () => {
  const { redirected, mod, root } = await run("create", {
    slug: "packaging-notes",
    title: "Packaging notes",
    body: "What I want to say.",
  });
  try {
    assert.equal(mod.fsImpl.calls.length, 0);
    const created = mod.editorCapture.issues[0];
    assert.equal(created.slug, "packaging-notes");
    assert.equal(created.title, "Packaging notes");
    assert.ok(String(redirected).startsWith("/admin/editor/"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a capture with no text creates nothing and never opens the store", async () => {
  const { redirected, mod, root } = await run("create", { slug: "", title: "", body: "   " });
  try {
    assert.equal(mod.fsImpl.calls.length, 0, "nothing should be written");
    assert.equal(mod.editorCapture.opened, 0, "an empty capture must not open the store");
    assert.equal(mod.editorCapture.issues.length, 0);
    assert.equal(redirected, "/admin/new?status=needs_text");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a denied capture never opens the store and writes nothing", async () => {
  const { unauthorized, mod, root } = await run(
    "create",
    { slug: "", title: "", body: "A note." },
    { authorized: false },
  );
  try {
    assert.ok(unauthorized, "an unauthorized capture must be refused");
    assert.equal(mod.fsImpl.calls.length, 0, "a denied capture must have zero fs effects");
    assert.equal(mod.editorCapture.opened, 0, "a denied capture must never open the store");
    assert.equal(mod.editorCapture.issues.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the legacy file action still writes the file library and is not the default", async () => {
  const { redirected, mod, root } = await run("file", {
    pillar: "ai",
    slug: "legacy-note",
    title: "Legacy note",
    body: "Written to the file library.",
  });
  try {
    const writes = mod.fsImpl.calls.filter((call) => call.op === "writeFile");
    assert.equal(writes.length, 1, `expected one file write, got ${JSON.stringify(mod.fsImpl.calls)}`);
    assert.equal(mod.editorCapture.opened, 0, "the legacy path must not touch the revision store");
    assert.ok(
      String(redirected).startsWith("/admin/new?created="),
      `legacy file capture should report what it created, got ${redirected}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

let passed = 0;
const failures = [];
console.log("\ncapture -> revision store");
for (const { name, fn } of cases) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}
console.log(
  `\ncapture store: ${passed}/${cases.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
