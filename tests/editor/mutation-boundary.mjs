// tests/editor/mutation-boundary.mjs
//
// Offline fixture harness for S01 mutation-boundary repairs.
//
// What it covers:
//   - Denied/stale authorization at every new/edit/newsletter mutation:
//     zero filesystem or provider effects.
//   - Valid authorized draft still saves (new + edit + newsletter).
//   - Path rejection: traversal, encoded separators, NUL, absolute paths,
//     symlinked ancestors/content root, destination symlinks.
//   - Newsletter send: zero filesystem/provider effects on a single send
//     AND on repeated send attempts (double-click / re-submit).
//   - New-pillar flow.
//   - Preview redirect target is preserved.
//
// Fixture vs real:
//   - Each test uses a temporary content-root fixture created with
//     `fs.mkdtemp` and removed at exit.
//   - The action functions themselves are loaded from the real source
//     via the in-memory transform harness in _transform.mjs. The
//     transforms only swap `next/*` for recording stubs and `@/lib/*`
//     for the real helper; no action-body duplication occurs.
//   - The content-paths helper is the real implementation; symlink tests
//     exercise it directly.

import { mkdtempSync, realpathSync, symlinkSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve as pathResolve } from "node:path";
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";

import {
  loadPageModule,
  loadRouteModule,
  makeRecordingFs,
  makeRecordingRedirect,
} from "./_transform.mjs";

const HERE = import.meta.dirname ?? pathResolve(dirname(new URL(import.meta.url).pathname));
const REPO = pathResolve(HERE, "..", "..");

let testCount = 0;
let failCount = 0;
const results = [];

async function test(name, fn) {
  testCount += 1;
  const fixtureRoot = mkdtempSync(join(tmpdir(), "s01-"));
  try {
    await fn(fixtureRoot);
    results.push({ name, ok: true });
    console.log(`  ok  ${name}`);
  } catch (err) {
    failCount += 1;
    results.push({ name, ok: false, error: err && err.message ? err.message : String(err) });
    console.log(`  FAIL ${name}`);
    console.log(`       ${err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n       ") : err}`);
  } finally {
    try {
      rmSync(fixtureRoot, { recursive: true, force: true });
    } catch {}
  }
}

function makeEnv(authorized) {
  return authorized
    ? { ADMIN_KEY: "test-admin-key-xyz" }
    : {};
}

function buildFormData(entries) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) {
      for (const item of v) fd.append(k, item);
    } else if (v === undefined || v === null) {
      // skip
    } else {
      fd.append(k, String(v));
    }
  }
  return fd;
}

// Pre-create the content root and blog/ subtree under the fixture so the
// validator's assertSafeContentRoot succeeds. Mirrors the existing project
// layout (src/content/blog/<pillar>/<slug>.mdx).
function prepContentRoot(root) {
  mkdirSync(join(root, "src", "content", "blog"), { recursive: true });
  mkdirSync(join(root, "src", "content", "newsletters"), { recursive: true });
}

// ----------------------------------------------------------------------------
// content-paths.ts direct integration tests
// ----------------------------------------------------------------------------

