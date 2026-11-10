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
