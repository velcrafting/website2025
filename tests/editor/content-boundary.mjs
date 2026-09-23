// tests/editor/content-boundary.mjs
//
// Offline fixture harness for S03: public-content visibility and rendering.
//
// Goals:
//   - Draft / future-scheduled / unknown-status content is excluded from
//     every public surface (list, detail, related, sitemap, project
//     readers).
//   - Published content appears in initial HTML with article body
//     present (server-rendered).
//   - JSON-LD output is script-tag-safe (no embedded "</script>").
//   - Inert malicious structured-data fixtures (script tags, etc.) do
//     not escape JSON-LD bounds.
//   - The admin editor still sees drafts (S01 must not regress).
//
// The harness uses the in-memory TS compiler transform to load the real
// source modules without a Next.js runtime. Page modules are loaded
// with stubbed next/* and a controlled @/lib/content so we can place
// fixture documents into a private directory and observe the public
// projection.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync as fs_readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve as pathResolve } from "node:path";
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

import {
  loadPageModule,
  loadRouteModule,
} from "./_transform.mjs";

// Helper to build a Cookie header value from a Map of cookie name -> value.
function buildCookieHeader(cookieStore) {
  return Array.from(cookieStore.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// Helper to fabricate a NextRequest-like object.
function makeNextRequest(url, init = {}) {
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

// Load a TS module from website2025's src/ tree using the same in-memory
// transform pipeline as _transform.mjs's loadPageModule / loadRouteModule,
// so the harness can drive pure helpers (e.g. isPubliclyVisible,
// getStatus, escapeForScriptTag, allPublicWriting) without a Next.js
// runtime.
import { dirname as _dirname } from "node:path";

const _nodeRequire = createRequire(import.meta.url);

// Cache loaded modules by absolute path. Test cases call process.chdir()
// to point the helper's CONTENT_ROOT at a temp fixture, so the cache
// must be flushed between cases (and ideally within a case that
// re-points cwd).
const _moduleCache = new Map();

function loadScriptModule(relPath, options = {}) {
  const abs = pathResolve(REPO, relPath);
  // Force fresh load if a custom cwd is requested or if no cached copy.
  if (options.cwd) _moduleCache.delete(abs);
  if (_moduleCache.has(abs)) return _moduleCache.get(abs);
  const src = fs_readFileSync(abs, "utf8");
  // Strip TS-only directives that would fail Node parsing.
  const stripped = src.replace(
    /^\s*["']use (server|client)["'];?\s*$/m,
    "",
  );
  const result = ts.transpileModule(stripped, {
    fileName: abs,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.Preserve,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      isolatedModules: true,
      strict: false,
      skipLibCheck: true,
    },
  });
  if (result.diagnostics && result.diagnostics.length) {
    const msgs = result.diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("\n");
    throw new Error(`transpile failed: ${msgs}\n${abs}`);
  }
  const cwd = options.cwd ?? "/";
  const env = options.env ?? {};
  const sandbox = {
    module: { exports: {} },
    exports: undefined,
    require: undefined,
    __filename: abs,
    __dirname: _dirname(abs),
    process: { cwd: () => cwd, env },
    Buffer,
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    globalThis: undefined,
  };
  sandbox.globalThis = sandbox;
  function sandboxRequire(req) {
    if (req === "node:fs/promises") return _nodeRequire("node:fs/promises");
    if (req === "node:path") return _nodeRequire("node:path");
    if (req === "node:fs") return _nodeRequire("node:fs");
    if (req === "server-only") {
      // Stub: Next.js throws if this module is imported into a client
      // bundle. The harness never loads a client bundle.
      return {};
    }
    if (req.startsWith("@/")) {
      const rest = req.slice(2);
      const candidateTs = pathResolve(REPO, "src", rest);
      // Use createRequire to resolve relative imports; for @/ we load
      // by recursively running transpileModule.
      const child = loadScriptModule("src/" + rest + (rest.endsWith(".ts") ? "" : ".ts"));
      return child;
    }
    if (req.startsWith(".")) {
      // Resolve relative to caller file.
      const caller = abs;
      const dir = _dirname(caller);
      const target = pathResolve(dir, req);
      return loadScriptModule(target);
    }
    return _nodeRequire(req);
  }
  sandbox.require = sandboxRequire;
  sandbox.exports = sandbox.module.exports;
  const fn = vm.runInNewContext(
    `(function (exports, require, module, __filename, __dirname) {${result.outputText}\n})`,
    sandbox,
  );
  fn(sandbox.module.exports, sandboxRequire, sandbox.module, abs, _dirname(abs));
  _moduleCache.set(abs, sandbox.module.exports);
  return sandbox.module.exports;
}

const HERE = import.meta.dirname ?? pathResolve(dirname(new URL(import.meta.url).pathname));
const REPO = pathResolve(HERE, "..", "..");

let testCount = 0;
let failCount = 0;
const results = [];

async function test(name, fn) {
  testCount += 1;
  const fixtureRoot = mkdtempSync(join(tmpdir(), "s03-"));
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

// Place fixture MDX into a real content directory tree.
async function seedBlogDir(root) {
  const blogBase = join(root, "src", "content", "blog");
  mkdirSync(join(blogBase, "ai"), { recursive: true });
  mkdirSync(join(blogBase, "communications"), { recursive: true });
  mkdirSync(join(blogBase, "labs"), { recursive: true });
  mkdirSync(join(root, "src", "content", "projects"), { recursive: true });
  mkdirSync(join(root, "src", "content", "labs"), { recursive: true });
  mkdirSync(join(root, "src", "content", "tools"), { recursive: true });
  // Published article with a real body.
  writeFileSync(
    join(blogBase, "ai", "published-article.mdx"),
    [
      "---",
      "title: \"Published AI Article\"",
      "summary: \"Public article body\"",
      "date: \"2025-09-01\"",
      "status: published",
      "---",
      "",
      "## Opening",
      "",
      "PUBLIC_BODY_SENTINEL: ai-published",
      "",
    ].join("\n"),
  );
  // Draft article (must never appear publicly).
  writeFileSync(
    join(blogBase, "ai", "draft-article.mdx"),
    [
      "---",
      "title: \"Draft AI Article\"",
      "summary: \"Should not appear publicly\"",
      "date: \"2025-09-01\"",
      "status: draft",
      "---",
      "",
      "DRAFT_BODY_SENTINEL: ai-draft",
      "",
    ].join("\n"),
  );
  // Future-scheduled article (must never appear publicly).
  writeFileSync(
    join(blogBase, "ai", "future-article.mdx"),
    [
      "---",
      "title: \"Future AI Article\"",
      "summary: \"Should not appear publicly yet\"",
      "scheduledAt: \"2099-12-31T00:00:00Z\"",
      "status: scheduled",
      "---",
      "",
      "FUTURE_BODY_SENTINEL: ai-future",
      "",
    ].join("\n"),
  );
  // Unknown status (no status, no date): must be treated as draft.
  writeFileSync(
    join(blogBase, "ai", "unknown-article.mdx"),
    [
      "---",
      "title: \"Unknown AI Article\"",
      "summary: \"Should not appear publicly\"",
      "---",
      "",
      "UNKNOWN_BODY_SENTINEL: ai-unknown",
      "",
    ].join("\n"),
  );
  // Malicious structured-data title: contains a literal </script> tag.
  writeFileSync(
    join(blogBase, "communications", "evil-title.mdx"),
    [
      "---",
      "title: \"Public</script><script>alert('xss')</script>\"",
      "summary: \"contains literal </script>\"",
      "date: \"2025-09-01\"",
      "status: published",
      "---",
      "",
      "EVIL_BODY_SENTINEL: evil-body",
      "",
    ].join("\n"),
  );
  // Second published article (with no body).
  writeFileSync(
    join(blogBase, "communications", "second.mdx"),
    [
      "---",
      "title: \"Second Article\"",
      "summary: \"Public second article\"",
      "date: \"2025-08-01\"",
      "status: published",
      "---",
      "",
      "SECOND_BODY_SENTINEL: second",
      "",
    ].join("\n"),
  );
  // Projects: published + draft.
  writeFileSync(
    join(root, "src", "content", "projects", "risqpost.mdx"),
    [
      "---",
      "title: \"Risqpost\"",
      "summary: \"Public project\"",
      "date: \"2025-09-01\"",
      "status: published",
      "---",
      "",
      "RISQPOST_BODY_SENTINEL: project-public",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "content", "projects", "draft-project.mdx"),
    [
      "---",
      "title: \"Draft Project\"",
      "summary: \"Should not appear publicly\"",
      "date: \"2025-09-01\"",
      "status: draft",
      "---",
      "",
      "DRAFT_PROJECT_BODY_SENTINEL: project-draft",
      "",
    ].join("\n"),
  );
  // Labs / tools.
  writeFileSync(
    join(root, "src", "content", "labs", "qr-lab.mdx"),
    [
      "---",
      "title: \"QR Lab\"",
      "summary: \"Public lab\"",
      "date: \"2025-08-31\"",
      "status: published",
      "---",
      "",
      "QR_BODY_SENTINEL: lab-public",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "content", "labs", "draft-lab.mdx"),
    [
      "---",
      "title: \"Draft Lab\"",
      "summary: \"Should not appear publicly\"",
      "status: draft",
      "---",
      "",
      "DRAFT_LAB_SENTINEL: lab-draft",
      "",
    ].join("\n"),
  );
}

function prepEnv() {
  return { ADMIN_KEY: "test-admin-key-xyz" };
}

function prepCookie() {
  return new Map([["admin", "test-admin-key-xyz"]]);
}

async function testBlog() {
  // 1. List page: only published titles appear, no sentinel from drafts.
  await test("blog list: published article present, draft/future/unknown absent", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/content.ts");
    // Direct validation: isPubliclyVisible returns false for drafts/future/unknown.
    const published = helper.getStatus({ status: "published" });
    const draft = helper.getStatus({ status: "draft" });
    const future = helper.getStatus({ status: "scheduled", scheduledAt: "2099-12-31T00:00:00Z" });
    const unknown = helper.getStatus({});
    assert.equal(published, "published");
    assert.equal(draft, "draft");
    assert.equal(future, "scheduled");
    assert.equal(unknown, "draft");
    assert.equal(helper.isPubliclyVisible({ status: "published" }), true);
    assert.equal(helper.isPubliclyVisible({ status: "draft" }), false);
    assert.equal(helper.isPubliclyVisible({ status: "scheduled", scheduledAt: "2099-12-31T00:00:00Z" }), false);
    assert.equal(helper.isPubliclyVisible({}), false);
  });

  // 2. Direct article route denies drafts and future-scheduled.
  await test("blog article route: draft returns 404 from direct URL", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const publicFound = await helper.findPublicMdxDoc("blog", "published-article", "ai");
      const draftFound = await helper.findPublicMdxDoc("blog", "draft-article", "ai");
      const futureFound = await helper.findPublicMdxDoc("blog", "future-article", "ai");
      const unknownFound = await helper.findPublicMdxDoc("blog", "unknown-article", "ai");
      assert.ok(publicFound, "published article should be findable");
      assert.equal(draftFound, null, "draft article must return null");
      assert.equal(futureFound, null, "future-scheduled article must return null");
      assert.equal(unknownFound, null, "unknown-status article must return null");
    } finally {
      process.chdir(origCwd);
    }
  });

  // 3. Related posts in detail page filter drafts.
  await test("blog detail related list filters out drafts/future/unknown", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const pillarDocs = await helper.loadMDX("blog", "ai");
      const slugs = pillarDocs.map((d) => d.slug).sort();
      const expected = ["published-article"];
      assert.ok(
        slugs.length === expected.length && slugs[0] === expected[0],
        `unexpected slugs: ${JSON.stringify(slugs)}`,
      );
    } finally {
      process.chdir(origCwd);
    }
  });

  // 4. Sitemap excludes drafts and future items.
  await test("sitemap: only public items in sitemap.xml", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/content.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const [projects, writing, labs] = await Promise.all([
        helper.allPublicProjects(),
        helper.allPublicWriting(),
        helper.allPublicLabs(),
      ]);
      const projectSlugs = projects.map((p) => p.slug).sort();
      const writingSlugs = writing.map((w) => w.slug).sort();
      const labSlugs = labs.map((l) => l.slug).sort();
      assert.ok(projectSlugs.length === 1 && projectSlugs[0] === "risqpost", `projects: ${JSON.stringify(projectSlugs)}`);
      assert.ok(writingSlugs.length === 3 && writingSlugs.includes("ai/published-article") && writingSlugs.includes("communications/second") && writingSlugs.includes("communications/evil-title"), `writing: ${JSON.stringify(writingSlugs)}`);
      assert.ok(labSlugs.length === 1 && labSlugs[0] === "qr-lab", `labs: ${JSON.stringify(labSlugs)}`);
      // No sentinel from drafts.
      assert.equal(JSON.stringify(writing).includes("DRAFT_BODY_SENTINEL"), false);
      assert.equal(JSON.stringify(writing).includes("FUTURE_BODY_SENTINEL"), false);
      assert.equal(JSON.stringify(writing).includes("UNKNOWN_BODY_SENTINEL"), false);
      assert.equal(JSON.stringify(projects).includes("DRAFT_PROJECT_BODY_SENTINEL"), false);
      assert.equal(JSON.stringify(labs).includes("DRAFT_LAB_SENTINEL"), false);
    } finally {
      process.chdir(origCwd);
    }
  });

  // 5. JSON-LD escape: a literal </script> in the title becomes \u003c
  // so it cannot terminate the script tag.
  await test("seo.escapeForScriptTag: neutralizes </script>", async () => {
    const seo = loadScriptModule("src/lib/seo.ts");
    const raw = JSON.stringify({
      headline: "Public</script><script>alert('xss')</script>",
    });
    const escaped = seo.escapeForScriptTag(raw);
    assert.equal(escaped.includes("</script>"), false, `raw </script> must be escaped: ${escaped}`);
    assert.equal(escaped.includes("\\u003c"), true, `< must be escaped to \\u003c: ${escaped}`);
    assert.equal(escaped.includes("\\u003e"), true, `> must be escaped to \\u003e: ${escaped}`);
  });

  // 6. Malicious structured data with literal </script> in title is rendered inertly.
  await test("evil-title article: JSON-LD payload never contains raw </script>", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const seo = loadScriptModule("src/lib/seo.ts");
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const doc = await helper.findPublicMdxDoc(
        "blog",
        "evil-title",
        "communications",
      );
      assert.ok(doc, "evil-title article must be findable as published");
      const jsonLd = JSON.stringify({
        headline: doc.frontmatter.title,
      });
      const safe = seo.escapeForScriptTag(jsonLd);
      assert.equal(safe.includes("</script>"), false);
      assert.ok(
        safe.includes("\\u003c/script\\u003e") || safe.includes("\\u003c\\/script\\u003e"),
        `expected escaped </script>, got: ${safe}`,
      );
    } finally {
      process.chdir(origCwd);
    }
  });

  // 7. Initial HTML contains the published article body via MDX runtime.
  await test("blog detail: published article body rendered to HTML by MDX runtime", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const doc = await helper.findPublicMdxDoc("blog", "published-article", "ai");
      assert.ok(doc);
      const runtime = await import("react/jsx-runtime");
      const React = await import("react");
      const { evaluate } = await import("@mdx-js/mdx");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const result = await evaluate(doc.content, {
        ...runtime,
        baseUrl: pathToFileURL(join(REPO, "src/components/mdx/MdxServer.tsx")).href,
        remarkPlugins: [],
        rehypePlugins: [],
      });
      const Comp = result.default;
      const html = renderToStaticMarkup(React.createElement(Comp));
      // The compiled HTML MUST contain the published body sentinel and
      // MUST NOT contain the draft/future/unknown sentinels.
      assert.ok(
        html.includes("PUBLIC_BODY_SENTINEL"),
        `rendered HTML must contain the published sentinel: ${html.slice(0, 200)}`,
      );
      assert.equal(html.includes("DRAFT_BODY_SENTINEL"), false);
      assert.equal(html.includes("FUTURE_BODY_SENTINEL"), false);
      assert.equal(html.includes("UNKNOWN_BODY_SENTINEL"), false);
    } finally {
      process.chdir(origCwd);
    }
  });

  // 8. loadMDX denies drafts by default; drafts remain reachable only
  // through the explicit includeDrafts opt-in (used by a non-public
  // editor surface), so the protected projects list cannot leak drafts.
  await test("loadMDX defaults to public-only and exposes drafts only via includeDrafts", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const defaultDocs = await helper.loadMDX("blog", "ai");
      const defaultSlugs = defaultDocs.map((d) => d.slug).sort();
      assert.ok(
        defaultSlugs.length === 1 && defaultSlugs[0] === "published-article",
        `default loadMDX must be public-only, got ${JSON.stringify(defaultSlugs)}`,
      );
      const withDrafts = await helper.loadMDX("blog", "ai", { includeDrafts: true });
      const draftSlugs = withDrafts.map((d) => d.slug).sort();
      assert.ok(
        draftSlugs.includes("draft-article") &&
          draftSlugs.includes("future-article") &&
          draftSlugs.includes("unknown-article"),
        `includeDrafts must expose drafts, got ${JSON.stringify(draftSlugs)}`,
      );
    } finally {
      process.chdir(origCwd);
    }
  });
}

