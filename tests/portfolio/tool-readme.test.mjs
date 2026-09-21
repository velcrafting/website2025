// tests/portfolio/tool-readme.test.mjs
//
// Focused suite for the README reader that `/tools/<slug>` uses to render a tool's own README
// inline (docs/implementation_plan_Sep16.md §3, task 1.6).
//
// A tool page supplies its repository address as MDX frontmatter, so that value is a trust
// boundary: it decides which host the server will fetch from. These checks are about that boundary,
// the byte bound, and degradation — plus the non-executable contract on the renderer, which is a
// source-level check because the real rendering proof is the served page (§1.7).
//
// Every adversarial case here is one that would matter if it regressed: a lookalike host, an
// unapproved owner, a `Content-Length` that disagrees with the body, multibyte text against a byte
// bound, an upstream 500, an empty body, and a README that is nothing but script and images.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createModuleLoader } from "../editor/_module-loader.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");

const loader = createModuleLoader();
const { readToolReadme, parseApprovedRepoRef, readmeUrlFor, utf8Bytes, README_BYTE_BOUND } = loader.load(
  "src/lib/github/tool-readme.ts",
);
const { parseReadmeBlocks, parseInline, safeLinkHref } = loader.load("src/lib/readme-blocks.ts");

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

/**
 * Structural comparison (plan §10 trap 4).
 *
 * Values produced inside the harness's VM carry a different Array prototype, so `deepEqual`
 * rejects contents that are in fact identical. Canonical JSON is the same assertion without the
 * realm assumption.
 */
function sameJson(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

/** A minimal fetch response. `headers` is deliberately present: the reader must not trust it. */
function response(status, body, headers) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers ?? {},
    text: async () => body,
  };
}

/** A fetch implementation driven by a route table, recording every URL it was asked for. */
function routerFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const route = Object.prototype.hasOwnProperty.call(routes, url) ? routes[url] : routes["*"];
    if (route === undefined) return response(404, "404: Not Found");
    return typeof route === "function" ? route(url) : route;
  };
  impl.calls = calls;
  return impl;
}

const QR_LAB_README = [
  "# QR Generator",
  "",
  "Generate QR codes (URL, text, WiFi, vCard, event) and export to PNG or SVG.",
  "",
  "## Features",
  "- URL, free text, WiFi, vCard and calendar event payloads",
  "- Error correction levels `L` to `H`",
  "",
  "## Development",
  "",
  "```bash",
  "- this line is not a bullet",
  "npm run dev",
  "```",
  "",
  "See the [project page](https://velcrafting.github.io/qr-lab/) for presets.",
].join("\n");

// ---------------------------------------------------------------------------
console.log("\nowner/repo boundary\n");

await test("an approved owner and repo parse, and the read URL stays on the approved host", () => {
  sameJson(parseApprovedRepoRef("https://github.com/velcrafting/qr-lab"), { owner: "velcrafting", repo: "qr-lab" });
  assert.equal(
    readmeUrlFor({ owner: "velcrafting", repo: "qr-lab" }),
    "https://raw.githubusercontent.com/velcrafting/qr-lab/HEAD/README.md",
  );
});

await test("the second approved owner is accepted case-insensitively", () => {
  sameJson(parseApprovedRepoRef("https://github.com/Vel-Labs/VelDesk"), { owner: "Vel-Labs", repo: "VelDesk" });
});

await test("a lookalike host is rejected", () => {
  for (const value of [
    "https://github.com.evil.test/velcrafting/qr-lab",
    "https://rawgithub.com/velcrafting/qr-lab",
    "https://notgithub.com/velcrafting/qr-lab",
    "https://evil.test/github.com/velcrafting/qr-lab",
    "https://github.com:8443.evil.test/velcrafting/qr-lab",
  ]) {
    assert.equal(parseApprovedRepoRef(value), null, `${value} must not be accepted as a repository`);
  }
});

await test("an unapproved owner is rejected even on the real host", () => {
  assert.equal(parseApprovedRepoRef("https://github.com/torvalds/linux"), null);
});

