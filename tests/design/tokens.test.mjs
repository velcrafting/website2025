// tests/design/tokens.test.mjs
//
// Gate C / S07–S10 acceptance for the concept-03 design foundation.
//
// These are static checks over the actual source and the built CSS/tokens. They
// cannot judge whether the design looks good — that is a human review — but they
// do prove the token layer is real, the approved values are used, the retired
// concept-02 patterns are gone, and the shell no longer traps scrolling.
//
// Evidence class: fixture / static analysis (no browser).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
function read(rel) {
  const abs = pathResolve(REPO, rel);
  if (!existsSync(abs)) throw new Error(`missing file: ${rel}`);
  return readFileSync(abs, "utf8");
}
function suite(name) {
  console.log(`\n${name}`);
}

const globals = read("src/app/globals.css");
const layout = read("src/app/layout.tsx");

// The concept-03 palette, exactly as approved in VELCRAFTING_DESIGN_PRINCIPLES.md.
const PRIMITIVES = {
  "--parchment": "#eae5d8",
  "--paper-raised": "#f4f0e6",
  "--ink": "#2f2c32",
  "--forest": "#3c5749",
  "--violet": "#735b80",
  "--lavender-wash": "#e3dce6",
  "--muted-ink": "#625c65",
  "--rule": "#bbb3a5",
  "--plum-dark": "#392f3d",
  "--white": "#ffffff",
};

suite("S07: concept-03 token layer");

for (const [token, value] of Object.entries(PRIMITIVES)) {
  const pattern = new RegExp(`${token}\\s*:\\s*${value}\\s*;`, "i");
  check(`primitive ${token} is defined as ${value}`, pattern.test(globals));
}

for (const [role, primitive] of [
  ["--background", "--parchment"],
  ["--surface", "--paper-raised"],
  ["--foreground", "--ink"],
  ["--muted", "--muted-ink"],
  ["--link", "--violet"],
  ["--accent", "--forest"],
]) {
  check(
    `semantic role ${role} maps to ${primitive}`,
    new RegExp(`${role}\\s*:\\s*var\\(${primitive}\\)`, "i").test(globals),
  );
}

check(
  "the Tailwind theme exposes the concept colours as utilities",
  ["--color-ink", "--color-forest", "--color-violet", "--color-rule", "--color-paper"].every((key) =>
    globals.includes(key),
  ),
);

check(
  "the spacing scale is 4/8/12/16/24/32/48/64",
  ["--space-1: 4px", "--space-2: 8px", "--space-3: 12px", "--space-4: 16px", "--space-5: 24px", "--space-6: 32px", "--space-7: 48px", "--space-8: 64px"].every(
    (line) => globals.replace(/\s+/g, " ").includes(line),
  ),
);

check(
  "radii are 4–6px (no pill/rounded-2xl surface look)",
  globals.includes("--radius-chip: 4px") && globals.includes("--radius-surface: 6px"),
);

check(
  "the reading measure is 60–70 characters",
  /--measure-prose:\s*6[0-9]ch/.test(globals),
);

check(
  "motion is limited to 120–180ms state feedback",
  ["--motion-fast: 120ms", "--motion-base: 160ms", "--motion-slow: 180ms"].every((line) =>
    globals.replace(/\s+/g, " ").includes(line),
  ),
);

suite("S07: interaction contract");

check("a visible focus-visible outline is defined", globals.includes(":focus-visible"));
check("focus uses the accent ring token", globals.includes("rgb(var(--ring))"));
check("reduced motion is honoured", globals.includes("prefers-reduced-motion"));
check("a skip link primitive exists", globals.includes(".skip-link"));
check("primary and secondary buttons exist", globals.includes(".btn-primary") && globals.includes(".btn-secondary"));
check("buttons declare a 48px design target", globals.includes("min-height: 48px"));
check("compact controls keep a 44px minimum", globals.includes("min-height: 44px"));
check("form fields share one primitive", globals.includes(".field"));
check("a hero/page title scale is tokenised", globals.includes("--step-h1") && globals.includes("--step-h2"));

suite("S07: retired concept-02 patterns are gone");

