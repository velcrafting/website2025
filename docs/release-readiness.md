# Website Preview qualification

**Date:** 2026-09-21

**Branch:** `codex/hosted-editor-preview`

**Base:** `6a7a30bc444265cb3689c0b84f70152603bf2f1d`
**Review URL:** https://website2025-git-codex-hosted-edit-3bfe95-vels-projects-b80cff4a.vercel.app

**Verified Preview deployment:** `dpl_7veqKX447bAjFY55JCYbUi47Yxxi` — READY, source `20e459e8c1127c4831b0bf47975ea71d5cf0d057`, target Preview. Immutable URL: https://website2025-53ocfhuis-vels-projects-b80cff4a.vercel.app

## Candidate

The hosted-editor branch was integrated with the current Velcrafting site overlay from the original `main` checkout at `7374aa17c91cf40de13e807fa5af920b7d99c7ff`. The original checkout and its uncommitted work remain untouched. The Preview includes the current concept-03 site, its routes and assets, and the Postgres-backed editor implementation.

## Verification

- `npm run typecheck -- --incremental false` — passed.
- `npm run lint` — passed.
- `npm run build` — passed; Next generated the site, CMS, and middleware routes.
- The first Vercel build found `.next/cache/webpack` packs in filesystem-backed function traces and rejected `/admin/edit` at 313 MB. `next.config.ts` now excludes the generated `.next/cache` directory from function traces. The rebuilt local traces are 34.4 MiB for `/admin/edit`, `/admin/new`, and `/admin/newsletter`, and 33.9 MiB for `/api/cms/sync`; the MDX source files remain included. The current source deployed successfully to Vercel Preview (deployment above). Direct browser verification of the hosted page is gated by Vercel Authentication; the user with project access can open the Review URL.
- All 13 package test scripts passed, including the editor boundary, revision, approval, preview, and first-issue suites, plus the design checks.
- A production-mode local server was inspected in a browser. The current homepage rendered and its path selector changed content. The admin login and editor created a private draft from an excerpt of the existing `agentic-discovery.mdx` article; its saved revision preview rendered, and the draft stayed out of the public blog. The disposable local SQLite database passed `quick_check` and was removed after the test.
- `git diff --check` — passed.

## Hosted database state

The target is the new Supabase project `velcrafting-website` (`eeddvwszyhcrjbvmcpow`). Its three editor schema migrations are applied; all 11 editor tables are empty. The scoped `website_editor` role remains `NOLOGIN` and `NOBYPASSRLS`. No existing content was imported or overwritten. A database password is still required to enable and connect that service role, so hosted Postgres save/edit behavior has not yet been verified.

## Remaining boundaries

- Existing public blog posts remain file-backed MDX. The CMS article workflow creates private drafts and does not yet publish them to the public `/blog` pages. No live blog content was migrated; only a disposable local excerpt was used to verify saving and preview.
- No Production deployment or Production configuration was changed.
- `npm audit` reports two high findings in `toml` through `remark-mdx-frontmatter`, and one low finding in `diff`; npm reports no automatic fix for the high findings.
