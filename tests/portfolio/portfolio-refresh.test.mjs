// tests/portfolio/portfolio-refresh.test.mjs
//
// FIXTURE PROOF — not live proof.
//
// Every fetch here is injected, so the cache window, the failure classes and the cold start are
// exercised deterministically against controlled public-data fixtures. The live metadata read for this
// slice is blocked pending consent; nothing in this file claims anything about real GitHub responses.
//
// What it does establish:
//
//   - the daily window is requested on every read;
//   - a transient or partial failure keeps last-good and NEVER empties the portfolio;
//   - the snapshot is labelled as a snapshot, never as fresh;
//   - a confirmed 404 is a removal, and a transient error never is;
//   - an entry whose public status cannot be established is withheld from new cards and recorded,
//     rather than published or dropped;
//   - editorial cards the READMEs exclude survive.

import { strict as assert } from "node:assert";

import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const { readReadmeIndexes, readRepoMetadata, DAILY_REVALIDATE_SECONDS, README_URLS } = loader.load(
  "src/lib/github/portfolio-source.ts",
);
const { buildPortfolioView, removalPolicy } = loader.load("src/lib/portfolio-view.ts");

let passed = 0;
const failures = [];

function test(name, fn) {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ok    ${name}`);
    } catch (error) {
      failures.push(name);
      console.log(`  FAIL  ${name}\n        ${error.message}`);
    }
  };
  return run();
}

/** Structural comparison: values cross the harness VM boundary, so prototypes differ. */
function sameJson(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

const PERSONAL_MD = [
  "## Current Focus",
  "- [VelDesk](https://github.com/Vel-Labs/VelDesk)",
  "## Start Here",
  "- [vel-mcp](https://github.com/Vel-Labs/vel-mcp)",
  "## Elsewhere",
  "- [Hidden](https://github.com/Vel-Labs/should-not-be-read)",
].join("\n");

const ORG_MD = [
  "## What We Build",
  "- [CareSight](https://github.com/Vel-Labs/CareSight)",
  "## Recommended Pins",
  "- [thc-leaderboard](https://github.com/Vel-Labs/thc-leaderboard)",
].join("\n");

function metadataBody(overrides = {}) {
  return JSON.stringify({
    private: false,
    archived: false,
    language: "TypeScript",
    topics: ["agents"],
    pushed_at: "2026-09-01T00:00:00Z",
    html_url: "https://github.com/Vel-Labs/x",
    ...overrides,
  });
}

/** A deterministic injected fetch. `routes` maps a URL to a response (or a throw). */
function makeFetch(routes) {
  const calls = [];
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, revalidate: init?.next?.revalidate });
      const route = routes[url] ?? routes["*"];
      if (!route) return { ok: false, status: 404, text: async () => "Not Found" };
      if (route.throws) throw new Error(route.throws);
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        text: async () => route.body ?? "",
      };
    },
  };
}

const EDITORIAL = [
  { owner: "Vel-Labs", repo: "site-only-thing", url: "https://github.com/Vel-Labs/site-only-thing", label: "Site-only writeup", lane: "agent-workbenches" },
];

console.log("\nportfolio refresh: the daily window");

await test("every read asks for the daily revalidation window", async () => {
  const fetch = makeFetch({
    [README_URLS.personal]: { status: 200, body: PERSONAL_MD },
    [README_URLS.org]: { status: 200, body: ORG_MD },
  });
  await readReadmeIndexes(fetch.impl);
  assert.ok(fetch.calls.length >= 2, "both indexes are read");
  for (const call of fetch.calls) {
    assert.equal(call.revalidate, DAILY_REVALIDATE_SECONDS, `${call.url} must carry the daily window`);
  }
  assert.equal(DAILY_REVALIDATE_SECONDS, 86400);
});

console.log("\nportfolio refresh: live read, then degradation");

await test("a complete live read produces live cards with factual metadata", async () => {
  const fetch = makeFetch({
    [README_URLS.personal]: { status: 200, body: PERSONAL_MD },
    [README_URLS.org]: { status: 200, body: ORG_MD },
    "*": { status: 200, body: metadataBody() },
  });
  const readme = await readReadmeIndexes(fetch.impl);
  const metadata = await readRepoMetadata(
    [{ owner: "Vel-Labs", repo: "VelDesk" }, { owner: "Vel-Labs", repo: "CareSight" }],
    fetch.impl,
  );
  const view = buildPortfolioView({
    readmeEntries: readme.extractions.flatMap((entry) => entry.entries),
    readmeComplete: readme.complete,
    metadata,
    editorial: EDITORIAL,
  });
  const repos = view.cards.map((card) => card.repo);
  assert.ok(repos.includes("VelDesk") && repos.includes("CareSight"), "README inclusion applies");
  assert.ok(!repos.includes("should-not-be-read"), "Elsewhere is never read");
  assert.equal(view.source, "live");
  const veldesk = view.cards.find((card) => card.repo === "VelDesk");
  assert.equal(veldesk.language, "TypeScript");
  sameJson(veldesk.topics, ["agents"]);
  assert.equal(veldesk.pushedAt, "2026-09-01T00:00:00Z");
});

await test("a TRANSIENT failure keeps last-good and never empties the list", async () => {
  const fetch = makeFetch({
    [README_URLS.personal]: { status: 500, body: "" },
    [README_URLS.org]: { status: 500, body: "" },
    "*": { status: 500, body: "" },
  });
  const readme = await readReadmeIndexes(fetch.impl);
  assert.equal(readme.complete, false);
  sameJson(readme.extractions, [], "a failed read contributes no entries");

  const view = buildPortfolioView({
    readmeEntries: [],
    readmeComplete: false,
    metadata: { byRepo: {}, unknown: [], unavailable: [], complete: false },
    editorial: EDITORIAL,
  });
  assert.ok(view.cards.length > 0, "the portfolio must never be empty after a failure");
  assert.equal(view.source, "snapshot");
});

await test("the snapshot is labelled as a snapshot, never as fresh", async () => {
  const view = buildPortfolioView({
    readmeEntries: [],
    readmeComplete: false,
    metadata: { byRepo: {}, unknown: [], unavailable: [], complete: false },
    editorial: [],
  });
  assert.match(
    view.freshness,
    /committed baseline/i,
    "the snapshot state must name the committed baseline as its source",
  );
  assert.match(
    view.freshness,
    /last successful committed read \d{4}-\d{2}-\d{2}/,
    "the snapshot state must carry the age of the last successful committed read",
  );
  assert.match(
    view.freshness,
    /not a live refresh/i,
    "the snapshot must say plainly that it is not a live refresh",
  );
  assert.ok(
    !/\bfresh\b/i.test(view.freshness),
    `the snapshot must never claim freshness: ${view.freshness}`,
  );
});

await test("a PARTIAL read serves what it got and says it is partial", async () => {
  const fetch = makeFetch({
    [README_URLS.personal]: { status: 200, body: PERSONAL_MD },
    [README_URLS.org]: { status: 503, body: "" },
    "*": { status: 200, body: metadataBody() },
  });
  const readme = await readReadmeIndexes(fetch.impl);
  assert.equal(readme.complete, false);
  assert.equal(readme.extractions.length, 1, "the readable source is used");
  const view = buildPortfolioView({
    readmeEntries: readme.extractions.flatMap((entry) => entry.entries),
    readmeComplete: readme.complete,
    // The metadata read for VelDesk succeeded, so the row is confirmed public and renders. A
    // discovered row with no confirmed-public answer would be withheld instead — which is asserted
    // separately below.
    metadata: {
      byRepo: {
        "Vel-Labs/VelDesk": { owner: "Vel-Labs", repo: "VelDesk", private: false, archived: null, language: null, topics: [], pushedAt: null, htmlUrl: null },
      },
      unknown: [],
      unavailable: [],
      complete: false,
    },
    editorial: EDITORIAL,
  });
  assert.ok(view.cards.some((card) => card.repo === "VelDesk"), "the good source still renders");
  assert.match(view.freshness, /partial/i);
  assert.notEqual(view.source, "snapshot");
});

await test("COLD START renders a populated page from the committed fallback", async () => {
  const fetch = makeFetch({}); // every URL 404s in this fixture: the worst case
  const readme = await readReadmeIndexes(fetch.impl);
  const view = buildPortfolioView({
    readmeEntries: readme.extractions.flatMap((entry) => entry.entries),
    readmeComplete: readme.complete,
    metadata: { byRepo: {}, unknown: [], unavailable: [], complete: false },
    editorial: EDITORIAL,
  });
  assert.ok(view.cards.length >= 10, `cold start must be populated, got ${view.cards.length}`);
  assert.equal(view.source, "snapshot");
  assert.ok(view.cards.every((card) => card.url.startsWith("https://github.com/")));
});

console.log("\nportfolio refresh: removals versus transient errors");

await test("only a 404 removes an entry; a transient error keeps it", async () => {
  const fetch = makeFetch({
    "https://api.github.com/repos/Vel-Labs/gone": { status: 404, body: "Not Found" },
    "https://api.github.com/repos/Vel-Labs/flaky": { status: 500, body: "" },
    "https://api.github.com/repos/Vel-Labs/fine": { status: 200, body: metadataBody() },
  });
  const metadata = await readRepoMetadata(
    [
      { owner: "Vel-Labs", repo: "gone" },
      { owner: "Vel-Labs", repo: "flaky" },
      { owner: "Vel-Labs", repo: "fine" },
    ],
    fetch.impl,
  );
  const policy = removalPolicy(metadata);
  sameJson(policy.remove, ["Vel-Labs/gone"], "a confirmed 404 is the only removal");
  sameJson(policy.keep, ["Vel-Labs/flaky"], "a 500 is not evidence of removal");
  assert.equal(metadata.complete, false, "a partial read is not reported as complete");
});

await test("a confirmed-absent entry is excluded and recorded, not silently dropped", async () => {
  const view = buildPortfolioView({
    readmeEntries: [
      { owner: "Vel-Labs", repo: "gone", url: "https://github.com/Vel-Labs/gone", label: "gone", section: "Recommended Pins", source: "org" },
      { owner: "Vel-Labs", repo: "fine", url: "https://github.com/Vel-Labs/fine", label: "fine", section: "Recommended Pins", source: "org" },
    ],
    readmeComplete: true,
    metadata: {
      byRepo: { "Vel-Labs/fine": { owner: "Vel-Labs", repo: "fine", private: false, archived: null, language: null, topics: [], pushedAt: null, htmlUrl: null } },
      unknown: [],
      unavailable: [{ key: "Vel-Labs/gone", reason: "404 — confirmed absent" }],
      complete: true,
    },
    editorial: [],
  });
  sameJson(view.cards.map((card) => card.repo), ["fine"]);
  assert.equal(view.pending.length, 1);
  assert.equal(view.pending[0].key, "Vel-Labs/gone");
  assert.match(view.pending[0].reason, /absent/i);
});

await test("an entry with UNCONFIRMED public status is withheld from new cards and recorded", async () => {
  const view = buildPortfolioView({
    readmeEntries: [
      { owner: "Vel-Labs", repo: "thc-leaderboard", url: "https://github.com/Vel-Labs/thc-leaderboard", label: "thc-leaderboard", section: "Recommended Pins", source: "org" },
      { owner: "Vel-Labs", repo: "known-public", url: "https://github.com/Vel-Labs/known-public", label: "known-public", section: "Recommended Pins", source: "org" },
    ],
    readmeComplete: true,
    metadata: {
      byRepo: {
        "Vel-Labs/known-public": { owner: "Vel-Labs", repo: "known-public", private: false, archived: null, language: null, topics: [], pushedAt: null, htmlUrl: null },
      },
      unknown: ["Vel-Labs/thc-leaderboard"],
      unavailable: [],
      complete: false,
    },
    editorial: [],
  });
  sameJson(view.cards.map((card) => card.repo), ["known-public"], "unknown status must not be exposed");
  assert.equal(view.pending[0].key, "Vel-Labs/thc-leaderboard");
  assert.match(view.pending[0].reason, /unconfirmed/i);
  assert.equal(view.enrichmentPartial, true);
});

console.log("\nportfolio refresh: nothing is invented, nothing approved is lost");

await test("metadata is never guessed: an unread field stays null", async () => {
  const view = buildPortfolioView({
    readmeEntries: [
      { owner: "Vel-Labs", repo: "x", url: "https://github.com/Vel-Labs/x", label: "x", section: "Start Here", source: "org" },
    ],
    readmeComplete: true,
    metadata: {
      byRepo: { "Vel-Labs/x": { owner: "Vel-Labs", repo: "x", private: false, archived: null, language: null, topics: [], pushedAt: null, htmlUrl: null } },
      unknown: [],
      unavailable: [],
      complete: true,
    },
    editorial: [],
  });
  const [card] = view.cards;
  assert.equal(card.language, null);
  assert.equal(card.pushedAt, null);
  assert.equal(card.archived, null);
  sameJson(card.topics, []);
});

await test("editorial cards the READMEs exclude remain available", async () => {
  const view = buildPortfolioView({
    readmeEntries: [],
    readmeComplete: false,
    metadata: { byRepo: {}, unknown: [], unavailable: [], complete: false },
    editorial: EDITORIAL,
  });
  const editorialCard = view.cards.find((card) => card.repo === "site-only-thing");
  assert.ok(editorialCard, "a site-only entry must survive");
  assert.equal(editorialCard.origin, "editorial");
  assert.equal(editorialCard.language, null, "an editorial card is not given refreshed metadata");
});

console.log("\nportfolio refresh: the confirmed-public gate and one-row-per-repo");

const LANES = new Set(["agent-workbenches", "local-first-ai", "simulation-systems", "mcp-tooling", "authority-governance", "trading-control-planes"]);

function readmeRow(repo, laneName = null) {
  return {
    owner: "Vel-Labs",
    repo,
    url: `https://github.com/Vel-Labs/${repo}`,
    label: repo,
    section: "Recommended Pins",
    source: "org",
    laneName,
  };
}

