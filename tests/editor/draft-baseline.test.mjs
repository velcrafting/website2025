// tests/editor/draft-baseline.test.mjs
//
// The canonical saved-draft snapshot: the one thing that decides whether the editor says
// "matches the saved revision" or "unsaved changes".
//
// Focused on the parts that can be checked without a browser:
//
//   - The server-side snapshot (from the stored revision) is deterministic and sensitive to every
//     persisted field. If it missed a field, an author could change that field and still be told
//     nothing had changed.
//   - A legacy block — one stored before kinds existed — snapshots with the SAME derived kind the
//     editor's selector shows, which is what makes the saved baseline comparable to the live form.
//   - The content-control rule keeps controls that are not writing out of the comparison: the
//     picker's search box, unnamed controls, the `$ACTION` plumbing and the baseline field itself.
//
// The live form reader is exercised in the browser against the real editor, because a form is a DOM
// object and a stub of one would only prove the stub.

import { strict as assert } from "node:assert";

import { createModuleLoader } from "./_module-loader.mjs";

const loader = createModuleLoader();
const { canonicalSnapshot, snapshotFromRevision, isContentControl } = loader.load(
  "src/editor/forms/draft-baseline.ts",
);

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

const REVISION = {
  title: "Shipping a small tool",
  summary: "What I learned",
  byline: "Steven Pajewski",
  blocks: [
    {
      id: "blk_a",
      heading: "How I package a project",
      markdown: "One paragraph.\n\nA second paragraph.",
      humanLocked: true,
      data: undefined,
    },
    {
      id: "blk_fig",
      kind: "figure",
      heading: "",
      markdown: "",
      humanLocked: false,
      data: { src: "/projects/x/hero.png", alt: "The dashboard", caption: "Shipped" },
    },
  ],
};

const baseline = () => snapshotFromRevision(REVISION);

console.log("\nsaved-draft snapshot: deterministic and sensitive");

test("the same revision snapshots identically every time", () => {
  assert.equal(baseline(), baseline());
  assert.equal(baseline(), snapshotFromRevision(structuredClone(REVISION)));
});

test("a different title, summary or byline is a different snapshot", () => {
  assert.notEqual(baseline(), snapshotFromRevision({ ...REVISION, title: "Other" }));
  assert.notEqual(baseline(), snapshotFromRevision({ ...REVISION, summary: "Other" }));
  assert.notEqual(baseline(), snapshotFromRevision({ ...REVISION, byline: "Other" }));
});

test("editing block text, a heading or the locked flag is a different snapshot", () => {
  const edit = (blockIndex, patch) =>
    snapshotFromRevision({
      ...REVISION,
      blocks: REVISION.blocks.map((block, index) =>
        index === blockIndex ? { ...block, ...patch } : block,
      ),
    });
  assert.notEqual(baseline(), edit(0, { markdown: "One paragraph." }));
  assert.notEqual(baseline(), edit(0, { heading: "Other heading" }));
  assert.notEqual(baseline(), edit(0, { humanLocked: false }));
});

test("editing a figure's asset, alt or caption is a different snapshot", () => {
  const edit = (data) =>
    snapshotFromRevision({
      ...REVISION,
      blocks: REVISION.blocks.map((block, index) =>
        index === 1 ? { ...block, data: { ...block.data, ...data } } : block,
      ),
    });
  assert.notEqual(baseline(), edit({ src: "/projects/x/other.png" }));
  assert.notEqual(baseline(), edit({ alt: "Other" }));
  assert.notEqual(baseline(), edit({ caption: "Other" }));
});

test("adding, removing or reordering blocks is a different snapshot", () => {
  const [first, second] = REVISION.blocks;
  assert.notEqual(baseline(), snapshotFromRevision({ ...REVISION, blocks: [first] }));
  assert.notEqual(baseline(), snapshotFromRevision({ ...REVISION, blocks: [first, second, first] }));
  assert.notEqual(baseline(), snapshotFromRevision({ ...REVISION, blocks: [second, first] }));
});

test("CRLF and lone CR read the same as LF, so transport is not an edit", () => {
  const crlf = snapshotFromRevision({
    ...REVISION,
    blocks: REVISION.blocks.map((block, index) =>
      index === 0 ? { ...block, markdown: "One paragraph.\r\n\r\nA second paragraph." } : block,
    ),
  });
  assert.equal(crlf, baseline());
});

test("a legacy block snapshots with the derived kind its selector shows", () => {
  const legacyHeading = snapshotFromRevision({
    title: "T",
    blocks: [{ id: "b", heading: "A heading", markdown: "Body." }],
  });
  const explicitHeading = snapshotFromRevision({
    title: "T",
    blocks: [{ id: "b", kind: "heading", heading: "A heading", markdown: "Body." }],
  });
  assert.equal(
    legacyHeading,
    explicitHeading,
    "a legacy block and the same block with its kind chosen explicitly must not differ",
  );

  const legacyParagraph = snapshotFromRevision({
    title: "T",
    blocks: [{ id: "b", heading: "", markdown: "Body." }],
  });
  assert.notEqual(legacyParagraph, legacyHeading);
});

