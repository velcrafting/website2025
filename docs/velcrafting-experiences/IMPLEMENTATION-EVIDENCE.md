# Implementation evidence

Started November 10, 2026. Application base: `7a2da367d924c67133dce7a32daaafcbaf271480`.
Handoff: [PR #8](https://github.com/velcrafting/website2025/pull/8) at
`60b8381c593447f9c0b1c9cafea18cdbdcde2a29`. All 32 ZIP documents matched its Git
blobs byte for byte. Development is in an isolated checkout; the dirty original
checkout was left alone. No live integration is enabled.

| Slice / requirements | Implementation and evidence | Remaining gate |
| --- | --- | --- |
| Phase 0: source and dependency map | Next 15.5.25, React/DOM 19.1.0, npm lock, Node 22. Public root layout owns sidebar, mobile header, guided navigation and SEO; middleware currently guards the editorial admin. `src/config/site.ts` owns contact and Cal destinations. | Reserve `/client-workspace` for private routes. When adding them, move the public chrome/SEO into a public route group and put the private shell in its own group, sharing only HTML, typography and theme. Gate the internal namespace and client-host aliases before data access. No private route or host rewrite exists yet. |
| Phase 0: renderer choice | npm registry reports `@json-render/react@0.22.0` requires React `^19.2.3`. `src/consulting/catalog.ts` uses the native React fallback with a typed, text-only catalog. No manifest or lock change. | Extend the catalog deliberately when connecting model output; invalid actions, markup and external destinations stay out. |
| PUB-01, PUB-02, PUB-04, PUB-11 / E2E-11 (public portion) | Node 22 production build served on loopback at [the review URL](http://127.0.0.1:3128/consulting). Playwright Chromium exercised all six stages out of order by keyboard with visible focus. Checked wide editor/brief columns at 1600px, stacked brief at 390px, reflow at 320px, CSS zoom at 200%, reduced motion and a JavaScript-disabled context. Software and communications questions are distinct fixtures. | No assistive-device test or live model evaluation. |
| PUB-03, PUB-06, PUB-09, PUB-10 / E2E-06 (local portion) | Browser saved a partial fictional brief as v2, kept a typed correction across service navigation, retained unknowns, downloaded PDF and Markdown with the selected version in the filename and copied the exact text. Poppler extracted and rendered the one-page PDF, including the accent and literal markup in the test correction. Node tests cover stale edits, deterministic bytes and invalid catalog payloads. | Browser state is transient. No verified resume, server export or share grant. Built-in PDF font supports Windows-1252; text outside it keeps its original characters in Markdown/copy. Unicode font support is required before broad PDF release. |
| PUB-07, PUB-08 / BOOK-01, BOOK-03, BOOK-09, BOOK-10 | Existing Cal destination verified in the rendered link; no brief data in its URL. Booking preparation and client sign-in show unavailable states. | Cal/Google account, exact event lookup, Meet, both intended participants, private literal PDF and notes attachments and recipient access have not been exercised. Explicit no-brief must still attach notes. |

Checks on the public slice: Node 22 `npm run lint`, `npm run typecheck --
--incremental false`, `npm run build`, `npm run test:design-tokens` (81/81),
`npm run test:component-contracts` (14/14), and
`node --test tests/consulting/brief.test.mjs` (3/3). The browser run used the
production build with no live integration credentials or real records.

Phase 2 starts in a separate stacked candidate. The files under `db/postgres`
are local schema candidates, not applied hosted migrations. The application
does not connect to these tables or expose a private route.

| Requirement | Local evidence | Remaining gate |
| --- | --- | --- |
| DP-01–06, DP-08, DP-11 (SQL portion) | Applied both candidate SQL files to disposable PGlite Postgres 0.5.16. SQL ran as two fictional authenticated stakeholders, an identity with no grants, anonymous, editorial and service roles. Direct queries could not read another tenant, an ungranted phase, restricted terms, or AI content. A commercial grant exposed only its own terms. Cross-tenant foreign keys and snapshot updates failed. Revoking membership cut access with the same test identity and did not restore old grants when membership was reinstated. | JWT, OTP, Supabase Data API, direct file access, private route, scoped staff mutations, exact draft publication, agreement evidence and background job authorization still need implementation and real integration checks. |
| E2E-01–03 (fixture portion) | The dispatcher entered a fictional transport only after the input, operation, reserved attempt and dispatch marker were readable after closing and reopening a file-backed database. Duplicate submissions, unavailable allowance, busy sessions, storage failure and unknown commit acknowledgement did not dispatch. An interrupted attempt retained pending cost; fixture output was stored separately with cost unavailable. | No live adapter or provider credentials. Account catalog must confirm DeepSeek v4.1 Flash on Command Code's Provider API. Verify limits, streaming, response/usage fields, retention, rate/concurrency limits, atomic reservation on real Postgres and reconciliation before enabling. Retry and repair dispatch are disabled in this slice; each future physical attempt requires its own record. |

To rerun the SQL evidence, use a local unpacked PGlite 0.5.16 entrypoint and set
`VELCRAFTING_PGLITE_MODULE` to its absolute `dist/index.js` path, then run
`node --test tests/consulting/postgres-boundaries.test.mjs` under Node 22. The
suite creates its own temporary store; it does not accept a remote database
URL. The test auth roles and provider response are fixtures. For the real
schema, keep it out of the Supabase Data API by default and review grants/RLS
separately ([Supabase guidance](https://supabase.com/docs/guides/api/securing-your-api)).
The [Command Code documentation](https://commandcode.ai/docs/provider) describes
the compatible endpoint, but is not proof of this account's model access.

A separate local booking contract slice exercises BOOK-03, BOOK-09 and
BOOK-10 **with fixtures only**. A resolved event and verified contact must
match the stored confirmation version, intended recipients and booking
reference. Readiness requires Meet, both participants' observed private
Drive access and literal Calendar attachments for the exact brief revision
and prepared notes. Explicit no-brief plans require notes without a PDF.
Three Node tests cover stale consent, wrong event/recipient, missing
attachments, wrong brief revision/integrity, missing access and the no-brief
path. The contract has no Cal or Google client, webhook, durable worker,
share mutation or booking endpoint. These tests do not pass real BOOK-03.