function meta(overrides = {}) {
  return { owner: "Vel-Labs", repo: "x", private: false, archived: null, language: null, topics: [], pushedAt: null, htmlUrl: null, ...overrides };
}

await test("a discovered repo with private:true is withheld and recorded as private", async () => {
  const view = buildPortfolioView({
    readmeEntries: [readmeRow("Secret")],
    readmeComplete: true,
    metadata: { byRepo: { "Vel-Labs/Secret": meta({ repo: "Secret", private: true }) }, unknown: [], unavailable: [], complete: true },
    editorial: [],
    knownLaneIds: LANES,
  });
  sameJson(view.cards, []);
  assert.equal(view.pending.length, 1);
  assert.match(view.pending[0].reason, /private/i);
});

await test("a discovered repo with a MISSING private flag is withheld as unconfirmed", async () => {
  const view = buildPortfolioView({
    readmeEntries: [readmeRow("NoFlag")],
    readmeComplete: true,
    metadata: { byRepo: { "Vel-Labs/NoFlag": meta({ repo: "NoFlag", private: null }) }, unknown: [], unavailable: [], complete: true },
    editorial: [],
    knownLaneIds: LANES,
  });
  sameJson(view.cards, []);
  assert.match(view.pending[0].reason, /unconfirmed/i);
});