test("a draft with no pending block matches the empty pending shape", () => {
  // The server baseline has no pending block; the client renders one that is empty until the picker
  // chooses a kind. They must serialise identically or every page load would read as dirty.
  const serverSide = canonicalSnapshot({
    title: "T",
    summary: "",
    byline: "",
    blocks: [],
    pending: {},
  });
  const clientSideEqualTo = JSON.stringify({
    title: "T",
    summary: "",
    byline: "",
    blocks: [],
    pending: {
      id: "",
      kind: "",
      heading: "",
      markdown: "",
      locked: false,
      tone: "",
      title: "",
      src: "",
      alt: "",
      caption: "",
    },
  });
  assert.equal(serverSide, clientSideEqualTo);
});

console.log("\nsaved-draft snapshot: which controls count as writing");

function fakeElement(properties) {
  return { dataset: {}, ...properties };
}

test("the picker's search box and unnamed controls are not content", () => {
  const search = Object.assign(new Object(), fakeElement({ name: "", type: "search" }));
  assert.equal(isContentControl(search), false);
  assert.equal(isContentControl(fakeElement({ name: "", type: "text" })), false);
});

test("the server's own fields are not the author's writing", () => {
  assert.equal(isContentControl(fakeElement({ name: "__savedDraft", type: "hidden" })), false);
  assert.equal(isContentControl(fakeElement({ name: "$ACTION_ID_abc", type: "hidden" })), false);
  assert.equal(
    isContentControl(fakeElement({ name: "previewSources", type: "hidden", dataset: { notContent: "true" } })),
    false,
  );
});

test("a named writing control is content", () => {
  assert.equal(isContentControl(fakeElement({ name: "block.0.markdown", type: "textarea" })), true);
  assert.equal(isContentControl(fakeElement({ name: "title", type: "text" })), true);
  assert.equal(isContentControl(fakeElement({ name: "newKind", type: "hidden" })), true);
  assert.equal(isContentControl(null), false);
});

console.log("\nsaved-draft snapshot: whitespace parity with the save path");

test("surrounding whitespace in the title, summary or byline is not a change", () => {
  // The save path trims these before storing, so a trailing space persists nothing different.
  assert.equal(snapshotFromRevision({ ...REVISION, title: "  Shipping a small tool  " }), baseline());
  assert.equal(snapshotFromRevision({ ...REVISION, summary: " What I learned " }), baseline());
  assert.equal(snapshotFromRevision({ ...REVISION, byline: "\tSteven Pajewski\n" }), baseline());
});

test("surrounding whitespace in a heading is not a change", () => {
  const padded = snapshotFromRevision({
    ...REVISION,
    blocks: REVISION.blocks.map((block, index) =>
      index === 0 ? { ...block, heading: "  How I package a project  " } : block,
    ),
  });
  assert.equal(padded, baseline(), "a heading is validated through a trim, so padding persists nothing");
});

test("surrounding whitespace in a kind-specific field is not a change", () => {
  const padded = snapshotFromRevision({
    ...REVISION,
    blocks: REVISION.blocks.map((block, index) =>
      index === 1
        ? {
            ...block,
            data: {
              src: "  /projects/x/hero.png  ",
              alt: " The dashboard ",
              caption: " Shipped\t",
            },
          }
        : block,
    ),
  });
  assert.equal(padded, baseline());
});

test("a callout's tone and title are trimmed the same way", () => {
  const withTone = (tone, title) =>
    snapshotFromRevision({
      title: "T",
      blocks: [
        {
          id: "b",
          kind: "callout",
          heading: "",
          markdown: "Body.",
          data: { tone, title },
        },
      ],
    });
  assert.equal(withTone(" tip ", "  Why  "), withTone("tip", "Why"));
});

test("MARKDOWN is never trimmed: padding and blank lines are real changes", () => {
  const edit = (markdown) =>
    snapshotFromRevision({
      ...REVISION,
      blocks: REVISION.blocks.map((block, index) =>
        index === 0 ? { ...block, markdown } : block,
      ),
    });
  assert.notEqual(edit(" One paragraph.\n\nA second paragraph."), baseline());
  assert.notEqual(edit("One paragraph.\n\nA second paragraph. "), baseline());
  assert.notEqual(edit("One paragraph.\n\nA second paragraph.\n"), baseline());
  assert.notEqual(edit("One paragraph.\n\n\nA second paragraph."), baseline());
});

test("internal whitespace is not collapsed, because the save path does not collapse it", () => {
  assert.notEqual(snapshotFromRevision({ ...REVISION, title: "Shipping  a small tool" }), baseline());
  assert.notEqual(snapshotFromRevision({ ...REVISION, title: "Shipping\ta small tool" }), baseline());
});

test("an empty summary and an absent summary are the same draft", () => {
  assert.equal(
    snapshotFromRevision({ ...REVISION, summary: "" }),
    snapshotFromRevision({ ...REVISION, summary: null }),
  );
  assert.equal(
    snapshotFromRevision({ ...REVISION, summary: "   " }),
    snapshotFromRevision({ ...REVISION, summary: null }),
  );
});

console.log(
  `\ndraft baseline: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
