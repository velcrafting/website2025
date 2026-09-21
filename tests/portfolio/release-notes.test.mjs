// tests/portfolio/release-notes.test.mjs
//
// The version chip is authored text, so the file is trusted. What this guards is degradation: a
// malformed, empty or hostile release file must render NO chip rather than a broken page or an invented
// version. It also pins the committed file itself, so the chip can never show a version the deployment
// does not have.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const { readReleaseNotes } = loader.load("src/lib/release-notes.ts");

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

const committed = JSON.parse(
  readFileSync(new URL("../../src/lib/release-notes.json", import.meta.url), "utf8"),
);
const valid = { version: "2026.09", updated: "2026-09-16", notes: ["First note", "Second note"] };

// The module is loaded in a separate VM realm, so its arrays do not share a prototype with this file's
// and deepEqual fails on that alone. Compare structure instead — the values, not the realms.
const sameNotes = (actual, expected) =>
  assert.equal(JSON.stringify(Array.from(actual)), JSON.stringify(expected));

test("the committed release file is usable and renders a chip", () => {
  const result = readReleaseNotes(committed);
  assert.ok(result, "the committed file must produce a chip");
  assert.equal(result.version, committed.version);
});

test("the committed file's first note is the one shown as Latest", () => {
  const result = readReleaseNotes(committed);
  assert.equal(result.note, committed.notes[0]);
});

test("the committed notes are plain sentences, not internal jargon", () => {
  const result = readReleaseNotes(committed);
  const banned = ["Gate A", "Gate B", "Gate C", "milestone", "slice", "artifact", "S0", "S1"];
  for (const note of result.notes) {
    for (const word of banned) {
      assert.ok(
        !note.includes(word),
        `release note uses internal language "${word}": ${note}`,
      );
    }
  }
});

test("a valid file yields version, date, latest note and the bullet list", () => {
  const result = readReleaseNotes(valid);
  assert.equal(result.version, "2026.09");
  assert.equal(result.updated, "2026-09-16");
  assert.equal(result.note, "First note");
  sameNotes(result.notes, ["First note", "Second note"]);
});

test("a missing version renders no chip", () => {
  assert.equal(readReleaseNotes({ notes: ["x"] }), null);
});

test("a blank or whitespace-only version renders no chip", () => {
  assert.equal(readReleaseNotes({ version: "" }), null);
  assert.equal(readReleaseNotes({ version: "   " }), null);
});

test("a non-string version renders no chip", () => {
  assert.equal(readReleaseNotes({ version: 2026 }), null);
  assert.equal(readReleaseNotes({ version: null }), null);
});

test("an absurdly long version renders no chip", () => {
  assert.equal(readReleaseNotes({ version: "v".repeat(25) }), null);
});

test("a malformed date drops the date but keeps the chip", () => {
  const result = readReleaseNotes({ version: "1.0", updated: "16/09/2026", notes: ["n"] });
  assert.ok(result);
  assert.equal(result.updated, null);
});

test("a missing date is allowed and drops to null", () => {
  const result = readReleaseNotes({ version: "1.0", notes: ["n"] });
  assert.ok(result);
  assert.equal(result.updated, null);
});

test("notes that are not an array leave the chip with no note rather than failing", () => {
  const result = readReleaseNotes({ version: "1.0", notes: "one note" });
  assert.ok(result);
  assert.equal(result.note, null);
  sameNotes(result.notes, []);
});

test("non-string, empty and whitespace-only notes are dropped, not rendered", () => {
  const result = readReleaseNotes({
    version: "1.0",
    notes: ["real", "", "   ", 42, null, { text: "x" }, "also real"],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.notes)), ["real", "also real"]);
});

test("an over-long note is dropped rather than truncated into a misleading sentence", () => {
  const result = readReleaseNotes({ version: "1.0", notes: ["short", "x".repeat(201)] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.notes)), ["short"]);
});

test("the bullet list is capped so the chip cannot become a wall of text", () => {
  const result = readReleaseNotes({
    version: "1.0",
    notes: ["a", "b", "c", "d", "e", "f", "g"],
  });
  assert.equal(result.notes.length, 5);
  assert.equal(result.note, "a");
});

test("null, undefined and non-object input never throw", () => {
  assert.equal(readReleaseNotes(null), null);
  assert.equal(readReleaseNotes(undefined), null);
  assert.equal(readReleaseNotes("a string"), null);
  assert.equal(readReleaseNotes([]), null);
});

console.log(`\n${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log(`\nFAILED: ${failures.join(", ")}`);
  process.exit(1);
}