await test("the same repo listed twice appears once", async () => {
  const view = buildPortfolioView({
    readmeEntries: [readmeRow("VelDesk"), { ...readmeRow("veldesk"), owner: "Vel-Labs", label: "again" }],
    readmeComplete: true,
    metadata: { byRepo: { "Vel-Labs/VelDesk": meta({ repo: "VelDesk" }) }, unknown: [], unavailable: [], complete: true },
    editorial: [],
    knownLaneIds: LANES,
  });
  assert.equal(view.cards.length, 1, "one row per repository, case-insensitively");
});

await test("a supported lane maps from the README's own table data", async () => {
  const view = buildPortfolioView({
    readmeEntries: [readmeRow("VelDesk", "Agent workbenches")],
    readmeComplete: true,
    metadata: { byRepo: { "Vel-Labs/VelDesk": meta({ repo: "VelDesk" }) }, unknown: [], unavailable: [], complete: true },
    editorial: [],
    knownLaneIds: LANES,
  });
  assert.equal(view.cards[0].laneId, "agent-workbenches");
  assert.equal(view.cards[0].laneMapped, true);
});

await test("an unsupported lane word is shown as text and never becomes a filter value", async () => {
  const view = buildPortfolioView({
    readmeEntries: [readmeRow("thc-methodology", "Reliability doctrine")],
    readmeComplete: true,
    metadata: { byRepo: { "Vel-Labs/thc-methodology": meta({ repo: "thc-methodology" }) }, unknown: [], unavailable: [], complete: true },
    editorial: [],
    knownLaneIds: LANES,
  });
  assert.equal(view.cards[0].laneId, null, "no supported lane, so no filter value");
  assert.equal(view.cards[0].laneName, "Reliability doctrine", "the README's own word is kept");
  assert.equal(view.cards[0].laneMapped, false);
});

