# End-to-end acceptance and release evidence

Version 0.3 | 2026-11-10 | REVIEW DRAFT, PROPOSED TEST PLAN

## 1. Status and release gates

No application, provider, email, calendar, permission or deployment check in this document has been executed. These journeys define evidence required during implementation. Documentation review does not establish production readiness.

Record every result with scenario ID, commit, environment, date, tester, fixture identity, expected outcome, observed outcome and sanitized evidence. Keep tokens, raw client content and personal calendar details outside the public repository. Use these evidence statuses:

| Status | Meaning |
| --- | --- |
| Proposed | Specified here; not executed. This is every journey's current status. |
| Mock verified | Executed against controlled fixtures or provider substitutes; proves application behavior only. |
| Real verified | Executed through the actual configured service and intended access boundary, using authorized test identities. |
| Failed / blocked | Record the defect or unavailable capability and affected release gate. |

Mock evidence is sufficient for deterministic fault handling and component contracts. Actual OTP delivery, deployed authorization and storage isolation, provider metering, Calendar/Drive access and invitation delivery require real evidence before those capabilities launch. Real integration exercises can incur usage or send invitations, so schedule them only within the implementation authorization and explicitly selected test accounts. No production client is a test fixture.

## 2. Source contracts and fixtures

The linked specifications own their detailed acceptance rows. This document connects them into complete journeys without replacing those requirements.

| Contract | Acceptance families |
| --- | --- |
| [Public consulting](01-public-consulting.md) | PUB: exploration, generated components, brief and visitor actions |
| [Private workspace](02-private-workspace.md) | PW: engagement navigation, publication and operational usefulness |
| [Data, permissions and versions](03-data-permissions-and-versions.md) | DP: tenant isolation, identity, grants and immutable records |
| [AI observability](04-ai-observability-and-data.md) | AI, DATA: call evidence, limits, consent and retention |
| [Booking, export and follow-up](05-booking-export-and-follow-up.md) | BOOK, EXPORT, EMAIL: complete conversion and recovery |

Prepare fictional Clients Alpha and Beta, two Alpha projects, an earlier and current Alpha engagement, and one Beta engagement. Give each record distinctive sentinel text so leakage is observable. Actors are an anonymous visitor, two independent explorer sessions, a verified prospect with no membership, an Alpha viewer, an Alpha commercial viewer/authorized approver, a Beta viewer, a revoked stakeholder, a scoped staff publisher and the existing public-site editor role. Add an owner calendar and a separately controlled external visitor account for real booking checks.

Use draft, published and issued proposal revisions, a recorded agreement, an amendment, a restricted estimate, private files and booking-only files. Freeze the clock for export assertions. Control provider responses, storage failures, delayed jobs, network disconnects and webhook order in fixtures. Real account identifiers belong in protected test configuration.

## 3. Fifteen end-to-end journeys

### E2E-01: An abandoned first question remains reviewable

Show the recording/AI notice, submit one high-level question, then leave before email capture or a completed brief. Staff must find the session, one operation, its dispatched attempt, restricted input/output and available usage evidence. General analytics and another visitor cannot read the content. Verify the operation can later link to a conversion without rewriting its history. Gate: mock lifecycle plus real provider evidence. Covers PUB-05, AI-01 and DATA-01.

### E2E-02: Missing durable storage prevents a paid request

Fail persistence before dispatch. Assert zero provider requests, no invented usage, retained unsent input where feasible and a usable retry/contact path. Repeat with an unset production allowance and with concurrent requests competing for the last allowance. Atomic reservations must prevent overspending. Gate: mock faults and request-count evidence. Covers AI-02 and AI-06.

### E2E-03: Retries and disconnects preserve accounting

Replay the same action key, then force a genuine retry and a structure-repair call. Expect one operation with separate actual attempts. Disconnect the browser after dispatch and restart recovery. Resolve incomplete attempts from available evidence without assuming cancellation or zero cost. Check pending, estimated, verified and unavailable states, retaining subscription units separately from currency. Gate: mock interruptions plus one real metering sample. Covers AI-03 through AI-07 and PUB-12.

### E2E-04: Untrusted model output cannot acquire powers

Submit instructions requesting another client's data, hidden prompts, executable markup and an external action. Return malformed components and unauthorized action parameters from the provider fixture. The renderer rejects them, preserves the visitor's edits and offers recovery. No unauthorized retrieval, navigation, booking, publication or permission change occurs. Gate: mock hostile-input evidence. Covers PUB-03, PUB-10 and AI-08.

### E2E-05: Optional email claims only the current session

Explore without email, then request save/resume. Complete email-code verification while presenting that session's existing capability. Only its brief is claimed; another session with the same typed address remains inaccessible. Test incorrect, expired and replayed codes, resend limits and neutral account-discovery responses. Verified prospects receive no client memberships; client-host login does not provision them. Reminder consent stays separate and unchecked. Gate: mock boundaries plus real OTP delivery. Covers PUB-09, DATA-03 and DP-12.

### E2E-06: An incomplete brief exports deterministically

Create a partial revision containing unknowns, suggestions, visitor corrections and markup-like text. Export PDF, Markdown and copy with the provider unavailable. All reflect the same selected revision, readable headings and exploration status, without hidden notes or another inference call. Render the PDF to inspect pagination and selectable text. Prevent remote-resource fetching. A later edit does not alter the saved artifact/checksum; unauthorized downloads fail. Gate: mock artifact and access evidence. Covers PUB-06, EXPORT-01 and DP-14.

### E2E-07: A real booking completes the promised conversion

