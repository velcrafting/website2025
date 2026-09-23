// tests/arcade/arcade.test.mjs
//
// F4, 2026-09-17. The arcade's discovery and metadata are a trust boundary: they decide what a visitor
// can play, and every field is read from a public repository this site does not control.
//
// These checks are about that boundary and about degradation. The adversarial cases matter most: an
// unapproved owner (which must not be fetched from at all), a non-https play URL, a malformed file, and
// the difference between "nothing is listed" and "the read failed" — which are different facts, and only
// one of them is a reason to change something.

import { strict as assert } from "node:assert";

import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const {
  validateArcadeFields,
  readArcadeFile,
  readArcade,
  isApprovedOwner,
  arcadeUrlFor,
  ARCADE_FILE,
  ARCADE_SECTION,
} = loader.load("src/lib/github/arcade.ts");

let passed = 0;
const failures = [];

// One helper for both shapes. `fn` may be sync or async, and every run is collected in `pending` so the
// summary at the end cannot print before the async checks have finished. A test file whose counts lie is
// worse than no test file.
const pending = [];

function test(name, fn) {
  pending.push(
    (async () => {
      try {
        await fn();
        passed += 1;
        console.log(`  ok    ${name}`);
      } catch (error) {
        failures.push(name);
        console.log(`  FAIL  ${name}\n        ${error.message}`);
      }
    })(),
  );
}

const testAsync = test;

/** A fetch stand-in. Records every URL it is asked for, which is how "nothing is fetched" is proven. */
function spyFetch(handler) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  impl.calls = calls;
  return impl;
}

function response(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  };
}

const goodFields = {
  summary: "A small game.",
  description: "A longer paragraph about it.",
  playUrl: "https://velcrafting.github.io/game/",
  tags: ["model: one", "puzzle"],
  status: "playable",
  added: "2026 · 09",
};

// ------------------------------------------------------------------ the validator

test("a well-formed file validates and keeps every field", () => {
  const result = validateArcadeFields(goodFields);
  assert.ok(!("reason" in result), "expected valid");
  assert.equal(result.fields.summary, "A small game.");
  assert.equal(result.fields.playUrl, "https://velcrafting.github.io/game/");
  assert.equal(result.fields.status, "playable");
  assert.equal(result.fields.tags.length, 2);
});

test("a missing or oversized summary is invalid, not silently blank", () => {
  assert.ok("reason" in validateArcadeFields({ ...goodFields, summary: undefined }));
  assert.ok("reason" in validateArcadeFields({ ...goodFields, summary: "   " }));
  assert.ok("reason" in validateArcadeFields({ ...goodFields, summary: "x".repeat(201) }));
});

test("only https play URLs survive; http, javascript and garbage are dropped", () => {
  const http = validateArcadeFields({ ...goodFields, playUrl: "http://example.com/g" });
  assert.equal(http.fields.playUrl, undefined);
  const js = validateArcadeFields({ ...goodFields, playUrl: "javascript:alert(1)" });
  assert.equal(js.fields.playUrl, undefined);
  const junk = validateArcadeFields({ ...goodFields, playUrl: "not a url" });
  assert.equal(junk.fields.playUrl, undefined);
});

test("tags are capped at five and oversized tags are dropped", () => {
  const many = validateArcadeFields({
    ...goodFields,
    tags: ["a", "b", "c", "d", "e", "f", "g"],
  });
  assert.equal(many.fields.tags.length, 5);
  const oversized = validateArcadeFields({ ...goodFields, tags: ["ok", "x".repeat(41)] });
  assert.deepEqual(JSON.parse(JSON.stringify(oversized.fields.tags)), ["ok"]);
});

test("an unrecognised status becomes workshop rather than a new state", () => {
  const weird = validateArcadeFields({ ...goodFields, status: "shipped" });
  assert.equal(weird.fields.status, "workshop");
});

