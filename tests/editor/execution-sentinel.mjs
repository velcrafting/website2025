// tests/editor/execution-sentinel.mjs
//
// Regression for GATE_A_REVIEW finding 2: rendered article bodies must never
// execute authored code.
//
// The test drives the REAL mutable content flow:
//   CMS POST route (authenticated write) -> loader -> renderer
// using an isolated temp content root, and asserts that a body containing
// executable MDX never runs. It also asserts the positive direction: ordinary
// markdown and the allow-listed components still render.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative, resolve as pathResolve } from "node:path";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import vm from "node:vm";

import ts from "typescript";

const HERE = import.meta.dirname ?? pathResolve(dirname(new URL(import.meta.url).pathname));
const REPO = pathResolve(HERE, "..", "..");
const nodeRequire = createRequire(import.meta.url);

let testCount = 0;
let failCount = 0;
const results = [];

async function test(name, fn) {
  testCount += 1;
  const fixtureRoot = mkdtempSync(join(tmpdir(), "gate-a-mdx-"));
  try {
    await fn(fixtureRoot);
    results.push({ name, ok: true });
    console.log(`  ok  ${name}`);
  } catch (err) {
    failCount += 1;
    results.push({ name, ok: false, error: err?.message ?? String(err) });
    console.log(`  FAIL ${name}`);
    console.log(`       ${err?.stack ? err.stack.split("\n").slice(0, 6).join("\n       ") : err}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// Load a TS module through the installed compiler, resolving @/ aliases and
// bare packages from the repo.
function loadTsModule(relPath, options = {}) {
  const abs = pathResolve(REPO, relPath);
  const src = readFileSync(abs, "utf8");
  const stripped = src.replace(/^[ \t]*["']use (server|client)["'];?[ \t]*$/m, "");
  const out = ts.transpileModule(stripped, {
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
      // Presentational editorial components are .tsx. Without a JSX emit the loader
      // throws "Unexpected token '<'", which previously made every component file
      // unloadable and pushed tests toward stubs instead of the real component.
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const cwd = options.cwd ?? REPO;
  const env = options.env ?? {};
  const sandbox = {
    module: { exports: {} },
    exports: undefined,
    require: undefined,
    __filename: abs,
    __dirname: dirname(abs),
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
    if (req === "server-only") return {};
    if (req.startsWith("@/")) {
      // Resolve a real file rather than assuming ".ts": components are ".tsx" and
      // directories resolve through their index. An unresolvable alias throws and
      // names the specifier, so a missing module is never silently stubbed.
      const base = pathResolve(REPO, "src", req.slice(2));
      const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ];
      const hit = candidates.find((candidate) => existsSync(candidate));
      if (!hit) {
        throw new Error(
          `the sentinel harness cannot resolve ${req}; tried ${candidates.join(", ")}`
        );
      }
      return loadTsModule(relative(REPO, hit), options);
    }
    return nodeRequire(req);
  }
  sandbox.require = sandboxRequire;
  const fn = vm.runInNewContext(
    `(function (exports, require, module, __filename, __dirname) {${out.outputText}\n})`,
    sandbox,
  );
  fn(sandbox.module.exports, sandboxRequire, sandbox.module, abs, dirname(abs));
  return sandbox.module.exports;
}

// --- renderer behaviour -----------------------------------------------------

// The renderer returns React elements (Next.js forbids react-dom/server in its
// server graph). The harness serialises them here so assertions stay on real
// rendered HTML.
const { renderToStaticMarkup } = await import("react-dom/server");
async function toHtml(render, source, components = {}) {
  const element = await render.renderMdxToReact(source, components);
  return renderToStaticMarkup(element);
}

await test("renderer: executable MDX export never runs", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const marker = "gateAReviewSentinel";
  delete globalThis[marker];
  const source = [
    `export const probe = (globalThis.${marker} = "executed")`,
    "",
    "# Harmless fixture",
    "",
    "Visible body text.",
  ].join("\n");
  const html = await toHtml(render, source);
  assert.equal(globalThis[marker], undefined, "the exported initialiser executed");
  assert.equal(html.includes("Harmless fixture"), true, `expected heading in output: ${html}`);
  assert.equal(html.includes("Visible body text."), true, `expected body text: ${html}`);
  assert.equal(html.includes("executed"), false, `unexpected code output: ${html}`);
});

await test("renderer: inline JSX expression never evaluates", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const marker = "gateAExprSentinel";
  delete globalThis[marker];
  const source = [
    `{globalThis.${marker} = "executed"}`,
    "",
    "Paragraph after expression.",
  ].join("\n");
  const html = await toHtml(render, source);
  assert.equal(globalThis[marker], undefined, "the inline expression executed");
  assert.equal(html.includes("Paragraph after expression."), true, `missing paragraph: ${html}`);
});

await test("renderer: JSX attribute expression never evaluates", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const marker = "gateAAttrSentinel";
  delete globalThis[marker];
  const source = [
    `<Callout title={globalThis.${marker} = "executed"}>`,
    "",
    "Attribute body.",
    "",
    "</Callout>",
  ].join("\n");
  const html = await toHtml(render, source, { Callout: (props) => props.children });
  assert.equal(globalThis[marker], undefined, "the attribute expression executed");
  assert.equal(html.includes("Attribute body."), true, `missing attribute body: ${html}`);
});

await test("renderer: alias import line is inert and allow-listed component renders", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const marker = "gateAImportSentinel";
  delete globalThis[marker];
  const source = [
    'import Callout from "@/components/mdx/Callout";',
    `import Evil from "@/components/mdx/Evil";`,
    "",
    "<Callout title=\"Kept\">",
    "",
    "Component body.",
    "",
    "</Callout>",
    "",
    "<Evil />",
  ].join("\n");
  const seen = [];
  const html = await toHtml(render, source, {
    Callout: (props) => {
      seen.push(props);
      return props.children;
    },
  });
  assert.equal(globalThis[marker], undefined, "an import initialiser executed");
  assert.equal(seen.length, 1, "allow-listed component should render exactly once");
  assert.equal(seen[0]?.title, "Kept", `component should receive the literal attribute: ${JSON.stringify(seen[0])}`);
  assert.equal(html.includes("Component body."), true, `missing component body: ${html}`);
});

await test("renderer: normal markdown still renders (tables, code, links)", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const source = [
    "## Heading",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "[link](https://example.com)",
  ].join("\n");
  const html = await toHtml(render, source);
  assert.equal(html.includes("<table>"), true, `expected a table: ${html}`);
  // rehype-prism-plus tokenises code, so assert the block wrapper and the
  // language class rather than the raw text.
  assert.equal(html.includes('class="language-js"'), true, `expected code block: ${html}`);
  assert.equal(html.includes("code-highlight"), true, `expected syntax highlighting: ${html}`);
  assert.equal(html.includes('href="https://example.com"'), true, `expected link: ${html}`);
});

// --- full mutable flow: CMS write -> loader -> renderer ---------------------

await test("full flow: CMS-written body cannot execute through loader + renderer", async (root) => {
  const contentRoot = join(root, "src", "content");
  mkdirSync(join(contentRoot, "blog", "ai"), { recursive: true });
  const env = { ADMIN_KEY: "test-admin-key-xyz" };
  const cookieStore = new Map([["admin", "test-admin-key-xyz"]]);

  const { loadRouteModule } = await import("./_transform.mjs");
  const route = loadRouteModule("src/app/api/cms/sync/route.ts", {
    env,
    cwd: root,
    cookieStore,
  });

  const marker = "gateAFlowSentinel";
  delete globalThis[marker];
  const request = {
    url: "http://localhost/api/cms/sync",
    headers: new Map([["cookie", `admin=test-admin-key-xyz`]]),
    async json() {
      return {
        pillar: "ai",
        slug: "sentinel",
        title: "Sentinel",
        status: "published",
        body: [
          `export const probe = (globalThis.${marker} = "executed")`,
          "",
          "Sentinel body text.",
        ].join("\n"),
      };
    },
  };
  const res = await route.exports.POST(request);
  assert.equal(res.status, 200, `CMS write should succeed, got ${res.status}`);

  // Read back through the real loader.
  const mdx = loadTsModule("src/lib/mdx.ts", { cwd: root });
  const doc = await mdx.findPublicMdxDoc("blog", "sentinel", "ai");
  assert.ok(doc, "the written body should be loadable as published content");

  // Render it with the real renderer.
  const render = loadTsModule("src/lib/mdx-render.ts");
  const html = await toHtml(render, doc.content);
  assert.equal(globalThis[marker], undefined, "the CMS-written body executed code");
  assert.equal(html.includes("Sentinel body text."), true, `missing body text: ${html}`);
});

await test("full flow: private sentinel body content is excluded from public read", async (root) => {
  const contentRoot = join(root, "src", "content");
  mkdirSync(join(contentRoot, "blog", "ai"), { recursive: true });
  writeFileSync(
    join(contentRoot, "blog", "ai", "draft.mdx"),
    ["---", 'title: "Draft"', "status: draft", "---", "", "PRIVATE_SENTINEL_TEXT", ""].join("\n"),
  );
  const mdx = loadTsModule("src/lib/mdx.ts", { cwd: root });
  const doc = await mdx.findPublicMdxDoc("blog", "draft", "ai");
  assert.equal(doc, null, "draft content must not be readable as public");
});

// --- authorable editorial blocks (CODEX_REFRESH_REVIEW finding 7) -----------
//
// The integration risk was that a component existed while the authoring path did not:
// `Gallery` took an array prop, and the scrub deletes JSX expression props, so no
// article could ever supply it. These cases assert the path an AUTHOR can actually use.

await test("authoring: <Gallery> with <GalleryItem> children renders images", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const React = await import("react");
  const Gallery = loadTsModule("src/components/mdx/Gallery.tsx").default;
  const GalleryItem = loadTsModule("src/components/mdx/GalleryItem.tsx").default;

  const source = [
    "<Gallery>",
    '  <GalleryItem src="/blog/example/one.png" alt="First" caption="A caption" />',
    '  <GalleryItem src="/blog/example/two.png" alt="Second" />',
    "</Gallery>",
  ].join("\n");

  const element = await render.renderMdxToReact(source, { Gallery, GalleryItem });
  const html = renderToStaticMarkup(element);

  assert.equal(html.includes('src="/blog/example/one.png"'), true, `first item missing: ${html}`);
  assert.equal(html.includes('src="/blog/example/two.png"'), true, `second item missing: ${html}`);
  assert.equal(html.includes('alt="First"'), true, `alt text missing: ${html}`);
  assert.equal(html.includes("A caption"), true, `caption missing: ${html}`);
  // Two figures and two images, not one and not zero.
  assert.equal((html.match(/<img/g) ?? []).length, 2, `expected 2 images: ${html}`);
});

await test("authoring: GalleryItem is in the allow-list, so it is not unwrapped", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  assert.equal(
    render.MDX_ALLOWED_COMPONENTS.includes("GalleryItem"),
    true,
    "GalleryItem must be allow-listed or the scrub unwraps it and the gallery is empty"
  );
});

await test("authoring: an expression src on GalleryItem never evaluates and yields no image", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const React = await import("react");
  const Gallery = loadTsModule("src/components/mdx/Gallery.tsx").default;
  const GalleryItem = loadTsModule("src/components/mdx/GalleryItem.tsx").default;

  const marker = "gateAGalleryExprSentinel";
  delete globalThis[marker];

  const source = [
    "<Gallery>",
    `  <GalleryItem src={globalThis.${marker} = "/evil.png"} alt="Expression" />`,
    '  <GalleryItem src="/blog/example/ok.png" alt="Literal" />',
    "</Gallery>",
  ].join("\n");

  const element = await render.renderMdxToReact(source, { Gallery, GalleryItem });
  const html = renderToStaticMarkup(element);

  assert.equal(globalThis[marker], undefined, "the attribute expression executed");
  assert.equal(html.includes("evil.png"), false, `the expression leaked into output: ${html}`);
  // The literal sibling still renders: the expression is dropped, not the gallery.
  assert.equal(html.includes('src="/blog/example/ok.png"'), true, `literal item missing: ${html}`);
  assert.equal((html.match(/<img/g) ?? []).length, 1, `expected exactly 1 image: ${html}`);
});

await test("authoring: an empty gallery renders nothing rather than an empty grid", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const Gallery = loadTsModule("src/components/mdx/Gallery.tsx").default;
  const GalleryItem = loadTsModule("src/components/mdx/GalleryItem.tsx").default;

  const source = ["<Gallery>", "</Gallery>"].join("\n");
  const element = await render.renderMdxToReact(source, { Gallery, GalleryItem });
  const html = renderToStaticMarkup(element);
  assert.equal(html.trim(), "", `expected no output, got: ${html}`);
});

await test("authoring: an unknown block is unwrapped — content kept, element gone, no execution", async () => {
  const render = loadTsModule("src/lib/mdx-render.ts");
  const marker = "gateAUnknownBlockSentinel";
  delete globalThis[marker];

  // A block that is NOT allow-listed, with executable-looking content around it.
  const source = [
    `<Chart onLoad={globalThis.${marker} = "executed"}>`,
    "",
    "Unknown block inner text.",
    "",
    "</Chart>",
  ].join("\n");

  const html = await toHtml(render, source);
  assert.equal(globalThis[marker], undefined, "the unknown block executed");
  assert.equal(
    html.includes("Unknown block inner text."),
    true,
    `the unknown block's content should be kept: ${html}`
  );
  assert.equal(html.includes("<Chart"), false, `the unknown element should be gone: ${html}`);
});

console.log("");
console.log(`results: ${testCount - failCount}/${testCount} passed`);
if (failCount > 0) {
  for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL ${r.name}: ${r.error}`);
  process.exit(1);
}
process.exit(0);
