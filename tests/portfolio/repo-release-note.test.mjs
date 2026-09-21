// tests/portfolio/repo-release-note.test.mjs
//
// FIXTURE PROOF for the per-project version chip's read path (docs/implementation_plan_Sep16.md §5,
// tasks 3.1–3.4). Every read here goes through an INJECTED fetch, so the four cases named in task
// 3.4 — a repository WITH the file, one WITHOUT it, one with a MALFORMED file, and a FAILED read —
// are exercised deterministically. Nothing in this file claims anything about real GitHub responses.
//
// What it establishes:
//
//   - the convention's file name and URL;
//   - a valid file yields the version and the first note as the one-sentence update;
//   - a 404 is `absent`, and everything that is not a 200 or a 404 — including an empty body — is
//     `transient`: "no file" and "the read failed" never collapse into the same state;
//   - an unusable file is `invalid` and renders no chip;
//   - an owner outside the approved set is never fetched at all;
//   - the read carries the same daily revalidation window as the rest of the public read path;
//   - NOTHING INVENTED: no non-`ok` result carries a version, a type of version, or any
//     placeholder value, from any source. This is the load-bearing check of the whole file.

import { strict as assert } from "node:assert";

import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const { readRepoReleaseNote, readRepoReleaseNotes, releaseNoteUrlFor, RELEASE_NOTE_FILE, RELEASE_NOTE_BYTE_BOUND, DAILY_REVALIDATE_SECONDS } =
  (() => {
    const mod = loader.load("src/lib/github/repo-release-note.ts");
    const source = loader.load("src/lib/github/portfolio-source.ts");
    return { ...mod, DAILY_REVALIDATE_SECONDS: source.DAILY_REVALIDATE_SECONDS };
  })();

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

const OK_REF = { owner: "Vel-Labs", repo: "ChipOk" };
const urlFor = (ref) => releaseNoteUrlFor(ref);

/** A deterministic injected fetch. `routes` maps a URL to a response, or to `{throws}`. */
function makeFetch(routes) {
  const calls = [];
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, revalidate: init?.next?.revalidate });
      const route = routes[url] ?? routes["*"];
      if (route === undefined) {
        // The default is a 404, which is what an absent file looks like from GitHub.
        return { ok: false, status: 404, text: async () => "404: Not Found" };
      }
      if (route.throws) throw new Error(route.throws);
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        text: async () => route.body ?? "",
      };
    },
  };
}

const VALID_FILE = JSON.stringify({
  version: "2026.09",
  updated: "2026-09-16",
  notes: ["The project index is now one filterable list.", "Fixed a cold-start crash."],
});

/**
 * The core promise: a card shows a version ONLY when one was read out of a validated body.
 *
 * Checked by scanning the serialised result rather than by trusting a status name, so any future
 * branch that leaks a default, a fallback or an invented version fails here. The detail is
 * diagnostic only — the assertion is the point.
 */
function assertNoInventedVersion(read, label) {
  assert.notEqual(read.status, "ok", `${label}: an unusable read must not be ok`);
  assert.equal(read.release, undefined, `${label}: no release object may be attached`);
  const text = JSON.stringify(read);
  const versionShape = text.match(/[0-9]+\.[0-9]+/g);
  assert.equal(
    versionShape,
    null,
    `${label}: a non-ok read must carry no version-shaped value at all, found ${JSON.stringify(versionShape)} in ${text}`,
  );
  for (const banned of ["0.0.0", "unreleased", "unknown", "placeholder", "n/a", "TBD"]) {
    assert.ok(
      !text.toLowerCase().includes(banned),
      `${label}: a non-ok read must carry no placeholder ("${banned}") — got ${text}`,
    );
  }
}

console.log("\nrepo release note: the convention");

await test("the convention reads `release-note.json` at the repository root", () => {
  assert.equal(RELEASE_NOTE_FILE, "release-note.json");
  assert.equal(
    urlFor(OK_REF),
    "https://raw.githubusercontent.com/Vel-Labs/ChipOk/HEAD/release-note.json",
  );
});

await test("the read carries the same daily window as the rest of the public read path", async () => {
  const fetch = makeFetch({ [urlFor(OK_REF)]: { status: 200, body: VALID_FILE } });
  await readRepoReleaseNote(OK_REF, fetch.impl);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].revalidate, DAILY_REVALIDATE_SECONDS);
  assert.equal(DAILY_REVALIDATE_SECONDS, 86400);
});

console.log("\nrepo release note: case 1 — the repository HAS the file");

await test("a valid file yields the version, the date and the first note as Latest", async () => {
  const fetch = makeFetch({ [urlFor(OK_REF)]: { status: 200, body: VALID_FILE } });
  const read = await readRepoReleaseNote(OK_REF, fetch.impl);
  assert.equal(read.status, "ok");
  assert.equal(read.release.version, "2026.09");
  assert.equal(read.release.updated, "2026-09-16");
  assert.equal(read.release.note, "The project index is now one filterable list.");
  assert.equal(read.url, urlFor(OK_REF), "the chip must be able to quote the file it came from");
  assert.equal(read.bytes, Buffer.byteLength(VALID_FILE, "utf8"));
});