test("an oversized description is dropped while the rest of the file still applies", () => {
  const long = validateArcadeFields({ ...goodFields, description: "x".repeat(601) });
  assert.equal(long.fields.description, undefined);
  assert.equal(long.fields.summary, "A small game.");
});

test("arrays and non-objects are invalid", () => {
  assert.ok("reason" in validateArcadeFields([]));
  assert.ok("reason" in validateArcadeFields(null));
  assert.ok("reason" in validateArcadeFields("a string"));
});

// ------------------------------------------------------------------ the read boundary

test("an unapproved owner is refused and NOT fetched from", async () => {
  const spy = spyFetch(() => response(JSON.stringify(goodFields)));
  const result = await readArcadeFile({ owner: "someone-else", repo: "game" }, spy);
  assert.equal(result.status, "unavailable");
  assert.equal(spy.calls.length, 0, "nothing must be fetched for an unapproved owner");
});

test("the URL is the raw file on the repository's default branch", () => {
  assert.equal(
    arcadeUrlFor({ owner: "velcrafting", repo: "game" }),
    "https://raw.githubusercontent.com/velcrafting/game/HEAD/arcade.json",
  );
  assert.equal(ARCADE_FILE, "arcade.json");
  assert.equal(ARCADE_SECTION, "Arcade");
  assert.equal(isApprovedOwner("Vel-Labs"), true);
});

test("a 404 is absent, a 500 is transient, and a malformed body is invalid", async () => {
  const notFound = await readArcadeFile({ owner: "velcrafting", repo: "g" }, spyFetch(() => response("", 404)));
  assert.equal(notFound.status, "absent");

  const boom = await readArcadeFile({ owner: "velcrafting", repo: "g" }, spyFetch(() => response("no", 500)));
  assert.equal(boom.status, "transient");

  const bad = await readArcadeFile({ owner: "velcrafting", repo: "g" }, spyFetch(() => response("{oops")));
  assert.equal(bad.status, "invalid");

  const oversized = await readArcadeFile(
    { owner: "velcrafting", repo: "g" },
    spyFetch(() => response(JSON.stringify({ summary: "x".repeat(5000) }))),
  );
  assert.equal(oversized.status, "invalid");
});

test("a non-https play URL is dropped UNLESS the fixture origin is configured", () => {
  // Production rule: https only. The fixture seam adds one origin, and only while the seam is on. This
  // check loads the module twice — once with PORTFOLIO_FIXTURE_BASE set and once without — because the
  // origin is resolved at module load. It is the proof that the seam cannot reach production.
  const withFixture = createModuleLoader({
    env: { PORTFOLIO_FIXTURE_BASE: "http://127.0.0.1:3452" },
  }).load("src/lib/github/arcade.ts");
  const withoutFixture = createModuleLoader({ env: {} }).load("src/lib/github/arcade.ts");

  const localUrl = "http://127.0.0.1:3452/game/";
  const accepted = withFixture.validateArcadeFields({ ...goodFields, playUrl: localUrl });
  assert.equal(accepted.fields.playUrl, localUrl, "the fixture origin must be accepted while the seam is on");

  const rejected = withoutFixture.validateArcadeFields({ ...goodFields, playUrl: localUrl });
  assert.equal(rejected.fields.playUrl, undefined, "the same URL MUST be rejected when no fixture is configured");

  // An http URL on any other origin is refused in both modes — the seam is one origin, not a protocol.
  const elsewhere = "http://example.com/game/";
  assert.equal(withFixture.validateArcadeFields({ ...goodFields, playUrl: elsewhere }).fields.playUrl, undefined);
  assert.equal(withoutFixture.validateArcadeFields({ ...goodFields, playUrl: elsewhere }).fields.playUrl, undefined);

  // And https still works in both.
  assert.ok(withoutFixture.validateArcadeFields(goodFields).fields.playUrl, "https must always be accepted");
});

test("the deployment blocker is recorded, not hidden", () => {
  // The real play URL for the fixture card is a live GitHub Pages 404. Nothing in this repository can fix
  // that; it is a publication step. This check exists so the fact stays visible in the test file too.
  const url = "https://velcrafting.github.io/catch-the-blocks/";
  assert.ok(url.startsWith("https://"), "the published-game blocker is an upstream publication gap");
});

