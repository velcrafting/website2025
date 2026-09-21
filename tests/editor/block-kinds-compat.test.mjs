// tests/editor/block-kinds-compat.test.mjs
//
// Regression harness for the block-kind compatibility contract. Three properties, each of
// which the first block-kind pass got wrong:
//
//   1. A no-op re-save of unchanged legacy text reproduces the ORIGINAL content hash. An
//      approval binds that hash, so a change in bookkeeping must not invalidate it. The
//      first pass attached `kind`/`data`/`blockSchemaVersion` to every normalised block,
//      which silently moved a legacy revision's identity on save.
//   2. An asset path that would have to be decoded before we can tell where it points is
//      refused. `/%2e%2e/secret` and `/%2F%2Fevil.example/x` were accepted because the
//      checks looked for literal `..`, `//` and `:` instead of canonical form.
//   3. Both readers serve the bundle's own output instead of re-rendering blocks inline,
//      which dropped figure and callout content that the renderer had produced.
//
// Offline: real source modules through the project loader. No server, no database, no
// network. Fixtures are synthetic; `REAL` blocks are what a pre-kind revision stored.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createModuleLoader } from "./_module-loader.mjs";

const loader = createModuleLoader();
const { normaliseBlocks, revisionContentHash } = loader.load("src/editor/validation/revision.ts");
const { renderBlocksToHtml, renderBlocksToText } = loader.load("src/editor/render/bundle.ts");

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

/** Assert the call is rejected by validation (not by some unrelated crash). */
function rejects(fn, why) {
  let threw = null;
  try {
    fn();
  } catch (error) {
    threw = error;
  }
  if (!threw) assert.fail(`expected ${why} to be refused, but it was accepted`);
  assert.equal(threw.code, "VALIDATION_FAILED", `expected VALIDATION_FAILED for ${why}, got ${threw.code}`);
}

// A revision written before block kinds existed: no `kind`, no `data`, no version. This is
// exactly the shape stored in the blocks column for an old revision.
const LEGACY_BLOCKS = [
  {
    id: "blk_legacy_a",
    section: "none",
    heading: "How I package a project",
    markdown: "One paragraph.\n\nA second paragraph.",
    humanLocked: true,
    origin: "human",
    claims: [],
    linkedArticleRevisionId: null,
    publicPermissionRecordIds: [],
  },
  {
    id: "blk_legacy_b",
    section: "none",
    heading: "",
    markdown: "Closing thoughts.",
    humanLocked: false,
    origin: "human",
    claims: [],
    linkedArticleRevisionId: null,
    publicPermissionRecordIds: [],
  },
];

const legacyContent = {
  title: "Legacy issue",
  summary: null,
  byline: null,
  blocks: LEGACY_BLOCKS,
  sourceVersionIds: [],
  assetIds: [],
};

// The identity an approval was bound to before kinds existed. Computed here from the stored
// blocks themselves, so this test fails loudly if the hash function starts covering more.
const ORIGINAL_HASH = revisionContentHash(legacyContent);

const clone = (blocks) => blocks.map((block) => ({ ...block }));

console.log("\nblock kinds: legacy identity compatibility");

check("a re-save of unchanged legacy text reproduces the original hash", () => {
  const resaved = normaliseBlocks(clone(LEGACY_BLOCKS));
  const after = revisionContentHash({ ...legacyContent, blocks: resaved });
  assert.equal(
    after,
    ORIGINAL_HASH,
    "a no-op save moved the content hash, which would invalidate an approval over unchanged words",
  );
});

check("normalising an already-normalised legacy revision is a fixed point", () => {
  const once = normaliseBlocks(clone(LEGACY_BLOCKS));
  const twice = normaliseBlocks(once);
  assert.equal(revisionContentHash({ ...legacyContent, blocks: twice }), ORIGINAL_HASH);
});

check("the editor submitting the implied kind is still a no-op for identity", () => {
  // The editor's kind selector submits a kind for every block. Choosing the kind a legacy
  // block already implies cannot change how it renders, so it must not change identity.
  const submitted = clone(LEGACY_BLOCKS).map((block) => ({
    ...block,
    kind: block.heading.trim() ? "heading" : "paragraph",
  }));
  const after = revisionContentHash({ ...legacyContent, blocks: normaliseBlocks(submitted) });
  assert.equal(after, ORIGINAL_HASH);
});

check("a legacy block gains no kind payload it did not have", () => {
  const [first] = normaliseBlocks(clone(LEGACY_BLOCKS));
  assert.equal(first.kind, undefined, "a plain legacy block must not acquire a kind");
  assert.equal(first.data, undefined, "a plain legacy block must not acquire a payload");
  assert.equal(first.blockSchemaVersion, undefined);
});

check("a genuinely new kind is still detected as a change", () => {
  const blocks = normaliseBlocks([
    ...clone(LEGACY_BLOCKS),
    {
      kind: "figure",
      data: { src: "/projects/example/hero.png", alt: "The dashboard" },
      markdown: "",
      origin: "human",
    },
  ]);
  assert.notEqual(revisionContentHash({ ...legacyContent, blocks }), ORIGINAL_HASH);
});