await test("a SECTION HEADING is never used as a lane", async () => {
  const { extractReadmeIndex, ORG_README } = loader.load("src/lib/github/readme-index.ts");
  // A table with a Lane column: the lane comes from the row.
  const withLane = extractReadmeIndex(
    ["## Recommended Pins", "| Lane | Repositories |", "| --- | --- |", "| Synthetic systems | [civulacrum](https://github.com/Vel-Labs/civulacrum) |"].join("\n"),
    ORG_README,
  );
  assert.equal(withLane.entries[0].laneName, "Synthetic systems");
  assert.notEqual(withLane.entries[0].laneName, "Recommended Pins", "the heading must not become a lane");

  // A table WITHOUT a Lane column: no lane is claimed, and the heading is still not one.
  const withoutLane = extractReadmeIndex(
    ["## Recommended Pins", "| If you want to inspect... | Start with |", "| --- | --- |", "| A cockpit | [VelDesk](https://github.com/Vel-Labs/VelDesk) |"].join("\n"),
    ORG_README,
  );
  assert.equal(withoutLane.entries[0].laneName, null);
  // A plain list row also carries no lane.
  const listed = extractReadmeIndex(["## Recommended Pins", "- [vel-mcp](https://github.com/Vel-Labs/vel-mcp)"].join("\n"), ORG_README);
  assert.equal(listed.entries[0].laneName, null);
});

