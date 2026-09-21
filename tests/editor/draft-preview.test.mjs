// tests/editor/draft-preview.test.mjs
//
// The unsaved reader preview must render the COMPLETE output, and must do nothing else.
//
// Properties under test:
//
//   1. The output is the whole document — title, summary, byline, sources and the body — assembled
//      by the same shell the published reader uses, with the body from the same renderer that builds
//      a bundle's `web_html`. A preview with its own furniture, or its own body rendering, shows the
//      author something a save would not produce.
//   2. A block the picker is about to add keeps ONE identity between preview and save. Otherwise
//      each normalisation mints its own UUID, and the stored `data-block` and the revision hash move
//      for no reason of the author's making.
//   3. Trust comes from configuration, never from the request: a Host header (or a forwarded one) is
//      attacker-controllable, so `Host: evil.example` with `Origin: https://evil.example` must be
//      refused, as must a wrong scheme and a missing Origin.
//   4. The size bound applies to the bytes actually read, because Content-Length can be absent or
//      can lie.
//   5. It writes nothing: no repository import, no store, no revision, bundle or approval.
//
// Offline: the real route module through the project harness, with the session stubbed. This suite
// proves the route's logic; the REAL HTTP behaviour of a running app is proven separately with curl
// against the review target, because a stubbed session gate is not production auth.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createModuleLoader } from "./_module-loader.mjs";
import { loadRouteModule } from "./_transform.mjs";

const ROUTE = "src/app/api/editor/preview/draft/route.ts";
const ADMIN_KEY = "test-admin-key-xyz";
const ORIGIN = "http://127.0.0.1:3431";