await test("a non-URL, a scheme other than http(s), and a bare owner/repo are rejected", () => {
  for (const value of [
    undefined,
    null,
    42,
    true,
    {},
    [],
    "",
    "   ",
    "velcrafting/qr-lab",
    "/velcrafting/qr-lab",
    "github.com/velcrafting/qr-lab",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/markdown,#x",
    "https://github.com/velcrafting",
  ]) {
    assert.equal(parseApprovedRepoRef(value), null, `${JSON.stringify(value)} must be refused`);
  }
});

await test("a refused reference fetches nothing at all", async () => {
  const fetchImpl = routerFetch({});
  const outcome = await readToolReadme("https://github.com/torvalds/linux", fetchImpl);
  assert.equal(outcome.status, "unavailable", "an unapproved owner is unavailable, not a read");
  assert.ok(outcome.reason.length > 0, "the refusal states a reason");
  sameJson(fetchImpl.calls, []);
});

await test("no repo field fetches nothing at all", async () => {
  for (const value of [undefined, "", null]) {
    const fetchImpl = routerFetch({});
    const outcome = await readToolReadme(value, fetchImpl);
    assert.equal(outcome.status, "unavailable");
    sameJson(fetchImpl.calls, []);
  }
});

await test(".git, trailing slash, deeper paths, query strings and anchors resolve to owner/repo", () => {
  for (const value of [
    "https://github.com/velcrafting/qr-lab.git",
    "https://github.com/velcrafting/qr-lab/",
    "https://github.com/velcrafting/qr-lab/tree/main/docs",
    "https://github.com/velcrafting/qr-lab?tab=readme-ov-file#usage",
    "  https://github.com/velcrafting/qr-lab  ",
  ]) {
    sameJson(parseApprovedRepoRef(value), { owner: "velcrafting", repo: "qr-lab" }, `${value} must resolve`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nbyte bound on the real bytes\n");

const README_URL = "https://raw.githubusercontent.com/velcrafting/qr-lab/HEAD/README.md";

await test("a normal README is read, measured and quoted with its URL", async () => {
  const fetchImpl = routerFetch({ [README_URL]: response(200, QR_LAB_README) });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.url, README_URL, "the outcome quotes the URL that was read");
  assert.equal(outcome.bytes, utf8Bytes(QR_LAB_README));
  assert.equal(outcome.text, QR_LAB_README);
  sameJson(fetchImpl.calls, [README_URL]);
});

await test("one byte over the bound is refused, and no text is returned", async () => {
  const body = "a".repeat(README_BYTE_BOUND + 1);
  const fetchImpl = routerFetch({ [README_URL]: response(200, body) });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "too_large");
  assert.equal(outcome.bytes, README_BYTE_BOUND + 1);
  assert.equal(outcome.text, undefined, "an oversized README must not travel to the renderer");
});

await test("a body exactly at the bound is allowed", async () => {
  const body = "a".repeat(README_BYTE_BOUND);
  const fetchImpl = routerFetch({ [README_URL]: response(200, body) });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.bytes, README_BYTE_BOUND);
});

await test("Content-Length cannot shrink a body: the bound holds on the bytes that arrived", async () => {
  // A header is a claim. This response claims 10 bytes and delivers 300,000.
  const body = "b".repeat(300_000);
  const fetchImpl = routerFetch({
    [README_URL]: response(200, body, { "content-length": "10" }),
  });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "too_large", "the real body decides, not the header");
  assert.equal(outcome.bytes, 300_000);
});

await test("the bound counts bytes, not characters", async () => {
  // 'é' is two UTF-8 bytes, so this body is over the bound while being half its size in characters.
  const over = "é".repeat(README_BYTE_BOUND / 2 + 1);
  assert.equal(over.length, README_BYTE_BOUND / 2 + 1, "character count is under the bound");
  const overOutcome = await readToolReadme(
    "https://github.com/velcrafting/qr-lab",
    routerFetch({ [README_URL]: response(200, over) }),
  );
  assert.equal(overOutcome.status, "too_large");
  assert.equal(overOutcome.bytes, README_BYTE_BOUND + 2);

  const at = "é".repeat(README_BYTE_BOUND / 2);
  const atOutcome = await readToolReadme(
    "https://github.com/velcrafting/qr-lab",
    routerFetch({ [README_URL]: response(200, at) }),
  );
  assert.equal(atOutcome.status, "ok");
  assert.equal(atOutcome.bytes, README_BYTE_BOUND);
});

