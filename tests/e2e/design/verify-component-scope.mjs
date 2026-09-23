// tests/e2e/design/verify-component-scope.mjs
//
// The static token suite checks a fixed list of files. That list cannot tell you
// whether those files are the ones the pages actually render — which is how
// ContactForm/NewsletterForm/ContentCard stayed unmigrated while the suite passed.
//
// This script resolves the REAL named-import graph from the S07–S10 entry points
// and reports every source file that is actually reached. It then asserts that no
// reached component still carries the retired colour values.
//
// Named imports are followed through barrels (e.g. `import { Input } from
// "@/components/ui"`) using the barrel's own export list, so an unmigrated module
// that merely sits next to a migrated one in the same directory is not counted as
// reached, and a migrated module is not missed because it is re-exported.
//
// Evidence class: fixture / static analysis (no browser).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve as pathResolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Entry points of the S07–S10 milestone. The root layout is included because the
// shell (rail, mobile header, theme control) renders on every one of these pages.
const ENTRIES = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/connect/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/about/page.tsx",
  "src/app/projects/page.tsx",
  "src/app/projects/[slug]/page.tsx",
  "src/app/issues/page.tsx",
  "src/app/issues/[slug]/page.tsx",
  "src/app/blog/[[...slug]]/page.tsx",
  "src/app/tools/page.tsx",
  "src/app/tools/[slug]/page.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/blog/page.tsx",
  "src/app/admin/components/page.tsx",
  "src/app/admin/edit/page.tsx",
  "src/app/admin/login/page.tsx",
  "src/app/admin/new/page.tsx",
  "src/app/admin/newsletter/page.tsx",
  "src/app/admin/editor/page.tsx",
  "src/app/admin/editor/[id]/page.tsx",
  // NOT an entry: src/app/art/** . The 2026 refresh contract keeps Art and its
  // components in the separate arcade planning scope, so it is deliberately outside
  // this checker's coverage rather than forgotten. If Art is brought into the
  // migrated surfaces, add it here so its subtree is walked.
];

// The retired concept-02 colour references. `neutral-\d` is the legacy ramp,
// `text-white` / `bg-black` are the retired hard-coded contrast values, and a
// literal hex is a page-specific colour that bypasses the token layer.
const RETIRED = /neutral-\d|text-white|bg-black|#[0-9a-fA-F]{3,6}\b/;

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

const CANDIDATE_SUFFIXES = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveFile(fromFile, spec) {
  let base = null;
  if (spec.startsWith("@/")) base = pathResolve(REPO, "src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = pathResolve(dirname(fromFile), spec);
  if (!base) return null;
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// import { A, B as C } from "x"   |   import D from "x"   |   import "x"
function parseImports(source) {
  const out = [];
  const re = /import\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const clause = m[2] ?? "";
    const spec = m[3] ?? m[4];
    const named = [];
    let hasDefault = false;
    const braceMatch = /\{([\s\S]*?)\}/.exec(clause);
    if (braceMatch) {
      for (const part of braceMatch[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) named.push(name);
      }
    }
    const beforeBrace = clause.replace(/\{[\s\S]*?\}/, "").replace(/,\s*$/, "").trim();
    if (beforeBrace && !beforeBrace.startsWith("*")) hasDefault = true;
    out.push({ spec, named, hasDefault });
  }
  return out;
}

// Map a barrel's exported names to their source modules.
function barrelExports(barrelFile) {
  const source = readFileSync(barrelFile, "utf8");
  const map = new Map();
  const re = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    for (const part of m[1].split(",")) {
      const [orig, alias] = part.trim().split(/\s+as\s+/).map((s) => s.trim());
      if (!orig) continue;
      map.set(alias || orig, m[2]);
    }
  }
  const star = /export\s*\*\s*from\s*["']([^"']+)["']/g;
  while ((m = star.exec(source)) !== null) {
    const target = resolveFile(barrelFile, m[1]);
    if (target) {
      for (const [name, mod] of barrelExports(target)) map.set(name, mod);
    }
  }
  return map;
}

const reached = new Map(); // absPath -> set of "imported as" labels
const unresolved = []; // local-looking specifiers the resolver could not follow
const depthLimited = []; // edges cut by the depth guard

function isLocalSpec(spec) {
  return spec.startsWith("@/") || spec.startsWith("./") || spec.startsWith("../");
}