Schedule during exploration using the reviewed partial revision. Confirm one Cal booking maps to the intended Google Calendar event, with the owner as organizer/host and visitor invited, working Meet details, a literal private PDF attachment and separate agenda/notes attachment. Open both documents independently as owner and visitor; test an unrelated account is denied. Visitor viewing and owner editing suffice. Invitation delivery does not prove acceptance or attendance. Gate: real integration evidence mandatory. Covers PUB-07, PUB-08 and BOOK-02 through BOOK-04.

Also exercise the explicitly confirmed no-brief branch: Meet plus accessible notes, accurate No brief supplied status and no fabricated PDF. Send a valid webhook with missing/stale sharing confirmation and changed recipients; no private grant or attachment may occur until fresh authorization matches. Covers BOOK-09 and BOOK-10.

### E2E-08: Attachment failure does not duplicate a meeting

Fail Drive permission application, conference readiness or Calendar attachment patching after booking confirmation. Display the accurate pending state. Retry the preparation job using the same booking identity and recover one artifact set on the existing event. Preserve attendees and Meet details. A secure link alone cannot mark conversion complete. Gate: mock fault evidence followed by real recovered attachments. Covers BOOK-05, BOOK-07 and BOOK-08.

### E2E-09: Scheduling lifecycle survives webhook disorder

Deliver duplicate creation events, reschedule, cancel, then deliver the old creation again. Reject invalid signatures and reconcile current provider state before accepting stale transitions. Deliberately omit one webhook. Recovery must find the change, keep cancellation final unless the provider establishes a new booking, and preserve reschedule lineage. Verify attachments on the correct resulting event and revoke removed attendees' booking-derived file access. Gate: mock event permutations plus real reschedule/cancel verification. Covers BOOK-05 and BOOK-06.

### E2E-10: Recovery reminders respect current intent

Advance the clock past the approved reminder interval for a verified, opted-in unfinished inquiry. Before dispatch, separately book, confirm brief sharing for the meeting, withdraw consent, suppress or hard-bounce the contact. Each must prevent sending. Replay the eligible job and simulate an uncertain delivery timeout; reconcile the send identity without duplicate reminders. Expire retained content and confirm related queued follow-up is cancelled. Gate: mock policy and deduplication evidence; real sender delivery before enablement. Covers DATA-04, DATA-05 and EMAIL-01.

### E2E-11: Both experiences remain usable without motion

On narrow mobile and desktop, use keyboard only, zoom, a screen reader and reduced motion. Explore stages in any order, read purpose/contribution/output, edit a brief, export and reach scheduling. In the private workspace, sign in, find the next action, read prior updates and reach delivery. Focus survives regeneration; errors are announced; no animation conveys exclusive meaning. Exercise an engagement omitting Quote and an event-based update cadence. Gate: real rendered-interface evidence. Covers PUB-01, PUB-11, BOOK-01, PW-03 and PW-10.

### E2E-12: Tenant isolation holds beyond navigation

As Alpha, substitute Beta identifiers in direct routes, API bodies, query filters, RPC calls, file downloads, exports and job/stream references. Repeat anonymously, as a prospect and on public/default/preview host aliases. Test forged parent relationships and shared-cache replay between actors. No payload, metadata, search count or file sentinel leaks. Existing editor privileges grant no private access. Gate: database/API tests plus real deployed-boundary evidence. Covers DP-01 through DP-06, DATA-02 and PW-09.

### E2E-13: Revocation interrupts future access and pending work

Pause an authorized export/model job, revoke the stakeholder's grant and resume it with an unexpired session token. Recheck authorization before processing and delivery. Pages, APIs and authenticated files must deny access; another engagement's independent grant still works. Document any configured signed-link residual lifetime and that already downloaded files cannot be recalled. Test sign-out/session expiry separately from grant removal. Gate: mock race plus real access evidence. Covers DP-11 and PW-09.

### E2E-14: Publication respects audience and commercial access

Create from a private workflow template, save drafts and preview the exact audience. Race two edits and attempt stale publication. Preserve conflict handling and earlier updates. Issue a document composed from a shared revision and a separate restricted commercial revision. The ordinary viewer receives no price/estimate bytes through HTML, JSON, exports, attachments, notifications or model context. The commercial viewer sees only deliberately issued terms. AI failure must leave manual publishing usable. Gate: mock workflow plus real payload/access evidence. Covers PW-04, PW-07, PW-08, PW-12 and DP-07.

### E2E-15: Recorded agreement preserves the accepted baseline

Issue proposal v1, record external agreement by the authorized stakeholder and identify the staff recorder separately. An acknowledgment or unknown approver authority cannot establish acceptance. Create v2 and an amendment with separate evidence. Verify v1's scope, terms, checksum and evidence remain unchanged, while the current view identifies the baseline and accepted changes. Previous engagements remain distinct. Gate: persistence and immutability evidence. Covers PW-05, PW-06 and DP-08 through DP-10.

## 4. Implementation validation and sign-off

The reviewed [package manifest](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/package.json) provides `npm run lint`, `npm run typecheck` and `npm run build`; use these after implementation. It requires Node >=22.5. There is no generic `npm test` script. Existing focused scripts include `test:design-tokens`, `test:component-contracts`, `test:mutation-boundary` and `test:content-boundary`; run them when the changed surface affects their contracts, not as evidence of new tenant isolation.

Add targeted tests for the new boundaries and recovery paths above. Record their actual commands once implemented. Do not rerun unrelated suites to inflate evidence. Release requires resolved gate failures, the intended configuration verified, and the owner reviewing the real booking experience and publication workflow. This planning document supplies no passing results.
