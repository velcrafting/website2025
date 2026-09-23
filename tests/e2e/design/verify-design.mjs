// tests/e2e/design/verify-design.mjs
//
// Gate C / S07–S10 real-interface verification.
//
// Runs against a REAL production build on a loopback port and checks the served
// HTML and CSS: the concept-03 tokens are actually shipped, the retired patterns
// are absent, /connect's honest controls are honest, and the reading surfaces
// carry no draft leakage.
//
// What this does NOT do: judge whether the design looks right. That is a human
// review, and the browser checks (browser-design-check.mjs) only add measurable
// facts (overflow, contrast, focus), not taste.
//
// Evidence class: real interface (HTTP against a production build).

import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const ORIGIN = args.get("origin") ?? "http://127.0.0.1:3410";
// Optional: a database to check for a planted draft. Never opened for writing.
const DB_PATH = args.get("db") ?? null;

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function note(message) {
  console.log(`  note ${message}`);
}

async function get(path) {
  const response = await fetch(`${ORIGIN}${path}`, { cache: "no-store", redirect: "manual" });
  return { status: response.status, text: await response.text(), headers: response.headers };
}

console.log(`\ndesign verification against ${ORIGIN}\n`);

// ---------------------------------------------------------------- smoke routes
// /contact is deliberately NOT in this list. Under D1 (docs/implementation_plan_Sep16.md
// §4 / §12) connect and contact were consolidated into one page: /connect survives and
// /contact is a permanent redirect, so a "returns 200" assertion here would be asserting
// the two-surface information architecture that was removed. The redirect is asserted on
// its own below and /connect — the surviving destination — is in this list.
const routes = ["/", "/connect", "/projects", "/blog", "/issues", "/tools", "/about"];
for (const route of routes) {
  const page = await get(route);
  check(`GET ${route} returns 200`, page.status === 200, `status ${page.status}`);
}

// ---------------------------------------------------------------- D1: the redirect
const contact = await get("/contact");
const contactLocation = contact.headers.get("location") ?? "";
check(
  "GET /contact is a permanent (308) redirect to /connect",
  contact.status === 308 && /\/connect\/?$/.test(contactLocation),
  `status ${contact.status}, location "${contactLocation}"`,
);

// ---------------------------------------------------------------- /connect content
const connect = await get("/connect");
check("the identity pairing is present", connect.text.includes("Steven Pajewski"));
check("the alias is present", /call me\s*(<em>)?Vel/i.test(connect.text));
check(
  "the notebook line is present",
  connect.text.includes("A notebook for things"),
);
check("the locality line is present", connect.text.includes("Spring + The Woodlands, TX"));
check(
  "the primary contact action downloads the vCard",
  /href="\/steven-pajewski\.vcf"[^>]*download/.test(connect.text) ||
    (/href="\/steven-pajewski\.vcf"/.test(connect.text) && connect.text.includes("download")),
);
check("a canonical URL is emitted for /connect", /<link rel="canonical" href="[^"]*\/connect"/.test(connect.text));
check("Open Graph metadata is emitted", /property="og:title"/.test(connect.text) && /property="og:url"/.test(connect.text));

// Honest unavailable actions: labelled, never a placeholder link.
// Scheduling: the booking destination is verified (cal.com/spajewski/30min
// resolves to Steven's public 30-minute page), so it is offered as a real link.
check(
  "the scheduling action links the verified booking page",
  /href="https:\/\/cal\.com\/spajewski\/30min"/.test(connect.text),
);
check(
  "no third-party booking embed loads on first paint",
  !/<iframe[^>]*(cal\.com|calendly|savvycal)/i.test(connect.text),
);
// Community: still unavailable, and the state must be visible without a click.
check("no discord invite link is rendered", !/href="[^"]*discord/i.test(connect.text));
check(
  "the unavailable state is visible before any interaction",
  /Not open yet/i.test(connect.text),
);
check(
  "the unavailable explanation is in the page, not behind a disclosure",
  /community space is not open/i.test(connect.text) && !/<details/.test(connect.text),
);
check(
  "no internal setup language is shown to readers",
  !/has not been supplied|not verified as a public destination|no private bot channel/i.test(
    connect.text,
  ),
);
check("no fabricated counts appear", !/\b\d+\s*(members|followers|subscribers)\b/i.test(connect.text));
check("sharing is stated to be optional", /Sharing is optional/i.test(connect.text));

// D1: the message form is the single primary action, and it is reachable without a
// mouse (the primary control is in the page, not behind a disclosure). The count is
// taken over rendered class attributes only — the same string also appears inside the
// RSC flight payload, where counting it would double-count.
const primaryButtons = connect.text.match(/class="[^"]*btn-primary[^"]*"/g) ?? [];
check(
  "exactly one primary action is rendered on /connect",
  primaryButtons.length === 1,
  `found ${primaryButtons.length}`,
);
// REPLACED BEHAVIOUR (2026-09-16, Phase 8.2 — docs/implementation_plan_Sep16.md §13.2).
// These checks used to assert that the message form was /connect's primary action and was served in
// the page body. Steven removed that form deliberately: "send a message i wonder if we should just
// have it be the email/mailto: button in the side bar?" The newsletter is now the page's single
// primary action, so the checks below assert THAT, and they check the primary's own markup rather
// than words that merely appear somewhere on the page. An earlier version of this check matched the
// string "Save my contact" anywhere in the page and passed for the wrong reason: the real primary
// was a disabled Discord button. Do not weaken this back into a text search.
check(
  "that primary action is the newsletter subscribe",
  primaryButtons.length === 1 && /class="[^"]*btn-primary[^"]*"[^>]*>Subscribe</.test(connect.text),
  primaryButtons[0] ?? "no primary button found",
);
check(
  "the newsletter is served on /connect in its own labelled block",
  /Join Vel, and be a Crafter/.test(connect.text) && />Subscribe</.test(connect.text),
);
check(
  "the message form is gone from /connect, replaced by the sidebar mailto",
  !/name="message"/.test(connect.text) && /mailto:/.test(connect.text),
);