await test("a version with no usable note is usable: the chip shows the version and no sentence", async () => {
  const fetch = makeFetch({ [urlFor(OK_REF)]: { status: 200, body: JSON.stringify({ version: "1.4.0" }) } });
  const read = await readRepoReleaseNote(OK_REF, fetch.impl);
  assert.equal(read.status, "ok");
  assert.equal(read.release.version, "1.4.0");
  assert.equal(read.release.note, null);
});

console.log("\nrepo release note: case 2 — the repository has NO file");

await test("a 404 is `absent`: a designed outcome, not a failure", async () => {
  const fetch = makeFetch({ [urlFor(OK_REF)]: { status: 404, body: "404: Not Found" } });
  const read = await readRepoReleaseNote(OK_REF, fetch.impl);
  assert.equal(read.status, "absent");
  assert.equal(read.url, urlFor(OK_REF));
  assertNoInventedVersion(read, "absent");
});

await test("`absent` and `transient` are different states for the same empty result", async () => {
  const absent = await readRepoReleaseNote(OK_REF, makeFetch({}).impl);
  const failed = await readRepoReleaseNote(
    OK_REF,
    makeFetch({ [urlFor(OK_REF)]: { status: 500, body: "boom" } }).impl,
  );
  assert.equal(absent.status, "absent");
  assert.equal(failed.status, "transient");
  assert.notEqual(absent.status, failed.status, "a failure must never be recorded as an absence");
});

console.log("\nrepo release note: case 3 — the file is MALFORMED");

for (const [label, body] of [
  ["not JSON at all", "version: 1.0\n"],
  ["truncated JSON", '{"version": "1.0",'],
  ["valid JSON that is an array", '["version", "1.0"]'],
  ["valid JSON that is a string", '"1.0"'],
  ["valid JSON that is null", "null"],
  ["valid JSON that is a number", "42"],
  ["an object with no version", '{"notes": ["something happened"]}'],
  ["an empty version", '{"version": "   "}'],
  ["a non-string version", '{"version": 2026}'],
  ["a version over the length bound", `{"version": "${"v".repeat(25)}"}`],
]) {
  await test(`a file that is ${label} yields no chip`, async () => {
    const fetch = makeFetch({ [urlFor(OK_REF)]: { status: 200, body } });
    const read = await readRepoReleaseNote(OK_REF, fetch.impl);
    assert.equal(read.status, "invalid", `expected invalid, got ${read.status}`);
    assertNoInventedVersion(read, label);
  });
}

await test("a body over the byte bound is refused rather than parsed", async () => {
  const body = JSON.stringify({ version: "1.0", notes: ["x".repeat(RELEASE_NOTE_BYTE_BOUND)] });
  assert.ok(Buffer.byteLength(body, "utf8") > RELEASE_NOTE_BYTE_BOUND);
  const fetch = makeFetch({ [urlFor(OK_REF)]: { status: 200, body } });
  const read = await readRepoReleaseNote(OK_REF, fetch.impl);
  assert.equal(read.status, "invalid");
  assert.match(read.reason, /bound/);
  assertNoInventedVersion(read, "too large");
});

console.log("\nrepo release note: case 4 — the read FAILS");

for (const [label, route] of [
  ["a 500", { status: 500, body: "boom" }],
  ["a 503", { status: 503, body: "" }],
  ["a 429 rate limit", { status: 429, body: "slow down" }],
  ["a thrown network error", { throws: "getaddrinfo ENOTFOUND raw.githubusercontent.com" }],
  ["an empty body", { status: 200, body: "   " }],
]) {
  await test(`${label} is transient and yields no chip`, async () => {
    const fetch = makeFetch({ [urlFor(OK_REF)]: route });
    const read = await readRepoReleaseNote(OK_REF, fetch.impl);
    assert.equal(read.status, "transient", `expected transient, got ${read.status}`);
    assert.equal(read.url, urlFor(OK_REF));
    assertNoInventedVersion(read, label);
  });
}

console.log("\nrepo release note: the owner boundary");

await test("an owner outside the approved set is never fetched", async () => {
  const fetch = makeFetch({ "*": { status: 200, body: VALID_FILE } });
  const read = await readRepoReleaseNote({ owner: "someone-else", repo: "ChipOk" }, fetch.impl);
  assert.equal(read.status, "unavailable");
  assert.equal(fetch.calls.length, 0, "an unapproved owner must not be requested at all");
  assertNoInventedVersion(read, "unapproved owner");
});