await test("a read that succeeds but parses to nothing is DEGRADED, not a silent swap", async () => {
  const view = buildPortfolioView({
    readmeEntries: [],
    readmeComplete: true,
    metadata: { byRepo: {}, unknown: [], unavailable: [], complete: false },
    editorial: [],
    knownLaneIds: LANES,
    perSourceCounts: { personal: 0, org: 0 },
  });
  assert.equal(view.degraded, true);
  assert.match(view.freshness, /no usable entries|baseline/i);
  assert.ok(view.cards.length > 0, "the baseline is served rather than an empty list");
});

await test("the actual filter/dedupe path: a lane filter and a query over one merged list", async () => {
  const view = buildPortfolioView({
    readmeEntries: [
      readmeRow("VelDesk", "Agent workbenches"),
      readmeRow("civulacrum", "Synthetic systems"),
      readmeRow("CareSight", "Local-first ML"),
    ],
    readmeComplete: true,
    metadata: {
      byRepo: {
        "Vel-Labs/VelDesk": meta({ repo: "VelDesk" }),
        "Vel-Labs/civulacrum": meta({ repo: "civulacrum" }),
        "Vel-Labs/CareSight": meta({ repo: "CareSight" }),
      },
      unknown: [],
      unavailable: [],
      complete: true,
    },
    editorial: [{ owner: "Vel-Labs", repo: "site-only", url: "https://github.com/Vel-Labs/site-only", label: "Site only", lane: "agent-workbenches" }],
    knownLaneIds: LANES,
  });
  sameJson(view.cards.map((c) => c.repo), ["VelDesk", "civulacrum", "CareSight", "site-only"]);
  // A lane filter selects the mapped rows plus the curated row in that lane.
  const inLane = view.cards.filter((c) => c.laneId === "agent-workbenches").map((c) => c.repo);
  sameJson(inLane, ["VelDesk", "site-only"]);
  // A query matches across label/repo/owner/lane word — the original bug was a query matching nothing
  // while imported rows stayed visible.
  const q = view.cards.filter((c) => `${c.label} ${c.repo} ${c.owner} ${c.laneName ?? ""}`.toLowerCase().includes("veldesk"));
  sameJson(q.map((c) => c.repo), ["VelDesk"]);
});

console.log(
  `\nportfolio refresh: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