// ---------------------------------------------------------------- vCard
const vcf = await get("/steven-pajewski.vcf");
check("the vCard is served", vcf.status === 200, `status ${vcf.status}`);
const vcfType = vcf.headers.get("content-type") ?? "";
check(
  "the vCard is served with a vCard media type (not text/html)",
  /vcard/i.test(vcfType),
  `content-type was "${vcfType}"`,
);
check("the vCard contains a well-formed card", vcf.text.includes("BEGIN:VCARD") && vcf.text.includes("END:VCARD"));
check("the vCard carries the public identity fields", ["FN:Steven Pajewski", "NICKNAME:Vel", "ORG:Velcrafting"].every((f) => vcf.text.includes(f)));
check(
  "the vCard carries no invented phone or email",
  !/^TEL|^EMAIL/m.test(vcf.text),
);

// ---------------------------------------------------------------- tokens in the shipped CSS
const hrefs = [...connect.text.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
check("the page ships a stylesheet", hrefs.length > 0, `found ${hrefs.length}`);
let css = "";
for (const href of hrefs) {
  const sheet = await get(href.startsWith("http") ? href.replace(ORIGIN, "") : href);
  css += sheet.text;
}
if (css) {
  for (const token of ["#eae5d8", "#3c5749", "#735b80", "#f4f0e6", "#2f2c32"]) {
    check(`the shipped CSS contains token ${token}`, css.toLowerCase().includes(token));
  }
  check("the retired dark default is not shipped", !css.includes("#141414"));
  check(
    "the body background is the flat parchment token",
    /body\{[^}]*background-color:var\(--background\)/.test(css),
    "body does not paint the flat token background",
  );
  // Honest scope note, not a pass: decorative radial-gradient blooms still ship
  // for pages outside S07–S10 (and transitively through the /contact form
  // components). Listed as a known gap in GATE_C_AUDIT_HANDOFF.md.
  const bloomCount = (css.match(/radial-gradient/g) || []).length;
  note(`decorative radial-gradient rules still shipped: ${bloomCount} (out-of-scope components; see known gaps)`);
  check("focus-visible styling is shipped", css.includes("focus-visible"));
  check("reduced-motion styling is shipped", css.includes("prefers-reduced-motion"));
  check("the measure token is shipped", /--measure-prose\s*:\s*6[0-9]ch/.test(css));
} else {
  check("stylesheets were fetched for token inspection", false);
}

// ---------------------------------------------------------------- shell + leakage
check("the skip link is served on /connect", connect.text.includes('href="#main"'));
check("main carries the skip target", /id="main"/.test(connect.text));
check("the shell no longer locks the viewport", !/antialiased h-dvh overflow-hidden/.test(connect.text));

// Draft exclusion. Two things are needed for this to mean anything:
//   1. a positive control, proving the fetch/assert machinery can see text at all;
//   2. a planted sentinel that actually exists as a draft, so the negative result
//      cannot come from a database that simply has no drafts in it.
const positiveControl = connect.text.includes("Steven Pajewski") && connect.text.includes("<html");
check(
  "the leak detector can read served HTML (positive control)",
  positiveControl,
  "the candidate string was not found in the response, so a negative result would be vacuous",
);

const DRAFT_SENTINEL = "DRAFT_LEAK_SENTINEL_9f3a";
const publicRoutes = ["/", "/connect", "/projects", "/contact", "/blog", "/issues", "/tools", "/about"];
let sentinelSeen = 0;
for (const route of publicRoutes) {
  const page = await get(route);
  if (page.text.includes(DRAFT_SENTINEL)) sentinelSeen += 1;
}
check(
  `no draft sentinel appears on any of the ${publicRoutes.length} public routes`,
  sentinelSeen === 0,
  `found on ${sentinelSeen} route(s)`,
);

let plantedSlug = null;
if (DB_PATH) {
  const { DatabaseSync } = nodeRequire("node:sqlite");
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    const row = db
      .prepare(
        `SELECT i.slug FROM content_revisions r
           JOIN content_items i ON i.id = r.item_id
          WHERE r.blocks LIKE ? AND i.published_revision_id IS NULL
          LIMIT 1`,
      )
      .get(`%${DRAFT_SENTINEL}%`);
    plantedSlug = row ? String(row.slug) : null;
  } finally {
    db.close();
  }

  // This script is read-only: it does NOT plant the draft. Without a planted
  // draft the negative result is unproven, so that is a failure, not a note.
  check(
    "a planted draft exists, so the exclusion is actually testable",
    Boolean(plantedSlug),
    "no draft containing the sentinel was found. Seed one on the fixture server first: " +
      "node tests/e2e/design/seed-draft-sentinel.mjs --origin=<fixture origin> --admin-key=<key> --db=<fixture db>",
  );

  if (plantedSlug) {
    const planted = await get(`/issues/${plantedSlug}`);
    check(
      `the planted draft (${plantedSlug}) is not publicly reachable`,
      planted.status === 404,
      `status ${planted.status}`,
    );
    check(
      "the planted draft's sentinel is absent from every public route",
      sentinelSeen === 0,
    );
  }
} else {
  note(
    "no --db supplied: the exclusion is NOT proven by this run. Provide a fixture database that contains a planted draft (see seed-draft-sentinel.mjs).",
  );
}

console.log(`\nverify-design: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