function walk(absFile, via, depth = 0) {
  if (depth > 12) {
    depthLimited.push(`${via} (depth ${depth})`);
    return;
  }
  if (!absFile || !absFile.startsWith(pathResolve(REPO, "src"))) return;
  const existing = reached.get(absFile);
  if (existing) {
    existing.add(via);
    return;
  }
  reached.set(absFile, new Set([via]));

  const source = readFileSync(absFile, "utf8");
  for (const { spec, named, hasDefault } of parseImports(source)) {
    const direct = resolveFile(absFile, spec);
    if (!direct) {
      // An external package is expected to miss. A local-looking specifier is not:
      // silently skipping it would make this graph proof incomplete, so it is
      // recorded and the run fails.
      if (isLocalSpec(spec)) {
        unresolved.push(`${relative(REPO, absFile)} → ${spec}`);
      }
      continue;
    }

    const isBarrel = /\/index\.tsx?$/.test(direct);
    if (isBarrel && (named.length || hasDefault)) {
      const exports = barrelExports(direct);
      for (const name of named) {
        const target = exports.get(name);
        const targetAbs = target ? resolveFile(direct, target) : null;
        if (!targetAbs) {
          unresolved.push(`${relative(REPO, absFile)} → ${spec}:${name} (not exported by the barrel)`);
          continue;
        }
        walk(targetAbs, `${relative(REPO, absFile)} → ${spec}:${name}`, depth + 1);
      }
      if (hasDefault && !named.length) walk(direct, `${relative(REPO, absFile)} → ${spec}`, depth + 1);
      continue;
    }
    walk(direct, `${relative(REPO, absFile)} → ${spec}`, depth + 1);
  }
}

console.log("\ncomponent reachability from the S07–S10 entry points\n");

for (const entry of ENTRIES) {
  const abs = pathResolve(REPO, entry);
  if (!existsSync(abs)) {
    check(`entry point ${entry} exists`, false);
    continue;
  }
  walk(abs, entry);
}

const componentFiles = [...reached.keys()].filter((abs) => abs.includes("/src/components/"));
check(
  "the import walk reached the shared component layer",
  componentFiles.length >= 8,
  `reached ${componentFiles.length} component files`,
);
check(
  "the walk used named imports through barrels (dependency check is not inert)",
  [...reached.values()].some((vias) => [...vias].some((v) => v.includes(":Input") || v.includes(":Button"))),
  "no barrel-resolved component was reached",
);
// A graph proof is only complete if every local edge was followed. Report the
// edges the resolver could not follow instead of skipping them silently.
check(
  "every local import edge was resolved",
  unresolved.length === 0,
  unresolved.length ? `unresolved: ${unresolved.join(", ")}` : "",
);
check(
  "no import edge was cut by the depth guard",
  depthLimited.length === 0,
  depthLimited.length ? `depth-limited: ${depthLimited.slice(0, 5).join(", ")}` : "",
);

console.log(`\n  reached ${reached.size} source files; components:`);
for (const abs of componentFiles.sort()) {
  const vias = [...(reached.get(abs) ?? [])].slice(0, 2).join("; ");
  console.log(`    ${relative(REPO, abs)}   (${vias})`);
}

console.log("");
for (const abs of componentFiles.sort()) {
  const source = readFileSync(abs, "utf8");
  const match = RETIRED.exec(source);
  check(
    `reached component ${relative(REPO, abs)} uses tokens`,
    match === null,
    match ? `found "${match[0]}"` : "",
  );
}

// Informational: components in the ui layer that the in-scope pages do NOT render.
const unmigrated = [];
const uiDir = pathResolve(REPO, "src/components");
const walkDir = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = pathResolve(dir, entry.name);
    if (entry.isDirectory()) walkDir(full);
    else if (/\.tsx?$/.test(entry.name)) {
      if (!reached.has(full) && RETIRED.test(readFileSync(full, "utf8"))) {
        unmigrated.push(relative(REPO, full));
      }
    }
  }
};
if (existsSync(uiDir)) walkDir(uiDir);
console.log(
  `\n  note ${unmigrated.length} component file(s) still on the legacy palette but NOT reached by these surfaces:`,
);
for (const rel of unmigrated.sort()) console.log(`    ${rel}`);

console.log(`\nverify-component-scope: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