let passed = 0;
const failures = [];

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ok    ${name}`);
    } catch (error) {
      failures.push(name);
      console.log(`  FAIL  ${name}\n        ${error.message}`);
    }
  })();
}

function loadRoute({ authorized = true } = {}) {
  return loadRouteModule(ROUTE, {
    env: authorized ? { ADMIN_KEY } : {},
    cookieStore: authorized ? new Map([["admin", ADMIN_KEY]]) : new Map(),
  });
}

/** A form request as the editor's panel makes it: multipart, carrying the editor's own Origin. */
function previewRequest(fields, { origin = ORIGIN, headers = {} } = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  const init = { method: "POST", body: fd, headers: { ...headers } };
  if (origin) init.headers.origin = origin;
  return new Request(`${ORIGIN}/api/editor/preview/draft`, init);
}

/** A body streamed in chunks, so there is no Content-Length for the route to trust. */
function streamingRequest(contentType, totalBytes, extraHeaders = {}) {
  const chunk = new Uint8Array(64 * 1024).fill(120);
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunk.byteLength, totalBytes - sent);
      sent += size;
      controller.enqueue(chunk.subarray(0, size));
    },
  });
  return new Request(`${ORIGIN}/api/editor/preview/draft`, {
    method: "POST",
    body: stream,
    duplex: "half",
    headers: { "content-type": contentType, origin: ORIGIN, ...extraHeaders },
  });
}

function paragraphForm(markdown, extra = {}) {
  return {
    blockCount: "1",
    "block.0.id": "blk_1",
    "block.0.heading": "",
    "block.0.markdown": markdown,
    title: "A packaging note",
    summary: "What I learned about packaging my work.",
    byline: "Steven Pajewski",
    ...extra,
  };
}

const loader = createModuleLoader();
const { normaliseBlocks, revisionContentHash } = loader.load("src/editor/validation/revision.ts");
const { renderBlocksToHtml } = loader.load("src/editor/render/bundle.ts");

console.log("\nunsaved preview: the complete output");

await test("renders title, summary and byline around the body, not just the body", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(previewRequest(paragraphForm("Hello there.")));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.html, /<h1 class="measure-prose[^"]*">A packaging note<\/h1>/);
  assert.match(body.html, /What I learned about packaging my work\./);
  assert.match(body.html, /Steven Pajewski/);
  assert.match(body.html, /<p>Hello there\.<\/p>/);
});

await test("an edit to the title or summary is reflected", async () => {
  const route = loadRoute();
  const first = await (
    await route.exports.POST(previewRequest(paragraphForm("Body.")))
  ).json();
  const second = await (
    await route.exports.POST(
      previewRequest(
        paragraphForm("Body.", {
          title: "A DIFFERENT title",
          summary: "A DIFFERENT summary.",
        }),
      ),
    )
  ).json();
  assert.ok(!first.html.includes("A DIFFERENT title"));
  assert.match(second.html, /A DIFFERENT title/);
  assert.match(second.html, /A DIFFERENT summary\./);
});

await test("stored sources are shown, and only http(s) ones become links", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    previewRequest(
      paragraphForm("Body.", {
        previewSources: JSON.stringify([
          { title: "A real paper", url: "https://example.org/paper", provider: "arxiv" },
          { title: "Not a link", url: "javascript:alert(1)", provider: "x" },
        ]),
      }),
    ),
  );
  const body = await response.json();
  assert.equal(body.sourceCount, 1, "the non-http source must be dropped");
  assert.match(body.html, /<a href="https:\/\/example\.org\/paper">A real paper<\/a>/);
  assert.ok(!body.html.includes("javascript:"), "a non-http destination must never become an href");
});

await test("the body is the sanctioned renderer's output, inside the shared shell", async () => {
  const route = loadRoute();
  const body = await (await route.exports.POST(previewRequest(paragraphForm("Same bytes.")))).json();
  const expectedBody = renderBlocksToHtml(
    normaliseBlocks([{ id: "blk_1", heading: "", markdown: "Same bytes.", origin: "human" }]),
  );
  assert.ok(
    body.html.includes(expectedBody),
    "the preview body must be the renderer's output, not a second implementation",
  );
  assert.match(body.rendererVersion, /^gate-b-renderer\//);
});

await test("the live draft is labelled preview-only and claims no revision hash", async () => {
  const route = loadRoute();
  const body = await (await route.exports.POST(previewRequest(paragraphForm("Body.")))).json();
  assert.match(body.html, /Preview only — not published/);
  assert.ok(
    !(await /data-revision=/.test(body.html)),
    "a live draft has no revision hash and must not claim one the way saved output does",
  );
  // The saved/unsaved distinction belongs to the panel's state line, so the notice must not
  // contradict it by also declaring the draft unsaved.
  assert.ok(
    !(await /not saved/i.test(body.html)),
    "the notice must not say 'not saved' while the panel says it matches the saved revision",
  );
});

await test("a figure renders as a figure, not as a dropped block", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    previewRequest({
      blockCount: "1",
      "block.0.id": "blk_fig",
      "block.0.kind": "figure",
      "block.0.src": "/projects/example/hero.png",
      "block.0.alt": "The dashboard",
      "block.0.caption": "Shipped",
      "block.0.markdown": "",
      title: "T",
    }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.html, /<figure><img src="\/projects\/example\/hero\.png" alt="The dashboard"/);
  assert.match(body.html, /<figcaption>Shipped<\/figcaption>/);
});

console.log("\nunsaved preview: one identity for a pending block");

await test("a NEW figure keeps the picker's identity, which is what the save will store", async () => {
  const route = loadRoute();
  const stableId = "blk_new_11111111-2222-3333-4444-555555555555";
  const preview = await (
    await route.exports.POST(
      previewRequest({
        blockCount: "0",
        newKind: "figure",
        newId: stableId,
        newSrc: "/projects/example/hero.png",
        newAlt: "The dashboard",
        newCaption: "Shipped",
        title: "T",
      }),
    )
  ).json();
  assert.match(
    preview.html,
    new RegExp(`data-block="${stableId}"`),
    "the preview must carry the picker's identity, not one it minted itself",
  );

  // The same identity submitted through the save path produces the same block and the same hash.
  const blocksForSave = normaliseBlocks([
    {
      id: stableId,
      kind: "figure",
      data: { src: "/projects/example/hero.png", alt: "The dashboard", caption: "Shipped" },
      markdown: "",
      origin: "human",
    },
  ]);
  assert.equal(blocksForSave[0].id, stableId);
  assert.match(
    revisionContentHash({ title: "T", blocks: blocksForSave }),
    /^[0-9a-f]{64}$/,
    "the saved revision hash is computed from the same identity the preview showed",
  );
});

await test("a NEW callout is previewed with its tone and carries its identity", async () => {
  const route = loadRoute();
  const stableId = "blk_new_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const preview = await (
    await route.exports.POST(
      previewRequest({
        blockCount: "0",
        newKind: "callout",
        newId: stableId,
        newTone: "warning",
        newTitle: "Careful",
        newMarkdown: "Read this first.",
        title: "T",
      }),
    )
  ).json();
  assert.equal(preview.blockCount, 1);
  assert.match(preview.html, new RegExp(`data-block="${stableId}"`));
  assert.match(preview.html, /<aside class="callout" data-tone="warning">/);
});

await test("two different minted identities are two different revisions", async () => {
  // Which is exactly why the identity has to come from the form rather than from each normalisation.
  const figure = (id) =>
    normaliseBlocks([
      {
        id,
        kind: "figure",
        data: { src: "/a/b.png", alt: "alt" },
        markdown: "",
        origin: "human",
      },
    ]);
  assert.notEqual(
    revisionContentHash({ title: "T", blocks: figure("blk_new_one") }),
    revisionContentHash({ title: "T", blocks: figure("blk_new_two") }),
  );
});

console.log("\nunsaved preview: trust comes from configuration");

await test("a forged Host with a matching cross-site Origin is refused", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    previewRequest(paragraphForm("Private."), {
      origin: "https://evil.example",
      headers: { host: "evil.example", "x-forwarded-host": "evil.example" },
    }),
  );
  assert.equal(response.status, 403, "a Host header must not be able to grant trust");
});

await test("a wrong scheme is refused even on a loopback host", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    previewRequest(paragraphForm("Private."), { origin: "https://127.0.0.1:3431" }),
  );
  assert.equal(response.status, 403);
});

await test("a missing Origin is refused", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    previewRequest(paragraphForm("Private."), { origin: null }),
  );
  assert.equal(response.status, 403);
});

await test("the editor's own loopback origin is accepted", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(previewRequest(paragraphForm("Mine.")));
  assert.equal(response.status, 200);
});

await test("a configured origin list replaces the loopback default", async () => {
  const route = loadRouteModule(ROUTE, {
    env: { ADMIN_KEY, EDITOR_PREVIEW_ORIGINS: "https://studio.example" },
    cookieStore: new Map([["admin", ADMIN_KEY]]),
  });
  const refused = await route.exports.POST(previewRequest(paragraphForm("x")));
  assert.equal(refused.status, 403, "loopback must not be trusted when a list is configured");
  const allowed = await route.exports.POST(
    previewRequest(paragraphForm("x"), { origin: "https://studio.example" }),
  );
  assert.equal(allowed.status, 200);
});

console.log("\nunsaved preview: the size bound uses real bytes");

await test("an oversized body with NO Content-Length is refused", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    streamingRequest("multipart/form-data; boundary=xyz", 600 * 1024),
  );
  assert.equal(response.status, 413, "the bound must apply to the bytes read, not to a header");
});

await test("an oversized body claiming a small Content-Length is refused", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    streamingRequest("multipart/form-data; boundary=xyz", 600 * 1024, { "content-length": "128" }),
  );
  assert.equal(response.status, 413);
});

await test("a body within the bound is accepted", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(previewRequest(paragraphForm("Small.")));
  assert.equal(response.status, 200);
});

console.log("\nunsaved preview: refuses what it should, writes nothing");

await test("an unauthorized request is refused and renders nothing", async () => {
  const route = loadRoute({ authorized: false });
  const response = await route.exports.POST(previewRequest(paragraphForm("Private.")));
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.html, undefined);
  assert.match(body.error, /Not authorized/);
});

await test("a validation failure returns the validator's reason, not a generic error", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(
    previewRequest({
      blockCount: "1",
      "block.0.id": "blk_bad",
      "block.0.kind": "figure",
      "block.0.src": "/%2e%2e/secret",
      "block.0.alt": "nope",
      "block.0.markdown": "",
      title: "T",
    }),
  );
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /plain local path/);
});

await test("an empty block is refused rather than previewed as nothing", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(previewRequest(paragraphForm("   ")));
  assert.equal(response.status, 422);
});

await test("the route module has no write path to import", async () => {
  const source = readFileSync(join(loader.repo, ROUTE), "utf8");
  // Only module specifiers are inspected: the file's comments deliberately discuss *not* writing.
  const specifiers = Array.from(source.matchAll(/from\s+"([^"]+)"/g)).map((match) => match[1]);
  for (const specifier of specifiers) {
    assert.ok(
      !(await /repository|editor\/service|editor\/api/.test(specifier)),
      `the preview route imports ${specifier}; a preview must not be able to persist anything`,
    );
  }
  for (const name of [
    "openEditorStore",
    "insertRevision",
    "insertBundle",
    "saveIssueRevision",
    "approveRevision",
    "commitWebsitePublication",
  ]) {
    assert.ok(!source.includes(name), `the preview route mentions ${name}`);
  }
});

await test("the response is private and never cached", async () => {
  const route = loadRoute();
  const response = await route.exports.POST(previewRequest(paragraphForm("Nothing stored.")));
  assert.equal(response.status, 200);
  assert.match((await response.headers.get("cache-control")) ?? "", /no-store/);
  assert.equal((await response.headers.get("x-robots-tag")), "noindex, nofollow");
});

console.log(
  `\nunsaved preview: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
