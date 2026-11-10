# Implementation evidence

The application started at `7a2da367`. The ZIP matched all 32 files in
[handoff PR #8](https://github.com/velcrafting/website2025/pull/8) at `60b8381`.
The implementation is in the isolated checkout. None of these PRs activates
a live service or applies a hosted migration.

| Slice | What works and evidence | Still open |
| --- | --- | --- |
| [#9 public](https://github.com/velcrafting/website2025/pull/9), `2997eee`, phases 0–1, PUB-01/03/06/07/11, EXPORT-01, E2E-06/11 | Six nonlinear stages and editable partial briefs. A separate Cal tab receives neither the brief nor the opener/referrer. Saved and unsaved work survives refresh and a fresh history return with BFCache disabled. Chromium covered keyboard, desktop and mobile reflow, 2× viewport zoom, reduced motion, no JS, and an actual PDF download. PDFKit + pinned OFL Noto fonts rendered three selectable pages. Poppler verified extraction of Latin names, combining accents, Greek, Cyrillic, Japanese, shaped Devanagari, and a 1,120-character token. | RTL scripts, unsupported characters and emoji explicitly fall back to exact Markdown/copy. The worker cannot record a selected-brief meeting ready without a correct PDF. |
| [#10 identity, workspace and ledger](https://github.com/velcrafting/website2025/pull/10), `952e3ff`, phases 2/3/5, DP-01–12/14, AI-01–08, E2E-01–05/12–15 | `004–006` and `008` define named setup from four templates, separate client and engagement grants, explicit progress updates, draft/issued revisions, commercial projection, exact agreement records and protected downloads. A native PostgreSQL 18.6 + Chromium run with a loopback Auth stand-in exercised setup, progress, the workspace route and a private download, alternate hosts, revocation, exact publication and agreement, and a current-session-only prospect claim. PGlite covered the SQL boundary and restart/retention cases. A separate native test observed competing connections block on the last allowance unit and verified one claim. The real browser/Next shaping route sent one request through the AI SDK to a controlled Command Code HTTP stand-in. The stand-in read the committed claim before replying; the app saved usage and verified that a model suggestion came from the same exploration. | Hosted Supabase Auth, role provisioning and delivery, production domains, account model ID and metering, retention schedule, named provisioner bootstrap and release review. The browser test used a local Auth stand-in; it does not verify hosted OTP or Storage policies. |
| [#11 booking](https://github.com/velcrafting/website2025/pull/11), phases 4–5, BOOK-02/04–10, E2E-07–09, DP-13 | `007`, signed webhook receipts, Cal lookup, durable jobs and Google adapters connect the local path. A current confirmation and verified contact must still match before each mutation and ready. A complete app-managed registry reconciles superseded PDFs and booking-derived grants; notes update only the managed agenda range. Ten booking and one intake PGlite / controlled HTTP tests covered replays, a missed cancellation, lost file acknowledgment, stale authorization, no-brief cleanup and read-back evidence. With a local confirmed-booking fixture, Chromium also reviewed the exact shared brief and imported selected visitor statements into a private Discovery draft without publishing or granting access. | Real BOOK-03: correct Cal event and organizer calendar, Meet, owner/visitor participation, literal PDF and notes, both participants opening both private files. Controlled visitor OAuth content probes are required for this implementation to mark ready; a grant response alone is insufficient. |

The prior review's Windows-1252-only renderer and transient-state fallback are
superseded. Session storage stays on the browser tab; server persistence begins
only with an explicit save/share/send action. No reminder or newsletter is
enrolled by verification. The client host never relies on the public admin key. Staff forms are
disabled before hydration so their private fields cannot land in a default GET URL.
AI expiry clears raw submitted, context and output payloads and duplicate
digests independently of accounting. A separately saved brief remains an
explicit revision, subject to its own retention policy.

## Reproduce

Use Node 22 and the committed lockfile. Install Chromium with
`npx playwright install chromium`, or set `CONSULTING_CHROMIUM_PATH` to a local
Chromium executable. PDF verification needs Poppler (`pdftotext`, `pdfinfo`,
`pdffonts`, `pdftoppm`).

- `npm run test:consulting:export`: deterministic revision and rendered PDF
  checks, with fictional PDF, page renders and extracted text under
  `CONSULTING_PDF_ARTIFACTS` when set.
- Run `npm run dev -- --hostname 127.0.0.1 --port 3139`, then
  `npm run test:consulting:browser`. Set `CONSULTING_BROWSER_ARTIFACTS` for the
  screenshots, downloadable fixture exports and commit receipt. Cal is intercepted.
- `npm run test:consulting:postgres` uses locked PGlite 0.5.16 by default.
  To include real concurrency, point `VELCRAFTING_NATIVE_PG_BIN` at PostgreSQL
  18's `bin` directory. On Apple Silicon a reproducible isolated binary is
  `npm pack @embedded-postgres/darwin-arm64@18.6.0-beta.19`; extract the
  verified npm tarball outside the repo and use `package/native/bin`.
  The harness starts a disposable server; never point the tests at a remote DB.
- With the same native binary, run `npm run test:consulting:workspace-browser`.
  It starts a disposable local Postgres and Auth stand-in on loopback, tests
  the actual Next workspace and shaping routes and the booking-to-draft
  import. Auth and Command Code are loopback stand-ins, and the booking is
  a seeded provider observation. Retain sanitized artifacts using
  `VELCRAFTING_WORKSPACE_ARTIFACTS`. It runs no hosted services.
- `npm run test:consulting:connected-browser` launches a loopback fixture with
  the real routes rendered and consulting API requests intercepted. It tests
  the recording notice, idempotency, visitor edits, optional OTP, exact
  sharing and withdrawal without a database credential or any provider call.
- `npm run test:consulting:ai` and `npm run test:consulting:booking` run the
  adapter and persistence checks with controlled responses. A test response,
  Vercel preview or successful build is not production verification.

## Next actions

1. **Phase 2/5, DP-01/05/11/14:** In an owner-designated development Supabase
   project, review and apply `004–009` in order, bootstrap a named provisioner, and configure the dedicated
   `velcrafting_runtime` login as NOINHERIT with no ownership/bypass role (use TLS with `sslmode=verify-full` for remote DB access),
   and keep `velcrafting_private` off the Data API. Verify invite-only client
   OTP, separate prospect provisioning, actual logout/revocation and direct
   file denial for two controlled users. The auth code follows
   [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/nextjs).
   Needs the development project, test users, sender and migration authorization.
   Disable the auth flags and revoke only the temporary test credentials if
   verification fails. Do not change the existing editorial database.
2. **Phase 3, AI-01/02/04/06/07:** Confirm the entitled account exposes
   `deepseek/deepseek-v4.1-flash` through
   [Command Code's Provider API](https://commandcode.ai/docs/provider).
   Adopt a payload lifetime and authorize one small fictional request
   (one reserved allowance unit, at most 750 output tokens, no retry).
   Enable bounded maintenance only for the designated development environment.
   Confirm the attempt, request ID, actual returned model and usage in the
   ledger. Stop after the first request and disable the flag; reconcile an
   ambiguous attempt from provider evidence without replaying it.
3. **Phase 4, BOOK-03/05/06/09/10:** Authorize a controlled Cal event type
   (starting candidate: the existing 30-minute link), the opaque
   `velcraftingIntent` field, signed webhook and designated Google calendar
   and test participants. Run a selected-brief test and an explicit no-brief
   test only with authorized recipients. Verify the actual literal PDF and
   notes, Meet and read access from both accounts. Without proof, leave
   preparation pending; on failure disable reconciliation, inspect durable
   receipts and remove only app-owned artifacts or grants after authorization.