// ---------------------------------------------------------------------------
console.log("\nfailure, absence and empty bodies\n");

await test("404 on both candidate names is not_found, not a failure and not a success", async () => {
  const fetchImpl = routerFetch({});
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "not_found");
  assert.equal(fetchImpl.calls.length, 2, "both README.md and readme.md were tried");
});

await test("a README.md 404 falls back to readme.md and reports the URL it read", async () => {
  const lower = "https://raw.githubusercontent.com/velcrafting/qr-lab/HEAD/readme.md";
  const fetchImpl = routerFetch({ [lower]: response(200, "# lowercase readme") });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.url, lower);
  sameJson(fetchImpl.calls, [README_URL, lower]);
});

await test("an upstream 500 is transient, with a reason, and stops the second attempt", async () => {
  const fetchImpl = routerFetch({ "*": response(500, "Internal Server Error") });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "transient");
  assert.equal(outcome.reason, "HTTP 500");
  sameJson(fetchImpl.calls, [README_URL], "a failing upstream is not evidence the file is named differently");
});

await test("a rate limit is transient, not an absence", async () => {
  const outcome = await readToolReadme(
    "https://github.com/velcrafting/qr-lab",
    routerFetch({ "*": response(429, "rate limited") }),
  );
  assert.equal(outcome.status, "transient");
  assert.equal(outcome.reason, "HTTP 429");
});

await test("a thrown network error is transient, never an absence, and carries a reason", async () => {
  const fetchImpl = routerFetch({
    "*": () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:9");
    },
  });
  const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
  assert.equal(outcome.status, "transient");
  assert.notEqual(outcome.status, "not_found", "a thrown read must never be recorded as a removal");
  // `readPublicText` reports the error's own message when it recognises the error, and its generic
  // "fetch failed" otherwise. This file runs the module in a separate VM realm (plan §10 trap 4),
  // so an Error thrown from here fails the module's `instanceof Error` check and takes the generic
  // branch. The classification is what this test asserts; the status-code reasons below are the
  // message passthrough, and they come from the same realm.
  assert.ok(typeof outcome.reason === "string" && outcome.reason.length > 0, "a transient carries a reason");
});

await test("an empty or whitespace body is transient — never a successful empty read", async () => {
  for (const body of ["", "   ", "\n\n\t\n"]) {
    const outcome = await readToolReadme(
      "https://github.com/velcrafting/qr-lab",
      routerFetch({ "*": response(200, body) }),
    );
    assert.equal(outcome.status, "transient", `body ${JSON.stringify(body)} must not read as ok`);
    assert.equal(outcome.reason, "empty body");
  }
});

await test("every non-ok status carries no text, so no caller can render a false README", async () => {
  const cases = [
    routerFetch({}),
    routerFetch({ "*": response(500, "boom") }),
    routerFetch({ "*": response(200, "") }),
    routerFetch({ "*": response(200, "x".repeat(README_BYTE_BOUND + 5)) }),
  ];
  for (const fetchImpl of cases) {
    const outcome = await readToolReadme("https://github.com/velcrafting/qr-lab", fetchImpl);
    assert.notEqual(outcome.status, "ok");
    assert.equal(outcome.text, undefined, `${outcome.status} must not carry text`);
  }
});

await test("an unapproved repo is never fetched, so the page cannot be aimed at another host", async () => {
  const fetchImpl = routerFetch({ "*": response(200, "# anything") });
  const outcome = await readToolReadme("https://github.com/evil/velcrafting", fetchImpl);
  assert.equal(outcome.status, "unavailable");
  sameJson(fetchImpl.calls, []);
});

// ---------------------------------------------------------------------------
console.log("\nconversion to plain blocks\n");