async function testProjects() {
  await test("projects list: only public docs in MDX case-study strip", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const docs = await helper.loadMDX("projects");
      const slugs = docs.map((d) => d.slug).sort();
      assert.ok(
        slugs.length === 1 && slugs[0] === "risqpost",
        `unexpected: ${JSON.stringify(slugs)}`,
      );
    } finally {
      process.chdir(origCwd);
    }
  });

  await test("projects detail: draft returns null from findPublicMdxDoc", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const draft = await helper.findPublicMdxDoc("projects", "draft-project");
      assert.equal(draft, null);
    } finally {
      process.chdir(origCwd);
    }
  });
}

async function testTools() {
  await test("tools list: only public labs in MDX strip", async (root) => {
    await seedBlogDir(root);
    const helper = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const origCwd = process.cwd();
    try {
      process.chdir(root);
      const docs = await helper.loadMDX("labs");
      const slugs = docs.map((d) => d.slug).sort();
      assert.ok(slugs.length === 1 && slugs[0] === "qr-lab", `unexpected: ${JSON.stringify(slugs)}`);
    } finally {
      process.chdir(origCwd);
    }
  });
}

// Regression for GATE_A_REVIEW finding 1: the visibility predicate must deny
// unknown/malformed metadata instead of falling through, and both the raw and
// coerced reader paths must agree.
async function testVisibilityFallThrough() {
  await test("predicate: unknown status, invalid date and contradictory schedules deny", async () => {
    const c = loadScriptModule("src/lib/content.ts");
    // Unknown status must not fall through to date inference.
    assert.equal(c.getStatus({ status: "unknown", date: "2020-01-01" }), "draft");
    assert.equal(c.isPubliclyVisible({ status: "unknown", date: "2020-01-01" }), false);
    // An unparseable date is unknown metadata, not a past date.
    assert.equal(c.getStatus({ date: "invalid" }), "draft");
    assert.equal(c.isPubliclyVisible({ date: "invalid" }), false);
    // A future schedule hides the item whatever the status says.
    assert.equal(c.getStatus({ status: "published", scheduledAt: "2999-01-01" }), "scheduled");
    assert.equal(c.isPubliclyVisible({ status: "published", scheduledAt: "2999-01-01" }), false);
    // Documented precedence: a scheduled item publishes once its time passes.
    assert.equal(c.getStatus({ status: "scheduled", scheduledAt: "2020-01-01" }), "published");
    // Unrecognised / malformed scheduling metadata denies.
    assert.equal(c.getStatus({ status: "scheduled", scheduledAt: "not-a-date" }), "draft");
    assert.equal(c.getStatus({ status: "published", scheduledAt: "not-a-date" }), "draft");
    // No metadata, or a bare title, denies.
    assert.equal(c.getStatus({}), "draft");
    assert.equal(c.getStatus({ title: "x" }), "draft");
    // Explicit draft still hides dated content.
    assert.equal(c.getStatus({ status: "draft", date: "2020-01-01" }), "draft");
    // Legacy dated content (no status) still publishes.
    assert.equal(c.getStatus({ date: "2020-01-01" }), "published");
  });

  // The review's exact probe table, plus wrong-typed variants and Invalid Date.
  await test("predicate: wrong-typed and Invalid Date metadata denies without throwing", async () => {
    const c = loadScriptModule("src/lib/content.ts");
    const probes = [
      [{ status: 123, date: "2020-01-01" }, "numeric status with a past date"],
      [{ status: "published", scheduledAt: 123 }, "numeric scheduledAt"],
      [{ status: "published", scheduledAt: {} }, "object scheduledAt"],
      [{ status: "published", date: "invalid" }, "explicit published with an unparseable date"],
      [{ status: true, date: "2020-01-01" }, "boolean status"],
      [{ status: [], date: "2020-01-01" }, "array status"],
    ];
    for (const [raw, label] of probes) {
      assert.equal(c.getStatus(raw), "draft", `raw getStatus should deny: ${label}`);
      assert.equal(c.isPubliclyVisible(raw), false, `raw isPubliclyVisible should deny: ${label}`);
    }

    // Invalid Date, constructed cross-realm so the duck-typed path is used.
    // It must deny and must not raise a RangeError from toISOString.
    const invalid = new Date(NaN);
    const invalidCases = [
      { status: "published", date: invalid },
      { date: invalid },
      { status: "published", scheduledAt: invalid },
      { status: "scheduled", scheduledAt: invalid },
    ];
    for (const raw of invalidCases) {
      assert.equal(c.getStatus(raw), "draft", "Invalid Date metadata must deny");
    }
  });

  await test("readers: fall-through metadata excluded on both raw and coerced paths", async (root) => {
    const base = join(root, "src", "content", "blog", "ai");
    mkdirSync(base, { recursive: true });
    // [slug, extra frontmatter lines, expected public visibility]
    const cases = [
      ["unknown-status", ["status: unknown", 'date: "2020-01-01"'], false],
      ["invalid-date", ["date: invalid"], false],
      ["published-future", ["status: published", "scheduledAt: 2999-01-01"], false],
      ["scheduled-future", ["status: scheduled", "scheduledAt: 2999-01-01"], false],
      ["scheduled-no-date", ["status: scheduled"], false],
      ["no-metadata", [], false],
      ["scheduled-past", ["status: scheduled", "scheduledAt: 2020-01-01"], true],
      ["legacy-dated", ['date: "2020-01-01"'], true],
      // Wrong-typed metadata: present but unusable. Must deny on BOTH readers,
      // and must not be treated as merely absent (GATE_A_REPAIR_REVIEW 1).
      ["wrong-typed-status", ["status: 123", 'date: "2020-01-01"'], false],
      ["schedule-number", ["status: published", "scheduledAt: 123"], false],
      ["schedule-object", ["status: published", "scheduledAt: {}"], false],
      ["published-bad-date", ["status: published", "date: invalid"], false],
      ["bad-date-bad-schedule", ["date: invalid", "scheduledAt: invalid"], false],
    ];
    for (const [slug, extraLines, , ] of cases) {
      writeFileSync(
        join(base, `${slug}.mdx`),
        ["---", `title: "${slug}"`, ...extraLines, "---", "", `BODY_${slug}`, ""].join("\n"),
      );
    }

    const raw = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const coerced = loadScriptModule("src/lib/content.ts", { cwd: root });

    const rawSlugs = (await raw.loadMDX("blog", "ai")).map((d) => d.slug).sort();
    // The coerced list reader walks from <root>/src/content/blog, so its slugs
    // include the pillar prefix.
    const coercedSlugs = (await coerced.allPublicWriting()).map((d) => d.slug).sort();

    for (const [slug, , expected] of cases) {
      assert.equal(
        rawSlugs.includes(slug),
        expected,
        `raw reader: ${slug} visibility ${rawSlugs.includes(slug)}, expected ${expected} (${JSON.stringify(rawSlugs)})`,
      );
      assert.equal(
        coercedSlugs.includes(`ai/${slug}`),
        expected,
        `coerced reader: ${slug} visibility ${coercedSlugs.includes(`ai/${slug}`)}, expected ${expected} (${JSON.stringify(coercedSlugs)})`,
      );
    }
    // Positive control: the legacy dated + past-scheduled items must be present,
    // otherwise "everything hidden" would pass.
    assert.ok(rawSlugs.includes("legacy-dated"), "positive control: legacy dated content missing");
    assert.ok(rawSlugs.includes("scheduled-past"), "positive control: past-scheduled content missing");
  });

  await test("full flow: unknown-status body is not rendered as a public page", async (root) => {
    const base = join(root, "src", "content", "blog", "ai");
    mkdirSync(base, { recursive: true });
    writeFileSync(
      join(base, "mystery.mdx"),
      ["---", 'title: "Mystery"', "status: mystery", 'date: "2020-01-01"', "---", "", "SECRET_BODY", ""].join("\n"),
    );
    const raw = loadScriptModule("src/lib/mdx.ts", { cwd: root });
    const doc = await raw.findPublicMdxDoc("blog", "mystery", "ai");
    assert.equal(doc, null, "unknown-status content must not be readable as public");
  });
}