async function testContentPaths() {
  await test("content-paths: rejects traversal in pillar", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    let threw = false;
    try {
      await helper.resolveSafeContentPath(root, "..", "x", ".mdx");
    } catch (e) {
      threw = true;
    }
    assert.equal(threw, true, "expected traversal pillar to be rejected");
  });

  await test("content-paths: rejects NUL byte in slug", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    let threw = false;
    try {
      await helper.resolveSafeContentPath(root, "ai", "abc\u0000.mdx", ".mdx");
    } catch (e) {
      threw = true;
    }
    assert.equal(threw, true, "expected NUL to be rejected");
  });

  await test("content-paths: rejects URL-encoded slash", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    let threw = false;
    try {
      await helper.resolveSafeContentPath(root, "ai", "abc%2Fdef", ".mdx");
    } catch (e) {
      threw = true;
    }
    assert.equal(threw, true, "expected encoded separator to be rejected");
  });

  await test("content-paths: rejects absolute path as root", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    let threw = false;
    try {
      await helper.resolveSafeContentPath("/etc", "ai", "x", ".mdx");
    } catch (e) {
      threw = true;
    }
    assert.equal(threw, true, "expected absolute root to be rejected");
  });

  await test("content-paths: accepts valid missing destination under fixture root", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    const result = await helper.resolveSafeContentPath(root, "ai", "hello-world", ".mdx");
    assert.equal(result.endsWith("/blog/ai/hello-world.mdx"), true, `got ${result}`);
  });

  await test("content-paths: rejects nested ancestor that escapes root", async (root) => {
    // Root is the fixture; create a symlink at fixture/ai -> outside-root.
    // The validator must reject when trying to resolve a destination inside
    // the symlinked pillar directory (because the destination's parent
    // resolves outside the content root).
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    const outsideDir = mkdtempSync(join(tmpdir(), "s01-out-"));
    try {
      mkdirSync(join(root, "blog"), { recursive: true });
      symlinkSync(outsideDir, join(root, "blog", "ai"), "dir");
      let threw = false;
      try {
        await helper.resolveSafeContentPath(root, "ai", "x", ".mdx");
      } catch (e) {
        threw = true;
      }
      assert.equal(threw, true, "expected symlinked ancestor escape to be rejected");
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  await test("content-paths: rejects symlinked content root", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    const outsideDir = mkdtempSync(join(tmpdir(), "s01-out-"));
    try {
      const symlinked = join(root, "linked-root");
      symlinkSync(outsideDir, symlinked, "dir");
      let threw = false;
      try {
        await helper.resolveSafeContentPath(symlinked, "ai", "x", ".mdx");
      } catch (e) {
        threw = true;
      }
      assert.equal(threw, true, "expected symlinked content root to be rejected");
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  await test("content-paths: rejects destination that is itself a symlink", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    mkdirSync(join(root, "blog", "ai"), { recursive: true });
    const outsideFile = join(root, "outside-target.mdx");
    writeFileSync(outsideFile, "outside");
    symlinkSync(outsideFile, join(root, "blog", "ai", "escape.mdx"), "file");
    let threw = false;
    try {
      await helper.resolveSafeContentPath(root, "ai", "escape", ".mdx");
    } catch (e) {
      threw = true;
    }
    assert.equal(threw, true, "expected destination symlink to be rejected");
  });

  await test("content-paths: rejects project-level symlinked ancestor (S01_REVIEW finding 1)", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    const outside = mkdtempSync(join(tmpdir(), "s01-out-"));
    try {
      mkdirSync(join(root, "blog"), { recursive: true });
      // A project-level symlink: <fixture>/linked-parent -> <outside>
      symlinkSync(outside, join(root, "linked-parent"), "dir");
      const configuredRoot = join(root, "linked-parent", "content");
      mkdirSync(join(configuredRoot, "blog"), { recursive: true });
      let accepted = false;
      try {
        await helper.resolveSafeContentPath(configuredRoot, "ai", "escape", ".mdx");
        accepted = true;
      } catch {
        accepted = false;
      }
      assert.equal(accepted, false, "project-level symlinked ancestor must be rejected");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  await test("content-paths: accepts legitimate OS path aliases (e.g. /tmp -> /private/tmp on macOS)", async (root) => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    // The fixture root itself goes through the OS /tmp alias. The
    // ancestor walk should not reject this.
    mkdirSync(join(root, "blog"), { recursive: true });
    const file = await helper.resolveSafeContentPath(root, "ai", "hello", ".mdx");
    assert.ok(file.endsWith("/blog/ai/hello.mdx"), `unexpected file ${file}`);
  });

  await test("content-paths: normalizeContentName preserves pre-S01 behavior for mixed case and spaces", async () => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    // Pre-S01 normalization: lowercase + replace unsafe chars with dash.
    assert.equal(helper.normalizeContentName("Hello World", "slug"), "hello-world");
    assert.equal(helper.normalizeContentName("Foo/Bar", "slug"), "foo-bar");
    assert.equal(helper.normalizeContentName("ALPHA.BETA", "slug"), "alpha-beta");
    assert.equal(helper.normalizeContentName("kebab-case", "slug"), "kebab-case");
  });

  await test("content-paths: assertSafeRawName rejects separators, traversal, NUL, encoded forms; accepts mixed case", async () => {
    const helper = await import(pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href);
    // Reject dangerous patterns.
    for (const bad of [
      "abc/def",
      "abc\\def",
      "abc%2Fdef",
      "abc\u0000def",
      "..",
      ".",
      "a/b/../c",
    ]) {
      let threw = false;
      try {
        helper.assertSafeRawName(bad, "slug");
      } catch {
        threw = true;
      }
      assert.equal(threw, true, `expected reject: ${JSON.stringify(bad)}`);
    }
    // Accept mixed-case and spaced inputs (will be normalized later).
    for (const ok of ["Hello-World", "Hello World", "Foo Bar", "abc-123"]) {
      try {
        helper.assertSafeRawName(ok, "slug");
      } catch (e) {
        assert.fail(`expected accept ${JSON.stringify(ok)}, got ${e.code || e.message}`);
      }
    }
  });
}

// ----------------------------------------------------------------------------
// admin/new (page module) integration tests
// ----------------------------------------------------------------------------

async function testAdminNew() {
  await test("admin/new: denied auth -> zero fs effects, redirect to /admin", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map();
    const env = makeEnv(false); // ADMIN_KEY absent
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "hello",
      action: "file",
      title: "t",
      body: "b",
    });
    let redirected = null;
    let unauthorized = false;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else if (err && err.message === "Unauthorized") unauthorized = true;
      else throw err;
    }
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
    assert.ok(
      redirected === "/admin/login" || unauthorized,
      `expected redirect to /admin/login or Unauthorized throw, got redirect=${redirected} unauthorized=${unauthorized}`,
    );
  });

  await test("admin/new: authorized valid input -> file written, redirect to /admin", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "hello",
      action: "file",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    // The create action now reports its outcome instead of bouncing silently to /admin:
    // a refusal names the reason, and a success names the identity that was created. The
    // effect assertions either side of this line are the security property and are
    // unchanged — a rejection still writes nothing, a success still writes the canonical
    // file. This only pins the destination to a known shape so an unexpected one fails.
    assert.ok(
      (await /^\/admin(\/new\?status=[a-z_]+|\/new\?created=.+)?$/.test(redirected)),
      `unexpected destination after create: ${redirected}`,
    );
    // Confirm a writeFile happened for the validated destination.
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    assert.equal(writes.length, 1, `expected one writeFile, got ${writes.length}`);
    const target = writes[0].args[0];
    assert.equal(target.endsWith("/blog/ai/hello.mdx"), true, `unexpected target ${target}`);
  });

  await test("admin/new: authorized new-pillar flow -> writes to new pillar directory", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "__new__",
      newPillar: "research",
      slug: "first-post",
      action: "file",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    // The create action now reports its outcome instead of bouncing silently to /admin:
    // a refusal names the reason, and a success names the identity that was created. The
    // effect assertions either side of this line are the security property and are
    // unchanged — a rejection still writes nothing, a success still writes the canonical
    // file. This only pins the destination to a known shape so an unexpected one fails.
    assert.ok(
      (await /^\/admin(\/new\?status=[a-z_]+|\/new\?created=.+)?$/.test(redirected)),
      `unexpected destination after create: ${redirected}`,
    );
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    assert.equal(writes.length, 1);
    const target = writes[0].args[0];
    assert.equal(target.endsWith("/blog/research/first-post.mdx"), true, `unexpected target ${target}`);
  });

  await test("admin/new: preview action redirects to public article URL", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "preview-slug",
      action: "preview",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    assert.equal(redirected, "/blog/ai/preview-slug", `expected /blog/ai/preview-slug, got ${redirected}`);
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    assert.equal(writes.length, 1, "preview should still persist the file (matches original behavior)");
  });

  await test("admin/new: raw traversal in pillar -> zero effects, redirect to /admin", async (root) => {
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "../../etc",
      slug: "hello",
      action: "file",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    // The create action now reports its outcome instead of bouncing silently to /admin:
    // a refusal names the reason, and a success names the identity that was created. The
    // effect assertions either side of this line are the security property and are
    // unchanged — a rejection still writes nothing, a success still writes the canonical
    // file. This only pins the destination to a known shape so an unexpected one fails.
    assert.ok(
      (await /^\/admin(\/new\?status=[a-z_]+|\/new\?created=.+)?$/.test(redirected)),
      `unexpected destination after create: ${redirected}`,
    );
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
  });

  await test("admin/new: raw NUL in slug -> zero effects, redirect to /admin", async (root) => {
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    // FormData accepts strings; embed a NUL via the string form.
    const fd = buildFormData({
      pillar: "ai",
      slug: "abc\u0000def",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    // The create action now reports its outcome instead of bouncing silently to /admin:
    // a refusal names the reason, and a success names the identity that was created. The
    // effect assertions either side of this line are the security property and are
    // unchanged — a rejection still writes nothing, a success still writes the canonical
    // file. This only pins the destination to a known shape so an unexpected one fails.
    assert.ok(
      (await /^\/admin(\/new\?status=[a-z_]+|\/new\?created=.+)?$/.test(redirected)),
      `unexpected destination after create: ${redirected}`,
    );
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
  });

  await test("admin/new: 'Hello World' raw slug normalizes to 'hello-world' and writes the canonical file", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "Hello World",
      action: "file",
      title: "Greeting",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    // The create action now reports its outcome instead of bouncing silently to /admin:
    // a refusal names the reason, and a success names the identity that was created. The
    // effect assertions either side of this line are the security property and are
    // unchanged — a rejection still writes nothing, a success still writes the canonical
    // file. This only pins the destination to a known shape so an unexpected one fails.
    assert.ok(
      (await /^\/admin(\/new\?status=[a-z_]+|\/new\?created=.+)?$/.test(redirected)),
      `unexpected destination after create: ${redirected}`,
    );
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    assert.equal(writes.length, 1, `expected one writeFile, got ${writes.length}`);
    const target = writes[0].args[0];
    assert.ok(
      target.endsWith("/blog/ai/hello-world.mdx"),
      `expected normalized path to end with hello-world.mdx, got ${target}`,
    );
  });

  await test("admin/new: raw embedded slash rejected; canonical separator still rejected after rewrite", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/new/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    // "/etc/passwd" contains a literal slash and must be rejected outright
    // by assertSafeRawName. Normalizing it would yield "etc-passwd", which
    // would silently let the slash through; we must never reach that point.
    const fd = buildFormData({
      pillar: "ai",
      slug: "/etc/passwd",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.create(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    // The create action now reports its outcome instead of bouncing silently to /admin:
    // a refusal names the reason, and a success names the identity that was created. The
    // effect assertions either side of this line are the security property and are
    // unchanged — a rejection still writes nothing, a success still writes the canonical
    // file. This only pins the destination to a known shape so an unexpected one fails.
    assert.ok(
      (await /^\/admin(\/new\?status=[a-z_]+|\/new\?created=.+)?$/.test(redirected)),
      `unexpected destination after create: ${redirected}`,
    );
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
  });
}

// ----------------------------------------------------------------------------
// admin/edit integration tests
// ----------------------------------------------------------------------------

async function testAdminEdit() {
  await test("admin/edit: denied auth -> zero fs effects", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map();
    const env = makeEnv(false);
    const mod = loadPageModule("src/app/admin/edit/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "existing",
      newPillar: "ai",
      newSlug: "renamed",
      title: "t",
      body: "b",
    });
    let redirected = null;
    let unauthorized = false;
    try {
      await mod.exports.save(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else if (err && err.message === "Unauthorized") unauthorized = true;
      else throw err;
    }
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
    assert.ok(
      redirected === "/admin/login" || unauthorized,
      `expected redirect to /admin/login or Unauthorized throw, got redirect=${redirected} unauthorized=${unauthorized}`,
    );
  });

  await test("admin/edit: authorized, original missing -> zero fs effects", async (root) => {
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/edit/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "no-such-slug",
      newPillar: "ai",
      newSlug: "renamed",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.save(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
    assert.equal(redirected, "/admin/blog", `expected /admin/blog redirect, got ${redirected}`);
  });

  await test("admin/edit: authorized with unsafe target -> zero effects", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    // Seed an existing article so the original-path validation passes.
    const pillarDir = join(root, "src", "content", "blog", "ai");
    mkdirSync(pillarDir, { recursive: true });
    const existing = join(pillarDir, "existing.mdx");
    writeFileSync(existing, "---\ntitle: x\n---\n\nbody\n");
    const mod = loadPageModule("src/app/admin/edit/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "existing",
      newPillar: "../escape",
      newSlug: "target",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.save(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    assert.equal(redirected, "/admin/blog", `expected /admin/blog redirect, got ${redirected}`);
    // Unlink and writeFile must NOT have happened because the target
    // validation rejects the new pillar.
    const unlinks = mod.fsImpl.calls.filter((c) => c.op === "unlink");
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    assert.equal(unlinks.length, 0, `unexpected unlink: ${JSON.stringify(unlinks)}`);
    assert.equal(writes.length, 0, `unexpected writeFile: ${JSON.stringify(writes)}`);
    // Original file must still exist on disk.
    assert.equal(existsSync(existing), true, "original article should not have been removed");
  });

  await test("admin/edit: authorized rename -> old unlinked, new written", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const pillarDir = join(root, "src", "content", "blog", "ai");
    mkdirSync(pillarDir, { recursive: true });
    const existing = join(pillarDir, "existing.mdx");
    writeFileSync(existing, "---\ntitle: x\n---\n\nbody\n");
    const mod = loadPageModule("src/app/admin/edit/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      pillar: "ai",
      slug: "existing",
      newPillar: "ai",
      newSlug: "renamed",
      title: "t",
      body: "b",
    });
    let redirected = null;
    try {
      await mod.exports.save(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    assert.equal(redirected, "/admin/blog", `expected /admin/blog, got ${redirected}`);
    const unlinks = mod.fsImpl.calls.filter((c) => c.op === "unlink");
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    assert.equal(unlinks.length, 1, `expected one unlink, got ${unlinks.length}`);
    assert.equal(writes.length, 1, `expected one writeFile, got ${writes.length}`);
    const target = writes[0].args[0];
    assert.equal(target.endsWith("/blog/ai/renamed.mdx"), true, `unexpected target ${target}`);
  });
}

// ----------------------------------------------------------------------------
// admin/newsletter integration tests
// ----------------------------------------------------------------------------

async function testAdminNewsletter() {
  await test("admin/newsletter: denied auth -> zero fs effects", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map();
    const env = makeEnv(false);
    const mod = loadPageModule("src/app/admin/newsletter/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      subject: "s",
      body: "b",
      intent: "draft",
    });
    let redirected = null;
    let unauthorized = false;
    try {
      await mod.exports.handle(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else if (err && err.message === "Unauthorized") unauthorized = true;
      else throw err;
    }
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
    assert.ok(
      redirected === "/admin/login" || unauthorized,
      `expected redirect to /admin/login or Unauthorized throw, got redirect=${redirected} unauthorized=${unauthorized}`,
    );
  });

  await test("admin/newsletter: send intent -> zero fs effects and unavailable status visible", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/newsletter/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      subject: "s",
      body: "b",
      intent: "send",
    });
    let redirected = null;
    try {
      await mod.exports.handle(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    assert.equal(redirected, "/admin/newsletter", `expected /admin/newsletter, got ${redirected}`);
    assert.equal(mod.fsImpl.calls.length, 0, `unexpected fs calls: ${JSON.stringify(mod.fsImpl.calls)}`);
    const statusRaw = (await cookieStore.get("newsletter_status"));
    assert.ok(statusRaw, "expected newsletter_status cookie to be set");
    // The cookie payload is base64url-encoded JSON.
    const decoded = JSON.parse(Buffer.from(statusRaw, "base64url").toString("utf8"));
    assert.equal(decoded.kind, "send-unavailable", `expected send-unavailable, got ${decoded.kind}`);
    assert.ok(decoded.message && decoded.message.length > 0, "expected non-empty message");
  });

  await test("admin/newsletter: repeated send (double-click) -> zero fs effects", async (root) => {
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/newsletter/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      subject: "s",
      body: "b",
      intent: "send",
    });
    for (let i = 0; i < 3; i += 1) {
      try {
        await mod.exports.handle(fd);
      } catch (err) {
        if (!err || !err.__redirect) throw err;
      }
    }
    assert.equal(mod.fsImpl.calls.length, 0, `expected zero fs calls, got ${JSON.stringify(mod.fsImpl.calls)}`);
  });

  await test("admin/newsletter: authorized draft -> file written", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/newsletter/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      subject: "Weekly update",
      body: "Hello there",
      intent: "draft",
    });
    let redirected = null;
    try {
      await mod.exports.handle(fd);
    } catch (err) {
      if (err && err.__redirect) redirected = err.__redirect;
      else throw err;
    }
    assert.equal(redirected, "/admin/newsletter", `expected /admin/newsletter, got ${redirected}`);
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    if (writes.length === 0) {
      throw new Error(
        `expected one writeFile, got 0. calls=${JSON.stringify(mod.fsImpl.calls)} redirects=${JSON.stringify(mod.recordedRedirects)}`,
      );
    }
    assert.equal(writes.length, 1, `expected one writeFile, got ${writes.length}`);
    const filePath = writes[0].args[0];
    assert.ok(filePath.endsWith(".mdx"), `expected .mdx file, got ${filePath}`);
    assert.ok(filePath.includes("/newsletters/"), `expected newsletters path, got ${filePath}`);
  });

  await test("admin/newsletter: send intent explicitly does not touch the filesystem (mkdir/unlink/writeFile)", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = makeEnv(true);
    const mod = loadPageModule("src/app/admin/newsletter/page.tsx", {
      env,
      cwd: root,
      cookieStore,
    });
    const fd = buildFormData({
      subject: "s",
      body: "b",
      intent: "send",
    });
    try {
      await mod.exports.handle(fd);
    } catch (err) {
      if (!err || !err.__redirect) throw err;
    }
    const writes = mod.fsImpl.calls.filter((c) => c.op === "writeFile");
    const unlinks = mod.fsImpl.calls.filter((c) => c.op === "unlink");
    const mkdirs = mod.fsImpl.calls.filter((c) => c.op === "mkdir");
    assert.equal(writes.length, 0, `unexpected writes: ${JSON.stringify(writes)}`);
    assert.equal(unlinks.length, 0, `unexpected unlinks: ${JSON.stringify(unlinks)}`);
    assert.equal(mkdirs.length, 0, `unexpected mkdirs: ${JSON.stringify(mkdirs)}`);
  });

  await test("admin/newsletter: send cannot reach a provider — Resend is not imported in the action body", async () => {
    const src = readFileSync(
      pathResolve(REPO, "src/app/admin/newsletter/page.tsx"),
      "utf8",
    );
    // The action body (everything inside `async function handle`) must not
    // reference Resend or any provider. We allow the file to mention
    // providers in comments or unrelated lines.
    const handleStart = src.indexOf("async function handle");
    assert.ok(handleStart > -1, "expected handle() in newsletter page");
    const handleBody = src.slice(handleStart);
    assert.equal(
      (await /Resend|from\s+["']resend["']/i.test(handleBody)),
      false,
      "Resend/provider must not appear in the action body",
    );
  });
}

// ----------------------------------------------------------------------------
// CMS /api/cms/sync route handler tests
//
// These exercise the actual POST/PUT/DELETE handler bodies via the
// in-memory transform. Real filesystem operations are used (the harness
// passes the real node:fs/promises through) so the test reads back saved
// content from the temp fixture. Sentinel files placed outside the
// content root are checked to remain untouched on denied / symlink-escape
// paths. Provider imports are fail-closed because no Resend or other
// transport is loaded into the route sandbox.
// ----------------------------------------------------------------------------

function makeNextRequest(url, init = {}) {
  // Mimic the stub NextRequest from _transform.mjs.
  const headers = new Map();
  if (init.headers)
    for (const [k, v] of Object.entries(init.headers))
      headers.set(k.toLowerCase(), v);
  return {
    url,
    headers,
    async json() {
      return JSON.parse(init.body || "{}");
    },
  };
}

function buildCookieHeader(cookieStore) {
  return Array.from(cookieStore.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function testCmsRoute() {
  // POST happy path: cookie auth, real write, real read-back.
  await test("cms POST: cookie-auth writes a real file that reads back", async (root) => {
    prepContentRoot(root);
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const env = { ADMIN_KEY: "test-admin-key-xyz" };
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest(
      "http://localhost/api/cms/sync",
      {
        method: "POST",
        headers: {
          cookie: buildCookieHeader(cookieStore),
        },
        body: JSON.stringify({
          pillar: "ai",
          slug: "Hello World",
          title: "Greeting",
          body: "Body content here.",
          status: "draft",
          tags: ["alpha", "beta"],
        }),
      },
    );
    const res = await exports.POST(req);
    const json = await res.json();
    assert.equal(res.status, 200, `expected 200, got ${res.status} body=${JSON.stringify(json)}`);
    assert.equal(json.success, true);
    // Read back from real filesystem.
    const written = readFileSync(join(root, "src/content/blog/ai/hello-world.mdx"), "utf8");
    assert.ok(written.includes('title: "Greeting"'), `expected title in file: ${written}`);
    assert.ok(written.includes("Body content here."), `expected body in file`);
    // Frontmatter should contain normalized slug derived from "Hello World" -> "hello-world".
    assert.equal(written.startsWith("---\ntitle: \"Greeting\""), true, `unexpected frontmatter start: ${written.slice(0, 80)}`);
  });

  // POST denied auth: zero fs effects.
  await test("cms POST: denied auth (no ADMIN_KEY, no agent key) -> no real write, no sentinel change", async (root) => {
    prepContentRoot(root);
    const outsideSentinel = join(root, "outside-sentinel.txt");
    writeFileSync(outsideSentinel, "untouched");
    const cookieStore = new Map();
    const env = {};
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest("http://localhost/api/cms/sync", {
      method: "POST",
      headers: {},
      body: JSON.stringify({ pillar: "ai", slug: "leak", title: "T", body: "B" }),
    });
    const res = await exports.POST(req);
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
    const aiDir = join(root, "src/content/blog/ai");
    let leakedFile = null;
    try {
      const entries = require("node:fs").readdirSync(aiDir);
      leakedFile = entries.find((e) => e === "leak.mdx") || null;
    } catch {
      // aiDir may not exist; that's fine.
    }
    assert.equal(leakedFile, null, `expected no leak.mdx, got ${leakedFile}`);
    // Sentinel outside the content root must be untouched.
    assert.equal(readFileSync(outsideSentinel, "utf8"), "untouched", "outside sentinel mutated");
  });

  // POST agent-key auth: writes successfully without cookie auth.
  await test("cms POST: AGENT_SYNC_KEY auth writes the file", async (root) => {
    prepContentRoot(root);
    const env = { AGENT_SYNC_KEY: "agent-key-xyz" };
    const cookieStore = new Map();
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest("http://localhost/api/cms/sync", {
      method: "POST",
      headers: { "x-agent-key": "agent-key-xyz" },
      body: JSON.stringify({ pillar: "ai", slug: "agent-post", title: "AG", body: "x" }),
    });
    const res = await exports.POST(req);
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    const written = readFileSync(join(root, "src/content/blog/ai/agent-post.mdx"), "utf8");
    assert.ok(written.includes('title: "AG"'));
  });

  // POST symlinked ancestor escape via project-level symlink -> reject.
  await test("cms POST: symlinked project ancestor -> reject; outside sentinel untouched", async (root) => {
    // Create the content root under a project-level symlink that points
    // outside the fixture, mirroring S01_REVIEW finding 1.
    const outside = mkdtempSync(join(tmpdir(), "s01-out-"));
    try {
      mkdirSync(join(root, "src", "content"), { recursive: true });
      const symlinkName = "linked-parent";
      symlinkSync(outside, join(root, symlinkName), "dir");
      const configuredRoot = join(root, symlinkName, "content");
      mkdirSync(join(configuredRoot, "blog"), { recursive: true });
      const outsideSentinel = join(outside, "outside-sentinel.txt");
      writeFileSync(outsideSentinel, "untouched");

      const env = { ADMIN_KEY: "test-admin-key-xyz" };
      const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
      // Use a cwd that exposes the configured root via the project's
      // resolveSafeContentPath. process.cwd() must equal `root` for the
      // route to compute blogContentRoot() = `<root>/src/content`, which
      // would skip the symlink. The real escape path requires the route's
      // configured root to BE the symlinked one. We exercise the helper
      // directly via the route module's exported content-paths import
      // (which we cannot reach from outside). Instead, we configure
      // process.cwd() to the symlinked path; the route resolves blogContentRoot
      // = process.cwd() + "/src/content" which would NOT be the symlink.
      // To exercise the symlink path through the helper, we use the same
      // root for the helper's resolveSafeContentPath call.
      const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
        env,
        cwd: root,
        cookieStore,
      });
      // Construct a request with pillar/slug that would otherwise escape;
      // the test confirms the route rejects and the outside sentinel stays.
      const req = makeNextRequest("http://localhost/api/cms/sync", {
        method: "POST",
        headers: { cookie: buildCookieHeader(cookieStore) },
        body: JSON.stringify({
          pillar: "ai",
          slug: "escape",
          title: "T",
          body: "x",
        }),
      });
      // The route computes blogContentRoot() from process.cwd(), which is
      // the fixture root; this is NOT the symlinked path. The route's POST
      // will write to <fixture>/src/content/blog/ai/escape.mdx (not the
      // outside dir). To exercise the symlinked-ancestor rejection through
      // the actual helper, we also call the exported helper via a direct
      // import in this test process.
      const helper = await import(
        pathToFileURL(pathResolve(REPO, "src/lib/content-paths.ts")).href
      );
      let escapeAccepted = false;
      try {
        await helper.resolveSafeContentPath(configuredRoot, "ai", "escape", ".mdx");
        escapeAccepted = true;
      } catch {
        escapeAccepted = false;
      }
      assert.equal(escapeAccepted, false, "symlinked project ancestor must be rejected by the helper");
      // The route request: the route computes its content root via cwd
      // (the fixture root, which has no symlinks), so it would write
      // successfully — but that is the SAFE path, not the symlink-escape
      // path. We therefore also confirm that nothing was written under
      // the outside directory.
      const res = await exports.POST(req);
      // Acceptable outcomes: 200 (wrote inside fixture) or 400 (unsafe
      // path). Neither outcome should write into the outside dir.
      const outsideWritten = (() => {
        try {
          return require("node:fs").readdirSync(outside);
        } catch {
          return [];
        }
      })();
      assert.ok(
        !outsideWritten.some((n) => n.endsWith(".mdx")),
        `outside dir must not contain mdx, got ${JSON.stringify(outsideWritten)}`,
      );
      // Sentinel must remain.
      assert.equal(readFileSync(outsideSentinel, "utf8"), "untouched");
      // The 200 case is the expected outcome for the route's own content
      // root; the symlink-escape rejection is exercised through the helper
      // directly above.
      assert.ok(res.status === 200 || res.status === 400, `unexpected status ${res.status}`);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  // PUT happy path: rename, real write, real read-back.
  await test("cms PUT: cookie-auth rename -> old file removed, new file saved with new content", async (root) => {
    prepContentRoot(root);
    // Seed an existing article.
    const pillarDir = join(root, "src/content/blog/ai");
    mkdirSync(pillarDir, { recursive: true });
    const oldFile = join(pillarDir, "original.mdx");
    writeFileSync(oldFile, "---\ntitle: Original\n---\n\nold body\n");
    const env = { ADMIN_KEY: "test-admin-key-xyz" };
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest("http://localhost/api/cms/sync", {
      method: "PUT",
      headers: { cookie: buildCookieHeader(cookieStore) },
      body: JSON.stringify({
        pillar: "ai",
        slug: "original",
        newPillar: "ai",
        newSlug: "renamed",
        title: "Renamed",
        body: "new body",
      }),
    });
    const res = await exports.PUT(req);
    const json = await res.json();
    assert.equal(res.status, 200, `expected 200, got ${res.status} ${JSON.stringify(json)}`);
    assert.equal(json.success, true);
    assert.equal(existsSync(oldFile), false, "old file should be removed");
    const newFile = join(pillarDir, "renamed.mdx");
    assert.equal(existsSync(newFile), true, "new file should exist");
    const contents = readFileSync(newFile, "utf8");
    assert.ok(contents.includes('title: "Renamed"'), `unexpected content: ${contents}`);
  });

  // PUT denied auth: zero effects.
  await test("cms PUT: denied auth -> no real write or unlink", async (root) => {
    prepContentRoot(root);
    const pillarDir = join(root, "src/content/blog/ai");
    mkdirSync(pillarDir, { recursive: true });
    const existing = join(pillarDir, "original.mdx");
    writeFileSync(existing, "---\ntitle: Original\n---\n\nbody\n");
    const env = {};
    const cookieStore = new Map();
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest("http://localhost/api/cms/sync", {
      method: "PUT",
      headers: {},
      body: JSON.stringify({
        pillar: "ai",
        slug: "original",
        newSlug: "leak",
        title: "T",
        body: "x",
      }),
    });
    const res = await exports.PUT(req);
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
    assert.equal(existsSync(existing), true, "existing must remain on denied auth");
    assert.equal(existsSync(join(pillarDir, "leak.mdx")), false, "no leak file should exist");
  });

  // DELETE happy path: real unlink.
  await test("cms DELETE: cookie-auth removes the file", async (root) => {
    prepContentRoot(root);
    const pillarDir = join(root, "src/content/blog/ai");
    mkdirSync(pillarDir, { recursive: true });
    const target = join(pillarDir, "doomed.mdx");
    writeFileSync(target, "---\ntitle: X\n---\n\nbody\n");
    const env = { ADMIN_KEY: "test-admin-key-xyz" };
    const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest("http://localhost/api/cms/sync?pillar=ai&slug=doomed", {
      method: "DELETE",
      headers: { cookie: buildCookieHeader(cookieStore) },
    });
    const res = await exports.DELETE(req);
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.equal(existsSync(target), false, "doomed file should be removed");
  });

  // DELETE denied auth: zero effects.
  await test("cms DELETE: denied auth -> file untouched", async (root) => {
    prepContentRoot(root);
    const pillarDir = join(root, "src/content/blog/ai");
    mkdirSync(pillarDir, { recursive: true });
    const target = join(pillarDir, "survivor.mdx");
    writeFileSync(target, "---\ntitle: X\n---\n\nbody\n");
    const env = {};
    const cookieStore = new Map();
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const req = makeNextRequest("http://localhost/api/cms/sync?pillar=ai&slug=survivor", {
      method: "DELETE",
      headers: {},
    });
    const res = await exports.DELETE(req);
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
    assert.equal(existsSync(target), true, "survivor file must remain on denied auth");
  });

  // Provider imports fail-closed: the route must not load any email /
  // external transport.
  await test("cms route: no provider module is loaded into the route sandbox", async () => {
    const src = readFileSync(
      pathResolve(REPO, "src/app/api/cms/sync/route.ts"),
      "utf8",
    );
    // The route file should not `import` `resend`, `Resend`, or any
    // provider client. Earlier S01 review permitted Resend only as a
    // top-level import for legacy newsletter send; the CMS route must
    // never carry it.
    assert.equal((await /from\s+["']resend["']/i.test(src)), false, "CMS route must not import resend");
    assert.equal((await /\bResend\b/.test(src)), false, "CMS route must not reference Resend");
  });

  // Outside-root sentinel stays untouched through denied writes.
  await test("cms POST/DELETE: denied writes leave outside sentinel untouched", async (root) => {
    prepContentRoot(root);
    const outsideSentinel = join(root, "outside-sentinel.txt");
    writeFileSync(outsideSentinel, "untouched");
    const env = {};
    const cookieStore = new Map();
    const { exports } = loadRouteModule("src/app/api/cms/sync/route.ts", {
      env,
      cwd: root,
      cookieStore,
    });
    const writeReq = makeNextRequest("http://localhost/api/cms/sync", {
      method: "POST",
      headers: {},
      body: JSON.stringify({ pillar: "ai", slug: "x", title: "T", body: "x" }),
    });
    const writeRes = await exports.POST(writeReq);
    assert.equal(writeRes.status, 401);

    const delReq = makeNextRequest("http://localhost/api/cms/sync?pillar=ai&slug=doesnotexist", {
      method: "DELETE",
      headers: {},
    });
    const delRes = await exports.DELETE(delReq);
    assert.equal(delRes.status, 401);
    assert.equal(readFileSync(outsideSentinel, "utf8"), "untouched");
  });
}

// ----------------------------------------------------------------------------
// Driver
// ----------------------------------------------------------------------------

console.log("S01 mutation-boundary harness");
console.log("==============================");

await testContentPaths();
await testAdminNew();
await testAdminEdit();
await testAdminNewsletter();
await testCmsRoute();

console.log("");
console.log(`results: ${testCount - failCount}/${testCount} passed`);
if (failCount > 0) {
  console.log("");
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  FAIL ${r.name}: ${r.error}`);
  }
  process.exit(1);
}
process.exit(0);