await test("headings, bullets, links and code spans become the closed block model", () => {
  sameJson(parseReadmeBlocks(QR_LAB_README), [
    { kind: "heading", level: 1, content: [{ kind: "text", text: "QR Generator" }] },
    {
      kind: "paragraph",
      content: [{ kind: "text", text: "Generate QR codes (URL, text, WiFi, vCard, event) and export to PNG or SVG." }],
    },
    { kind: "heading", level: 2, content: [{ kind: "text", text: "Features" }] },
    {
      kind: "list",
      items: [
        [{ kind: "text", text: "URL, free text, WiFi, vCard and calendar event payloads" }],
        [
          { kind: "text", text: "Error correction levels " },
          { kind: "code", text: "L" },
          { kind: "text", text: " to " },
          { kind: "code", text: "H" },
        ],
      ],
    },
    { kind: "heading", level: 2, content: [{ kind: "text", text: "Development" }] },
    { kind: "code", text: "- this line is not a bullet\nnpm run dev" },
    {
      kind: "paragraph",
      content: [
        { kind: "text", text: "See the " },
        { kind: "link", text: "project page", href: "https://velcrafting.github.io/qr-lab/" },
        { kind: "text", text: " for presets." },
      ],
    },
  ]);
});

await test("a section heading is a heading, and nothing derives data from it", () => {
  const blocks = parseReadmeBlocks("## What We Build\n\n- [VelDesk](https://github.com/Vel-Labs/VelDesk)\n");
  assert.equal(blocks[0].kind, "heading");
  assert.equal(blocks[0].level, 2);
  const allowed = new Set(["kind", "level", "content", "items", "text"]);
  for (const block of blocks) {
    for (const key of Object.keys(block)) {
      assert.ok(allowed.has(key), `block carries an unexpected field "${key}" — a heading must never become data`);
    }
  }
});

await test("only closed block kinds are ever produced, whatever the input", () => {
  const kinds = new Set(["heading", "paragraph", "list", "code"]);
  const nasty = [
    "<script>alert(1)</script>",
    "<iframe src='https://evil.test'></iframe>",
    "<div align=\"center\"><img src=x onerror=alert(1)></div>",
    "| a | b |\n| --- | --- |\n| 1 | 2 |",
    "> quoted",
    "1. ordered",
    "---",
    "***bold***",
    "<!-- comment -->",
    "[ref][1]\n\n[1]: https://evil.test",
    "```\n<script>still text</script>\n```",
    "~~~\nunterminated fence",
    "######### nine hashes",
    "#NoSpace",
    QR_LAB_README,
  ];
  for (const input of nasty) {
    const blocks = parseReadmeBlocks(input);
    for (const block of blocks) {
      assert.ok(kinds.has(block.kind), `${block.kind} is not in the closed set (input ${JSON.stringify(input)})`);
      const inlineKinds = new Set(["text", "code", "link"]);
      const nodes = block.kind === "list" ? block.items.flat() : block.kind === "code" ? [] : block.content;
      for (const node of nodes) assert.ok(inlineKinds.has(node.kind), `${node.kind} is not an inline kind`);
    }
  }
});

await test("markup in a README stays literal text", () => {
  const blocks = parseReadmeBlocks("<script>alert(1)</script>\n");
  sameJson(blocks, [{ kind: "paragraph", content: [{ kind: "text", text: "<script>alert(1)</script>" }] }]);
});

await test("an image is never a link element", () => {
  sameJson(parseInline("![shot](https://example.com/a.png)"), [
    { kind: "text", text: "![shot](https://example.com/a.png)" },
  ]);
});

await test("only absolute http(s) targets become links", () => {
  assert.equal(safeLinkHref("https://example.com/a"), "https://example.com/a");
  assert.equal(safeLinkHref("http://example.com/a"), "http://example.com/a");
  for (const refused of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "mailto:someone@example.com",
    "./docs/relative.md",
    "../up.md",
    "#anchor",
    "",
  ]) {
    assert.equal(safeLinkHref(refused), null, `${refused} must not become an href`);
  }
});

