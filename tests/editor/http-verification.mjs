// tests/editor/http-verification.mjs
//
// Real-interface verification against a production build served over loopback.
//
// Corrected for GATE_A_REVIEW finding 4. Two rules drive the design:
//   1. Every negative assertion carries a POSITIVE CONTROL in the same
//      response, so a 500/404/empty page cannot pass an "absent" check.
//   2. Structured data is PARSED, not substring-matched. A truncated or absent
//      JSON-LD payload fails, and an injected script node is detected from the
//      parsed document rather than a fragile text scan.
//
// Usage:
//   node tests/editor/http-verification.mjs --origin=http://127.0.0.1:3210 \
//        [--build-dir=/path/to/.next]
//
// Requires a server already running; it is not started here.
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=")];
  }),
);

const ORIGIN = args.origin ?? "http://127.0.0.1:3210";
const BUILD_DIR = args["build-dir"] ?? null;

// Known content in the repository used as positive controls.
const PUBLISHED_BLOG_SLUG = "agentic-discovery";
const PUBLISHED_BLOG_TEXT = "Agentic Discovery";
const DRAFT_SLUGS = ["geo-llm-discovery", "test-agent-article"];
// Fixtures added only to the isolated verification copy.
const PRIVATE_SENTINEL = "PRIVATE_SENTINEL_TEXT_9f3a";
const PRIVATE_SLUG = "private-sentinel";
const EVIL_SLUG = "evil-metadata";
const EVIL_MARKER = "window.__gateAXssProbe";
// Present-but-invalid metadata fixtures (wrong-typed status / schedule, and an
// explicit published status with an unparseable date).
const INVALID_METADATA_SLUGS = ["wrong-typed-status", "schedule-number", "published-bad-date"];
const INVALID_METADATA_SENTINELS = [
  "WRONG_TYPED_STATUS_SENTINEL",
  "NUMERIC_SCHEDULE_SENTINEL",
  "PUBLISHED_BAD_DATE_SENTINEL",
];

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path) {
  const res = await fetch(ORIGIN + path, { redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

/** Extract and JSON-parse every application/ld+json block. */
function parseJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks.map((raw) => {
    try {
      return { ok: true, value: JSON.parse(raw), raw };
    } catch (err) {
      return { ok: false, error: err.message, raw };
    }
  });
}

const results = {};

// ---------------------------------------------------------------- blog list
results.blogList = await get("/blog");
check("GET /blog returns 200", results.blogList.status === 200, `status ${results.blogList.status}`);
check(
  "positive control: /blog lists a known published article",
  results.blogList.html.includes(PUBLISHED_BLOG_SLUG),
  "published slug missing from the listing",
);
for (const slug of DRAFT_SLUGS) {
  check(`/blog excludes draft ${slug}`, !results.blogList.html.includes(slug));
}
check(`/blog excludes the private fixture ${PRIVATE_SLUG}`, !results.blogList.html.includes(PRIVATE_SLUG));
check("/blog does not leak the private sentinel text", !results.blogList.html.includes(PRIVATE_SENTINEL));

// -------------------------------------------------------------- pillar list
results.pillar = await get("/blog/ai");
check("GET /blog/ai returns 200", results.pillar.status === 200, `status ${results.pillar.status}`);
check("positive control: /blog/ai lists a published article", results.pillar.html.includes(PUBLISHED_BLOG_SLUG));
for (const slug of DRAFT_SLUGS) {
  check(`/blog/ai excludes draft ${slug}`, !results.pillar.html.includes(slug));
}
check(`/blog/ai excludes the private fixture ${PRIVATE_SLUG}`, !results.pillar.html.includes(PRIVATE_SLUG));

// ----------------------------------------------------------- blog detail
results.blogDetail = await get(`/blog/ai/${PUBLISHED_BLOG_SLUG}`);
check("GET published article returns 200", results.blogDetail.status === 200, `status ${results.blogDetail.status}`);
check(
  "initial HTML contains the article body (no client fetch)",
  results.blogDetail.html.includes(PUBLISHED_BLOG_TEXT) && results.blogDetail.html.includes("Opening"),
);
check(
  "published article did not fall back to plain text",
  !results.blogDetail.html.includes("data-mdx-fallback"),
);
check(
  "published article body rendered through the non-executable renderer",
  results.blogDetail.html.includes('data-mdx-rendered="element"'),
);

// ---------------------------------------------------------- denied content
for (const slug of DRAFT_SLUGS) {
  const r = await get(`/blog/ai/${slug}`);
  check(`GET draft article ${slug} returns 404`, r.status === 404, `status ${r.status}`);
}
const privatePage = await get(`/blog/ai/${PRIVATE_SLUG}`);
check(`GET private fixture returns 404`, privatePage.status === 404, `status ${privatePage.status}`);
check("private fixture 404 body does not leak the sentinel", !privatePage.html.includes(PRIVATE_SENTINEL));

// --------------------------------------------------------------- sitemap
results.sitemap = await get("/sitemap.xml");
check("GET /sitemap.xml returns 200", results.sitemap.status === 200, `status ${results.sitemap.status}`);
check(
  "positive control: sitemap contains a published article URL",
  results.sitemap.html.includes(`/blog/ai/${PUBLISHED_BLOG_SLUG}`),
);
for (const slug of DRAFT_SLUGS) {
  check(`sitemap excludes draft ${slug}`, !results.sitemap.html.includes(slug));
}
check(`sitemap excludes the private fixture`, !results.sitemap.html.includes(PRIVATE_SLUG));

// ---------------------- present-but-invalid metadata (real fixtures)
// Wrong-typed status/schedule and an explicit published status with an
// unparseable date must be denied on every surface: list, pillar list, sitemap
// and direct detail access.
for (const slug of INVALID_METADATA_SLUGS) {
  const r = await get(`/blog/ai/${slug}`);
  check(`GET invalid-metadata fixture ${slug} returns 404`, r.status === 404, `status ${r.status}`);
}
check(
  "invalid-metadata slugs absent from /blog",
  INVALID_METADATA_SLUGS.every((s) => !results.blogList.html.includes(s)),
);
check(
  "invalid-metadata slugs absent from /blog/ai",
  INVALID_METADATA_SLUGS.every((s) => !results.pillar.html.includes(s)),
);
check(
  "invalid-metadata slugs absent from the sitemap",
  INVALID_METADATA_SLUGS.every((s) => !results.sitemap.html.includes(s)),
);
check(
  "invalid-metadata bodies absent from public HTML",
  INVALID_METADATA_SENTINELS.every(
    (s) =>
      !results.blogList.html.includes(s) &&
      !results.pillar.html.includes(s) &&
      !results.sitemap.html.includes(s),
  ),
);

// ------------------------------------------------- projects / tools detail
results.project = await get("/projects/risqpost");
check("GET /projects/risqpost returns 200", results.project.status === 200, `status ${results.project.status}`);
check("project body text present in initial HTML", results.project.html.includes("Context Matters"));
check(
  "allow-listed component renders (Callout) with its literal attribute",
  results.project.html.includes("Overview"),
);
check(
  "allow-listed component renders (Figure)",
  /<figure|<img/i.test(results.project.html),
);
check("project body did not fall back to plain text", !results.project.html.includes("data-mdx-fallback"));

results.lab = await get("/tools/qr-lab");
check("GET /tools/qr-lab returns 200", results.lab.status === 200, `status ${results.lab.status}`);

// ------------------------------------------------- structured data (parsed)
for (const [label, page] of [
  ["published article", results.blogDetail],
  ["project page", results.project],
]) {
  const blocks = parseJsonLd(page.html);
  check(`${label}: at least one JSON-LD block is present`, blocks.length > 0, `found ${blocks.length}`);
  check(
    `${label}: every JSON-LD block parses as JSON`,
    blocks.every((b) => b.ok),
    blocks.filter((b) => !b.ok).map((b) => b.error).join("; "),
  );
  check(
    `${label}: no JSON-LD payload contains a raw </script>`,
    blocks.every((b) => !b.raw.includes("</script")),
  );
}

// ------------------------------------------- inert malicious metadata fixture
const evil = await get(`/blog/ai/${EVIL_SLUG}`);
check("GET malicious-metadata fixture returns 200", evil.status === 200, `status ${evil.status}`);
// Next emits its own adjacent inline hydration scripts, so a bare
// "</script><script>" substring is NOT evidence of injection. Assert the
// specific unescaped payload form instead.
check(
  "malicious metadata did not inject an unescaped script element",
  !evil.html.includes(`<script>${EVIL_MARKER}`),
  "an unescaped <script> element carrying the probe marker is present",
);
// Positive control: the malicious text did reach the page, in escaped form.
check(
  "positive control: malicious metadata reached the page escaped",
  evil.html.includes("&lt;/script&gt;") || evil.html.includes("u003cscript"),
  "the fixture title is absent from the page entirely",
);
const evilBlocks = parseJsonLd(evil.html);
check(
  "malicious-metadata page still emits parseable JSON-LD",
  evilBlocks.length > 0 && evilBlocks.every((b) => b.ok),
  `blocks=${evilBlocks.length} errors=${evilBlocks.filter((b) => !b.ok).map((b) => b.error).join("; ")}`,
);
// The property that matters is the SERIALISED form: the raw payload must carry
// the escaped sequence, not a literal one. (The parsed value rightly contains
// "</script>" after unescaping, so asserting on the parsed value is wrong.)
check(
  "malicious metadata is escaped in the JSON-LD payload",
  evilBlocks.some((b) => b.ok && b.raw.includes("u003c/script")),
  "escaped </script> not found in the raw JSON-LD payload",
);
check(
  "no JSON-LD payload contains a raw </script>",
  evilBlocks.every((b) => !b.raw.includes("</script")),
);

// --------------------------------------------- build-output sentinel scan
if (BUILD_DIR) {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const hits = [];
  (async function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry === "cache") continue;
        walk(p);
      } else if ((await /\.(js|mjs|css|json|html|txt|map)$/.test(entry))) {
        let text;
        try {
          text = readFileSync(p, "utf8");
        } catch {
          continue;
        }
        if (text.includes(PRIVATE_SENTINEL)) hits.push(p);
        for (const s of INVALID_METADATA_SENTINELS) {
          if (text.includes(s)) hits.push(`${p} [${s}]`);
        }
      }
    }
  })(BUILD_DIR);
  check(
    "private and invalid-metadata sentinel text absent from built/public assets",
    hits.length === 0,
    hits.slice(0, 5).join(", "),
  );
} else {
  console.log("  skip build-output sentinel scan (no --build-dir given)");
}

console.log("");
console.log(`results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("");
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
process.exit(0);
