import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { plugin as shadcn } from "@shadcn/lint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * Component files that still use the retired neutral ramp and are NOT reachable from any
 * real route (verified by `tests/e2e/design/verify-component-scope.mjs`, which prints this
 * set). They are named individually rather than excluded by pattern so the remaining debt
 * lives in one visible list that shrinks by migrating or deleting a file — not by widening
 * a glob. Migrate one, delete its line.
 */
const LEGACY_UNCONSUMED = [
  "home/Hero.tsx",
  "home/LatestStrip.tsx",
  "projects/ProjectCard.tsx",
  "writing/WritingCard.tsx",
  "ui/CopyToClipboard.tsx",
  "ui/DataTable.tsx",
  "ui/HeroRipple.tsx",
  "ui/Modal.tsx",
  "ui/Separator.tsx",
  "ui/Skeleton.tsx",
  "ui/Steps.tsx",
  "ui/Tabs.tsx",
  "ui/ThumbnailFrame.tsx",
  "ui/Tooltip.tsx",
  "ui/testimonials.tsx",
];

const eslintConfig = [
  // Globally ignore these paths so they never reach the linter.
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "tests/**",
    ],
  },
  // bring in Next defaults
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // disable the img lint rule
      "@next/next/no-img-element": "off",
    },
  },
  // ---------------------------------------------------------------------------
  // @shadcn/lint — design-system rules (docs/2026-refresh.md §7).
  //
  // Rolled out incrementally. `no-restyle` is the first rule: it stops a caller
  // from restyling a shared control with className, and its diagnostic names the
  // component, the offending class and the variant to use instead. Start with a
  // layout allowance, because page composition legitimately sets margin, gap and
  // width from the caller.
  //
  // Deliberately NOT enabled yet, so each omission is a decision rather than an
  // oversight:
  //   no-inline-styles    — the contact form uses token-valued inline styles;
  //                         account for those before a global ban.
  //   no-raw-colors       — components outside the migrated surfaces still use
  //                         the retired neutral palette. Enable per-directory as
  //                         each surface is migrated, not globally.
  //   no-arbitrary-values — the shared token vocabulary uses arbitrary forms on
  //                         purpose (e.g. p-[var(--space-4)]); replacing that
  //                         vocabulary is a separate, reviewable change.
  // ---------------------------------------------------------------------------
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      // Component definitions are where appearance belongs; the rule targets
      // consumers.
      "src/components/ui/**",
      // Editorial blocks are referenced by authoring syntax, not composed by hand.
      "src/components/mdx/**",
    ],
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/components/ui",
        note: "Shared components own their appearance. Compose layout from the caller, and put reusable appearance in tokens or variants (docs/2026-refresh.md §4).",
      },
    },
    rules: {
      "shadcn/no-restyle": [
        "error",
        {
          allow: ["layout"],
        },
      ],
    },
  },
  // ---------------------------------------------------------------------------
  // no-raw-colors — raw palette values (bg-pink-500, text-neutral-700 …).
  //
  // ENABLED for `src/app/**` and `src/components/**`, with two documented exclusions:
  //
  //   1. `src/app/art/**` — OUTSIDE THIS ASSIGNMENT. Art is kept in its own planning
  //      scope (see docs/2026-refresh.md §6 and the arcade proposal), so migrating it is
  //      not this package's work. It was briefly migrated by mistake and reverted.
  //   2. The unconsumed legacy component files listed in LEGACY_UNCONSUMED above — named
  //      individually so the remaining debt is a visible list that shrinks by migrating or
  //      deleting a file, never by widening a glob.
  //
  // Scope history: the rule was widened in two steps rather than switched on globally —
  // `src/components/**` first, then `src/app/**`, which reported 135 violations in 14
  // files and all were migrated. It is now clean in scope.
  //
  // KNOWN COVERAGE LIMITS — "0 violations" means "clean where the rule looks", not
  // "token-clean". It inspects className / style / SVG fill contexts; it does NOT inspect
  // string literals assigned to variables or CSS files. `src/styles/prose.css` holds
  // syntax-highlighting hexes that no rule covers.
  //
  // NOT enabled at all, by decision: `no-arbitrary-values` (the shared token vocabulary
  // uses arbitrary forms deliberately and justifiably, e.g. p-[var(--space-4)]) and
  // `no-inline-styles` (the contact form uses token-valued inline styles).
  // See docs/components.md.
  // ---------------------------------------------------------------------------
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "src/components/mdx/**",
      // Outside the assignment: Art keeps its own planning scope for the Bouncing Universe surface.
      // Updated 2026-09-16: the arcade now exists at src/app/arcade and is built entirely from the
      // shared components (Card, Badge, Button, Drawer) with the site's own palette and no raw colour.
      // When Art's scope is picked up, /arcade is the worked example of that migration — so this
      // exclusion should not be read as "art cannot be migrated".
      "src/app/art/**",
      // The unconsumed legacy files, named individually so the remaining debt is a
      // visible list that shrinks by migrating or deleting a file.
      ...LEGACY_UNCONSUMED.map((f) => `src/components/${f}`),
    ],
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/components/ui",
        note: "Use a theme token (bg-paper-raised, text-muted, border-rule, bg-warn-fill …). Raw palette values belong in globals.css as primitives (docs/2026-refresh.md §3).",
      },
    },
    rules: {
      "shadcn/no-raw-colors": "error",
    },
  },
];

export default eslintConfig;