check(
  "the brooding dark background is no longer the default",
  !/:root\s*\{[^}]*--background:\s*#141414/i.test(globals),
  "found #141414 as a default --background",
);
check(
  "the decorative radial-gradient blooms are removed",
  !globals.includes("radial-gradient"),
);
check(
  "the rainbow gradient border is retired",
  !globals.includes("card-hover-gradient"),
  "card-hover-gradient still present",
);
check(
  "no oversized 'Vel.' brand block class remains",
  !globals.includes("brand-block"),
);
check(
  "the retired neutral-* ramp is not remapped globally (it would break chrome)",
  !/--color-neutral-100/.test(globals),
);
check("a dark override still exists for the theme toggle", /html\.dark\s*\{/.test(globals));

suite("S07: shell uses ordinary document scrolling");

check(
  "the viewport is no longer locked",
  !/className="antialiased h-dvh overflow-hidden"/.test(layout),
  "body still locks the viewport",
);
check(
  "main is not a nested scroll container",
  !/h-dvh overflow-y-auto/.test(layout),
  "main still scrolls internally",
);
check("the skip link is rendered in the shell", layout.includes('className="skip-link"') && layout.includes('href="#main"'));
check("main carries the skip target id", /id="main"/.test(layout));
check(
  "the approved serif and sans are loaded as CSS variables",
  layout.includes("--font-source-serif") && layout.includes("--font-source-sans"),
);
check(
  "the rail is sticky rather than a fixed-height scroll region",
  layout.includes("sticky top-0"),
);

suite("S08–S10: surfaces use tokens, not page-specific values");

const RETIRED_IN_SURFACES = /neutral-\d|text-white|bg-black|#[0-9a-fA-F]{3,6}\b/;
const SURFACES = [
  "src/app/page.tsx",
  "src/app/connect/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/projects/page.tsx",
  "src/app/issues/page.tsx",
  "src/app/issues/[slug]/page.tsx",
  "src/components/home/HomePathSelector.tsx",
  "src/components/connect/ShareButton.tsx",
  "src/components/connect/UnavailableAction.tsx",
  "src/components/layout/Sidebar.tsx",
  "src/components/layout/MobileHeader.tsx",
  "src/app/admin/editor/page.tsx",
  "src/app/admin/editor/[id]/page.tsx",
  "src/editor/render/styles.ts",
];

for (const rel of SURFACES) {
  const source = read(rel);
  const match = RETIRED_IN_SURFACES.exec(source);
  check(
    `${rel} has no retired colour values`,
    match === null,
    match ? `found "${match[0]}"` : "",
  );
}

// The /contact page renders the shared contact forms, which still import the
// bloom-bearing Card. Recorded as a known gap rather than passed off as done.
check(
  "the retired bloom components are not imported directly by the re-themed pages",
  !/from "@\/components\/ui\/Card"|about\/highlight|ui\/testimonials|ui\/HeroRipple/.test(
    SURFACES.map((rel) => read(rel)).join("\n"),
  ),
);
// Components reached by the in-scope pages that were migrated in this pass.
// Before this pass several of these were listed as "out of scope", which
// understated the gap: they render inside /contact, /projects and /blog.
const MIGRATED_COMPONENTS = [
  "src/components/contact/ContactForm.tsx",
  "src/components/contact/NewsletterForm.tsx",
  "src/components/contact/ScheduleEmbed.tsx",
  "src/components/listing/ContentCard.tsx",
  "src/components/ui/Button.tsx",
  "src/components/ui/Input.tsx",
  "src/components/ui/ThemeProvider.tsx",
  "src/components/ui/ThemeToggle.tsx",
  "src/components/layout/Sidebar.tsx",
  "src/components/layout/MobileHeader.tsx",
].filter((rel) => existsSync(pathResolve(REPO, rel)));

for (const rel of MIGRATED_COMPONENTS) {
  const source = read(rel);
  const match = RETIRED_IN_SURFACES.exec(source);
  check(`${rel} is migrated to tokens`, match === null, match ? `found "${match[0]}"` : "");
}

// Genuinely out of scope: present in the repo but NOT rendered by any in-scope
// page. tests/e2e/design/verify-component-scope.mjs walks the real named-import
// graph and proves which files are actually reachable, rather than assuming.
const OUT_OF_SCOPE_DECOR = [
  "src/components/ui/Card.tsx",
  "src/components/ui/testimonials.tsx",
  "src/components/about/highlight.tsx",
  "src/components/ui/HeroRipple.tsx",
  "src/components/projects/ProjectKPISection.tsx",
  "src/components/writing/WritingKPISection.tsx",
].filter((rel) => existsSync(pathResolve(REPO, rel)));
console.log(
  `  note components present but not reached by the S07–S10 surfaces: ${OUT_OF_SCOPE_DECOR.join(", ")}`,
);

suite("S08: /connect honesty rules");

const connect = read("src/app/connect/page.tsx");
check("the required identity copy is present", connect.includes("Steven Pajewski") && connect.includes("call me"));
check("the primary contact action downloads the vCard", connect.includes('href="/steven-pajewski.vcf"') && connect.includes("download"));
check("the vCard asset exists", existsSync(pathResolve(REPO, "public/steven-pajewski.vcf")));
check(
  "unavailable destinations are labelled, not linked",
  connect.includes("UnavailableAction") &&
    !/href="https?:\/\/(calendar|cal\.com|discord)/i.test(connect),
);
// "No fabricated counts" is only meaningful if the detector can actually see a
// count. The narrow original pattern required the number to precede the noun and
// covered four nouns; this one is broader and is proven against planted samples
// first, so a pass cannot come from a pattern that matches nothing.
const COUNT_PATTERN =
  /\b\d[\d,]*\s*(?:members|followers|subscribers|issues|readers|customers|clients|downloads|users)\b|\b(?:members|followers|subscribers|issues|readers|users)\s*[:=]\s*\d/i;
check(
  "the fabricated-count detector matches planted samples (positive control)",
  COUNT_PATTERN.test("Join 12,000 members today") &&
    COUNT_PATTERN.test("subscribers: 4200") &&
    COUNT_PATTERN.test("Trusted by 38 clients"),
);
check("no fabricated counts are rendered on /connect", !COUNT_PATTERN.test(connect));
check("social links come from the site config", connect.includes("SITE.links.linkedin") && connect.includes("SITE.links.github"));
check("sharing is explicitly optional", /Sharing is optional/i.test(connect));
// The 440px measure is an ACTION-GROUP constraint, never a page wrapper. The check
// that used to sit here was a substring test for "container-connect" — which a comment
// mentioning the class satisfies, so it stayed green even with the defect it named (the
// whole desktop page rendering at 440px). These two assert the actual structure.
check(
  "the connect action column derives its measure from the token",
  connect.includes("var(--measure-connect)"),
);
check(
  "the /connect page wrapper is the shared shell, not the 440px action measure",
  /return \(\s*<div className="container-page/.test(connect) &&
    !/return \(\s*<div className="[^"]*container-connect/.test(connect),
);

const vcf = read("public/steven-pajewski.vcf");
check("the vCard carries a name, nickname, org and URL", ["N:", "FN:", "NICKNAME:", "ORG:", "URL:"].every((field) => vcf.includes(field)));
check("the vCard carries no invented private contact fields", !/TEL|EMAIL/i.test(vcf));

suite("S09: project index vocabulary");

const projects = read("src/app/projects/page.tsx");
check("status is stated in words", projects.includes("Local-only — not publicly hosted"));
// Both markers must exist before their order means anything: `indexOf` returns -1
// for a missing marker, and -1 < anything would pass this check vacuously.
const provesAt = projects.indexOf("What it proves");
const stackAt = projects.indexOf("project.stack.map");
check(
  "purpose precedes the stack list",
  provesAt >= 0 && stackAt >= 0 && provesAt < stackAt,
  `provesAt=${provesAt} stackAt=${stackAt}`,
);
check("an unlinked project says so rather than showing a dead link", projects.includes("No public link yet"));

console.log(`\ndesign tokens: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