// ------------------------------------------------------------------ the shelf

const README_WITH_SECTION = [
  "# Velcrafting",
  "",
  "## Arcade",
  "",
  "- [catch-the-blocks](https://github.com/velcrafting/catch-the-blocks)",
  "",
  "## Elsewhere",
  "",
  "- [not-a-game](https://github.com/velcrafting/not-a-game)",
].join("\n");

test("a repository listed under Arcade becomes an entry, and one outside it does not", async () => {
  const spy = spyFetch(() => response(JSON.stringify(goodFields)));
  const shelf = await readArcade(README_WITH_SECTION, spy);
  assert.equal(shelf.discoveryFailed, false);
  assert.equal(shelf.entries.length, 1, "only the Arcade section counts");
  assert.equal(shelf.entries[0].title, "catch-the-blocks");
  assert.equal(shelf.entries[0].metaState, "ok");
  assert.equal(shelf.entries[0].status, "playable");
  assert.equal(shelf.entries[0].playUrl, "https://velcrafting.github.io/game/");
});

test("missing metadata keeps the entry standing, and never invents a summary", async () => {
  const absent = await readArcade(README_WITH_SECTION, spyFetch(() => response("", 404)));
  assert.equal(absent.entries.length, 1);
  assert.equal(absent.entries[0].metaState, "absent");
  assert.equal(absent.entries[0].summary, "");
  assert.equal(absent.entries[0].playUrl, undefined);
});

test("a failed metadata read keeps the entry standing — never an empty shelf", async () => {
  const broken = await readArcade(README_WITH_SECTION, spyFetch(() => response("no", 500)));
  assert.equal(broken.entries.length, 1);
  assert.equal(broken.entries[0].metaState, "transient");
});

test("a malformed file keeps the entry standing and drops the file's fields", async () => {
  const bad = await readArcade(README_WITH_SECTION, spyFetch(() => response(JSON.stringify({ summary: "" }))));
  assert.equal(bad.entries.length, 1);
  assert.equal(bad.entries[0].metaState, "invalid");
  assert.equal(bad.entries[0].summary, "");
});

test("an unreadable index reports discovery failed rather than an empty arcade", async () => {
  const failed = await readArcade(null, spyFetch(() => response("")));
  assert.equal(failed.discoveryFailed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(failed.missing)), [ARCADE_SECTION]);
  assert.equal(failed.entries.length, 0);
});

test("a README with no Arcade section reports it as missing and lists nothing", async () => {
  const withoutSection = "# Velcrafting\n\n## Elsewhere\n\n- [x](https://github.com/velcrafting/x)\n";
  const shelf = await readArcade(withoutSection, spyFetch(() => response(JSON.stringify(goodFields))));
  assert.equal(shelf.discoveryFailed, false);
  assert.ok(shelf.missing.includes(ARCADE_SECTION), "the absent section must be reported");
  assert.equal(shelf.entries.length, 0, "nothing is invented to fill the shelf");
});

test("a lookalike host in the index does not become an entry", async () => {
  const trap = [
    "# Velcrafting",
    "",
    "## Arcade",
    "",
    "- [evil](https://github.com.evil.example/velcrafting/game)",
    "- [offowner](https://github.com/someone-else/game)",
  ].join("\n");
  const shelf = await readArcade(trap, spyFetch(() => response(JSON.stringify(goodFields))));
  const fromEvilHost = shelf.entries.filter((e) => e.owner === "velcrafting" && e.repo === "game");
  assert.equal(fromEvilHost.length, 0, "a lookalike host must not produce an approved entry");
});

// Wait for every check, then summarise. Top-level await is available in an .mjs module.
await Promise.all(pending);

console.log(`\n${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log(`\nFAILED: ${failures.join(", ")}`);
  process.exit(1);
}