await test("the approved owners are the ones the rest of the portfolio uses", async () => {
  const { APPROVED_OWNERS } = loader.load("src/lib/github/readme-index.ts");
  const fetch = makeFetch({ "*": { status: 200, body: VALID_FILE } });
  for (const owner of APPROVED_OWNERS) {
    const read = await readRepoReleaseNote({ owner, repo: "ChipOk" }, fetch.impl);
    assert.equal(read.status, "ok", `${owner} is approved and must be readable`);
  }
});

await test("owner and repo values that are not plain path segments are refused", async () => {
  const fetch = makeFetch({ "*": { status: 200, body: VALID_FILE } });
  for (const ref of [
    { owner: "Vel-Labs/../..", repo: "x" },
    { owner: "Vel-Labs", repo: "x?y=1" },
    { owner: "Vel-Labs", repo: "x/y" },
    { owner: "", repo: "" },
    { owner: null, repo: 7 },
  ]) {
    const read = await readRepoReleaseNote(ref, fetch.impl);
    assert.equal(read.status, "unavailable", `${JSON.stringify(ref)} must be refused`);
    assertNoInventedVersion(read, JSON.stringify(ref));
  }
  assert.equal(fetch.calls.length, 0, "nothing may be fetched for a malformed pair");
});

await test("nothing throws, including for null input", async () => {
  const fetch = makeFetch({});
  for (const input of [null, undefined, {}, "Vel-Labs/ChipOk"]) {
    const read = await readRepoReleaseNote(input, fetch.impl);
    assert.equal(read.status, "unavailable");
  }
});

console.log("\nrepo release note: the four cases at once, as the page reads them");

await test("a mixed set of repositories yields one state per card and a chip only for the readable one", async () => {
  const refs = [
    { owner: "Vel-Labs", repo: "ChipOk" },
    { owner: "Vel-Labs", repo: "ChipAbsent" },
    { owner: "Vel-Labs", repo: "ChipMalformed" },
    { owner: "Vel-Labs", repo: "ChipFail" },
    { owner: "Vel-Labs", repo: "ChipOk" }, // duplicate: read once
  ];
  const fetch = makeFetch({
    [urlFor({ owner: "Vel-Labs", repo: "ChipOk" })]: { status: 200, body: VALID_FILE },
    [urlFor({ owner: "Vel-Labs", repo: "ChipMalformed" })]: { status: 200, body: "{not json" },
    [urlFor({ owner: "Vel-Labs", repo: "ChipFail" })]: { status: 500, body: "boom" },
    // ChipAbsent has no route, so it 404s.
  });
  const reads = await readRepoReleaseNotes(refs, fetch.impl);

  assert.equal(Object.keys(reads.byRepo).length, 4, "the duplicate is read once");
  assert.equal(fetch.calls.length, 4);
  assert.equal(reads.byRepo["Vel-Labs/ChipOk"].status, "ok");
  assert.equal(reads.byRepo["Vel-Labs/ChipAbsent"].status, "absent");
  assert.equal(reads.byRepo["Vel-Labs/ChipMalformed"].status, "invalid");
  assert.equal(reads.byRepo["Vel-Labs/ChipFail"].status, "transient");
  assert.equal(reads.chips, 1, "exactly one card renders a chip");
  assert.equal(reads.unreadable, 2, "the malformed file and the failed read are not absences");
  assert.deepEqual(JSON.parse(JSON.stringify(reads.states)), {
    ok: 1,
    absent: 1,
    invalid: 1,
    transient: 1,
  });
});

await test("a broken fetch impl cannot take the page down or invent a version", async () => {
  const reads = await readRepoReleaseNotes(
    [{ owner: "Vel-Labs", repo: "ChipOk" }],
    async () => {
      throw new Error("fetch impl is broken");
    },
  );
  assert.equal(reads.byRepo["Vel-Labs/ChipOk"].status, "transient");
  assert.equal(reads.chips, 0);
  assert.equal(reads.unreadable, 1);
  assertNoInventedVersion(reads.byRepo["Vel-Labs/ChipOk"], "broken impl");
});

await test("no result of any kind carries a version unless it was read", async () => {
  const fetch = makeFetch({
    [urlFor({ owner: "Vel-Labs", repo: "ChipOk" })]: { status: 200, body: VALID_FILE },
    "*": { status: 404, body: "Not Found" },
  });
  const reads = await readRepoReleaseNotes(
    [
      { owner: "Vel-Labs", repo: "ChipOk" },
      { owner: "Vel-Labs", repo: "ChipAbsent" },
      { owner: "someone-else", repo: "ChipOk" },
      { owner: "Vel-Labs", repo: "bad?name" },
    ],
    fetch.impl,
  );
  for (const [key, read] of Object.entries(reads.byRepo)) {
    if (read.status === "ok") continue;
    assertNoInventedVersion(read, key);
  }
  assert.equal(reads.chips, 1);
});

console.log(
  `\nrepo release note: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