await test("a refused target keeps the author's characters visible instead of dropping the link", () => {
  sameJson(parseInline("[click me](javascript:alert(1))"), [
    { kind: "text", text: "[click me](javascript:alert(1))" },
  ]);
  sameJson(parseInline("[docs](./docs/guide.md)"), [{ kind: "text", text: "[docs](./docs/guide.md)" }]);
});

await test("a fenced block is literal text and its contents are not parsed as markdown", () => {
  const blocks = parseReadmeBlocks("```\n# not a heading\n- not a bullet\n```\n");
  sameJson(blocks, [{ kind: "code", text: "# not a heading\n- not a bullet" }]);
});

await test("an unterminated fence is still text, not a dropped tail", () => {
  sameJson(parseReadmeBlocks("```\nnpm run dev"), [{ kind: "code", text: "npm run dev" }]);
});

await test("malformed input parses to nothing rather than throwing", () => {
  for (const input of [null, undefined, 42, true, {}, [], () => {}]) {
    sameJson(parseReadmeBlocks(input), [], `input ${String(input)} must degrade`);
    sameJson(parseInline(input), []);
  }
});

await test("a README that parses to nothing is distinguishable from a read failure", () => {
  // The page's rule: no blocks -> buttons only. Both of these produce zero blocks for different
  // reasons, and both are visible as different statuses before the parse.
  sameJson(parseReadmeBlocks("   \n\n\n"), []);
  sameJson(parseReadmeBlocks(""), []);
});

// ---------------------------------------------------------------------------
console.log("\nrenderer contract (source level)\n");

/**
 * Remove comments so a contract check reads code rather than prose.
 *
 * `//` is only treated as a comment start when whitespace precedes it, so a URL inside a string
 * cannot be mistaken for one.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");
}

await test("the README renderer never evaluates markup", () => {
  const source = stripComments(read("src/components/listing/ToolReadme.tsx"));
  assert.ok(!/dangerouslySetInnerHTML\s*[={]/.test(source), "no raw HTML sink in the README renderer");
  assert.ok(!source.includes("MdxServer"), "the README must not go through the MDX renderer");
  assert.ok(!/<script|<\/script|next\/script/.test(source), "no script element in the README renderer");
  assert.ok(!/<img\b/.test(source), "a README cannot produce an image element");
  assert.ok(!/\bstyle=/.test(source), "a README cannot set a style attribute");
});

await test("the panel renders the README only when blocks and a source URL both exist", () => {
  const panel = read("src/components/listing/ToolLaunch.tsx");
  assert.ok(
    /const inline = hasReadableBlocks\(readme\) && Boolean\(readmeSource\)/.test(panel),
    "the inline state must require parsed blocks AND the URL they were read from",
  );
  assert.ok(/\{inline \? \(/.test(panel), "the README is rendered inside the inline guard");
  assert.ok(/data-readme-state=\{state\}/.test(panel), "the three states are machine-visible");
});

await test("the launch panel describes the local toggle and external launch", () => {
  const panel = read("src/components/listing/ToolLaunch.tsx");
  assert.ok(
    !panel.includes("Nothing loads here until you choose to open it"),
    "the old sentence is false once a README renders and must not return",
  );
  assert.ok(
    panel.includes("Use here keeps the tool on this page; Open separately launches it in a new tab."),
    "the launch note must describe both available actions",
  );
  assert.ok(
    /const \[showEmbed, setShowEmbed\] = useState\(false\)/.test(panel),
    "the embed must be opt-in rather than mounted on initial render",
  );
  assert.ok(
    /aria-pressed=\{showEmbed\}/.test(panel) && /liveUrl && showEmbed/.test(panel),
    "the local-use state must be exposed and control iframe mounting",
  );
  assert.ok(
    /target="_blank" rel="noopener noreferrer"/.test(panel),
    "the external launch must open separately with the expected link boundary",
  );
});

console.log(
  `\ntool readme: ${passed}/${passed + failures.length} passed` +
    (failures.length ? `\n  failing: ${failures.join(", ")}` : ""),
);
if (failures.length) process.exitCode = 1;
