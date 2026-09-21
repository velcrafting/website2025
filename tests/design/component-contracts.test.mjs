// tests/design/component-contracts.test.mjs
//
// Smallest useful regression checks for behaviours that a source-level assertion can
// protect cheaply, required by CODEX_REFRESH_REVIEW.md findings 1 and 4.
//
// These are CONTRACT checks on source text, not rendering tests. They exist so the
// specific regressions that were reported cannot silently return:
//
//   - the Drawer losing focus restoration or rendering its title outside the panel;
//   - the mutation harness going back to a catch-all stub that would hide a missing
//     authentication check;
//   - a date surface bypassing the shared policy and rebuilding its own Date.
//
// Rendering, keyboard behaviour and the real menu are verified in the browser; see the
// run receipt. This file is deliberately not a substitute for that.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("\ncomponent contracts\n");

// --- Drawer: focus restoration --------------------------------------------
const drawer = read("src/components/ui/Drawer.tsx");
check(
  "Drawer accepts a returnFocusTo ref",
  /returnFocusTo\??:\s*RefObject<HTMLElement \| null>/.test(drawer),
  "the trigger lives in the caller, so Radix cannot restore focus without it"
);
check(
  "Drawer restores focus on close",
  /onCloseAutoFocus/.test(drawer) && /event\.preventDefault\(\)/.test(drawer),
  "without preventDefault Radix focuses its non-existent Trigger and focus falls to <body>"
);
check(
  "Drawer still provides the accessible title",
  /<Dialog\.Title/.test(drawer),
  "Radix warns and screen readers lose the panel name without a title"
);

// --- Drawer: the title must sit inside the panel surface ------------------
check(
  "the panel carries the surface background",
  /bg-surface/.test(drawer.split("<Dialog.Title")[0]),
  "the surface class was previously on an inner div, so the visible title rendered on whatever was behind the panel"
);

// --- MobileHeader: the trigger is wired ------------------------------------
const header = read("src/components/layout/MobileHeader.tsx");
check(
  "MobileHeader holds a ref on the menu trigger",
  /triggerRef/.test(header) && /ref=\{triggerRef\}/.test(header),
  "the ref must be attached to the element that opens the drawer"
);
check(
  "MobileHeader passes returnFocusTo to the Drawer",
  /returnFocusTo=\{triggerRef\}/.test(header),
  "otherwise focus does not come back to the menu button"
);

// --- Mutation harness: the stub is narrow ---------------------------------
const transform = read("tests/editor/_transform.mjs");
check(
  "the component stub is an explicit allowlist",
  /PRESENTATION_STUBS/.test(transform),
  "a prefix-matched catch-all stub can hide a real import failure"
);
check(
  "an unknown component import throws",
  /unexpected @\/components import from a mutating module/.test(transform),
  "unknown imports must fail loudly rather than be silently stubbed"
);
check(
  "the harness still stubs the admin guard",
  /if \(req === "@\/lib\/admin"\)/.test(transform),
  "the auth double is what the boundary assertions depend on"
);
check(
  "the auth double still denies without a matching cookie",
  /requireAdmin/.test(transform) && /Unauthorized/.test(transform),
  "the demonstrated auth-failure detection must be preserved"
);

// --- Date policy: one implementation --------------------------------------
const card = read("src/components/listing/ContentCard.tsx");
const caseStudy = read("src/components/layout/CaseStudyLayout.tsx");
check(
  "the list uses the shared date policy",
  /formatDateOnly/.test(card) && !/new Date\(frontmatter\.date\)/.test(card),
  "rebuilding a Date from a date-only string reintroduces the timezone shift"
);
check(
  "the detail uses the shared date policy",
  /formatDateOnly/.test(caseStudy) && !/new Date\(frontmatter\.date\)/.test(caseStudy),
  "the list and the detail must agree"
);

// --- Progress: the migration claim must match the file --------------------
const progress = read("src/components/ui/Progress.tsx");
check(
  "Progress is actually Radix-backed",
  /@radix-ui\/react-progress/.test(progress),
  "docs/components.md previously claimed this migration while the file was still the neutral-palette version"
);
check(
  "Progress uses tokens, not the retired palette",
  !/neutral-/.test(progress),
  "the retired neutral palette must not reappear"
);

console.log(`\ncomponent contracts: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log(`failures:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