check("editing a figure caption is still detected as a change", () => {
  const picture = (caption) =>
    normaliseBlocks([
      {
        kind: "figure",
        data: { src: "/projects/example/hero.png", alt: "The dashboard", caption },
        markdown: "",
        origin: "human",
      },
    ]);
  assert.notEqual(
    revisionContentHash({ ...legacyContent, blocks: picture("Before") }),
    revisionContentHash({ ...legacyContent, blocks: picture("After") }),
  );
});

check("a heading block whose text lives in markdown keeps its explicit kind", () => {
  // `heading` with an empty heading field is NOT what the legacy shape implies, so the
  // kind must be stored for the reader to render an h2.
  const [block] = normaliseBlocks([
    { kind: "heading", heading: "", markdown: "A title line", origin: "human" },
  ]);
  assert.equal(block.kind, "heading");
});

console.log("\nblock kinds: asset path containment");

const figureWith = (src) => () =>
  normaliseBlocks([{ kind: "figure", data: { src, alt: "alt text" }, markdown: "", origin: "human" }]);

check("/%2e%2e/secret is refused (encoded parent segment)", () => {
  rejects(figureWith("/%2e%2e/secret"), "an encoded traversal path");
});

check("/%2F%2Fevil.example/x is refused (encoded protocol-relative)", () => {
  rejects(figureWith("/%2F%2Fevil.example/x"), "an encoded protocol-relative path");
});

check("//evil.example/x is refused (protocol-relative)", () => {
  rejects(figureWith("//evil.example/x"), "a protocol-relative path");
});

check("https://evil.example/x is refused (scheme)", () => {
  rejects(figureWith("https://evil.example/x"), "an absolute remote URL");
});

check("/a/../b.png is refused (literal traversal)", () => {
  rejects(figureWith("/a/../b.png"), "a literal parent segment");
});

check("/a//b.png is refused (empty segment)", () => {
  rejects(figureWith("/a//b.png"), "an empty segment");
});

check("/a/./b.png is refused (current-directory segment)", () => {
  rejects(figureWith("/a/./b.png"), "a current-directory segment");
});

check("/a/ is refused (empty trailing segment)", () => {
  rejects(figureWith("/a/"), "a trailing slash");
});

check("a data: URI is refused", () => {
  rejects(figureWith("data:image/svg+xml;base64,AAAA"), "an inline data URI");
});

check("a backslash path is refused", () => {
  rejects(figureWith("/a\\b.png"), "a backslash path");
});

check("a query string is refused", () => {
  rejects(figureWith("/a/b.png?v=2"), "a query string");
});

check("a plain local asset path is accepted", () => {
  const [block] = normaliseBlocks([
    { kind: "figure", data: { src: "/projects/example/hero.png", alt: "alt" }, markdown: "", origin: "human" },
  ]);
  assert.equal(block.data.src, "/projects/example/hero.png");
});

check("an underscore/dash/dot path is accepted", () => {
  const [block] = normaliseBlocks([
    {
      kind: "figure",
      data: { src: "/_verify/render-probe/one-two.three.svg", alt: "alt" },
      markdown: "",
      origin: "human",
    },
  ]);
  assert.equal(block.data.src, "/_verify/render-probe/one-two.three.svg");
});

console.log("\nblock kinds: schema version");

check("an unsupported block schema version is refused", () => {
  rejects(
    () => normaliseBlocks([{ ...clone(LEGACY_BLOCKS)[1], blockSchemaVersion: 2 }]),
    "a future block schema version",
  );
});

check("schema version 1 is accepted", () => {
  const [block] = normaliseBlocks([{ ...clone(LEGACY_BLOCKS)[1], blockSchemaVersion: 1 }]);
  assert.equal(block.markdown, "Closing thoughts.");
});

console.log("\nblock kinds: reader parity");

const READERS = [
  "src/app/issues/[slug]/page.tsx",
  "src/app/admin/editor/preview/[revisionId]/route.ts",
];

check("both readers serve the bundle output rather than re-rendering blocks inline", () => {
  for (const relative of READERS) {
    const source = readFileSync(join(loader.repo, relative), "utf8");
    assert.ok(
      !source.includes("paragraphsOf("),
      `${relative} still renders paragraphs itself, so figure and callout content would be dropped`,
    );
    assert.ok(
      source.includes("web_html"),
      `${relative} does not serve the rendered bundle output`,
    );
  }
});

check("the sanctioned renderer emits figure and callout markup", () => {
  const html = renderBlocksToHtml(
    normaliseBlocks([
      { kind: "figure", data: { src: "/projects/x/hero.png", alt: "Hero", caption: "Shipped" }, markdown: "", origin: "human" },
      { kind: "callout", data: { tone: "tip", title: "Why" }, markdown: "Because it helps.", origin: "human" },
    ]),
  );
  assert.match(html, /<figure><img src="\/projects\/x\/hero\.png" alt="Hero" loading="lazy" \/><figcaption>Shipped<\/figcaption><\/figure>/);
  assert.match(html, /<aside class="callout" data-tone="tip">/);
  assert.match(html, /<p class="callout-label">Tip<\/p>/);
});

check("the text projection keeps a figure's meaning", () => {
  const blocks = normaliseBlocks([
    { kind: "figure", data: { src: "/projects/x/hero.png", alt: "Hero", caption: "Shipped" }, markdown: "", origin: "human" },
  ]);
  assert.match(renderBlocksToText(blocks), /\[Figure: Shipped\]/);
});

console.log(
  `\nblock-kinds compat: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