// Regression for the project-page 500: MDX content imports shared
// components with the `@/components/mdx/*` alias. The server renderer
// strips those alias ESM lines and supplies the components through the
// `components` map, so every component a content file imports must be
// present in `mdxComponents`. A missing entry would produce a
// `_missingMdxReference` runtime error instead of rendered HTML.
async function testMdxAliasCoverage() {
  await test("mdx content alias imports are all supplied by the components map", async () => {
    const fsMod = await import("node:fs");
    const pathMod = await import("node:path");
    const contentRoot = pathResolve(REPO, "src/content");

    const files = [];
    (function walk(dir) {
      for (const entry of fsMod.readdirSync(dir)) {
        const p = pathMod.join(dir, entry);
        if (fsMod.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".mdx")) files.push(p);
      }
    })(contentRoot);

    const aliasRe = /^[ \t]*import[^\n]*from[^\n]*["']@\/components\/mdx\/([A-Za-z0-9_]+)["']/gm;
    const imported = new Set();
    for (const f of files) {
      const src = fsMod.readFileSync(f, "utf8");
      let m;
      while ((m = aliasRe.exec(src)) !== null) imported.add(m[1]);
    }

    const compSrc = fsMod.readFileSync(
      pathResolve(REPO, "src/components/mdx/mdx-components.tsx"),
      "utf8",
    );
    const provided = new Set();
    const objMatch = compSrc.match(/mdxComponents\s*=\s*\{([\s\S]*?)\}/);
    if (objMatch) {
      for (const line of objMatch[1].split("\n")) {
        const mm = line.match(/^\s*([A-Za-z_$][\w$]*)\s*[:,]/);
        if (mm) provided.add(mm[1]);
      }
    }

    assert.ok(imported.size > 0, "expected at least one aliased component import in content");
    const missing = [...imported].filter((name) => !provided.has(name));
    assert.equal(
      missing.length,
      0,
      `content imports components not supplied by mdxComponents: ${missing.join(", ")}`,
    );
  });
}

console.log("S03 content-boundary harness");
console.log("=============================");

await testBlog();
await testProjects();
await testTools();
await testVisibilityFallThrough();
await testMdxAliasCoverage();

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