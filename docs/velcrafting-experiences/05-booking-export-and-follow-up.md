# Brief export, meeting conversion and follow-up

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** REVIEW DRAFT, IMPLEMENTATION HANDOFF  
This document authorizes no account connections, invitations, email sends, bookings or production configuration changes.

## 1. Outcome and boundary

A visitor can book a conversation while shaping an idea, export the current brief, and receive a calendar invitation containing Google Meet details, a private brief PDF attachment and a prepared agenda/notes document. The meeting includes the visitor and Velcrafting's owner. Invitations do not establish that somebody accepted, joined or attended.

A visitor can explicitly choose to book without a brief. That branch requires Meet and the prepared notes document, records that no brief was supplied and never fabricates a brief PDF. Whenever a brief is selected, the literal PDF attachment remains mandatory for complete preparation.

The repository already points to `https://cal.com/spajewski/30min` and `steven@velcrafting.com` in `src/config/site.ts`. Reuse this scheduling relationship. Its active account, event configuration, Google connection, API access and subscription capabilities remain unverified. Do not infer these from the URL.

The first complete release includes exports, booking during exploration, reliable brief correlation, private meeting documents, confirmation status and optional consented recovery reminders. Calendar sync, document access and real invitation delivery are launch gates. A mocked booking or a secure link without an attachment does not fulfill the complete requirement.

## 2. Visitor interaction

Keep **Schedule a conversation** visible beside the working brief and reachable on mobile without covering content. It works before the brief is complete. A visitor can also use the existing scheduling route without AI assistance.

Opening the booking flow offers a short review:

> Bring this brief to our conversation. Review what will be shared, confirm your email and choose a time. Unanswered questions are welcome.

Allow edits and removal of sensitive content before creating an immutable `brief_revision`. Label partial briefs “Working brief”; do not manufacture missing requirements. Record explicitly if somebody books with no brief. The scheduler must not require another model call to proceed.

Show the visitor's timezone, date, time, organizer and invitee address before confirmation. Use the scheduler's availability and conflict rules. Additional guests are optional and explicitly named; never infer authorized guests from an email domain. Confirm who will receive each document. A changed invitee address must be verified before it inherits private brief access.

Email capture is optional before booking. Offer **Save my progress** after useful progress, with a visible skip. Separate saving, verification and reminder consent. Do not hide booking or downloading behind a marketing opt-in. Booking necessarily collects the contact details required for its invitation.

## 3. Export contract

Offer **Download PDF**, **Download Markdown** and **Copy brief**. Generate these deterministically from the selected revision. Exporting, copying, opening the scheduler and changing display controls should not consume AI calls. Browser print is a useful fallback; the target release also needs a reproducible PDF artifact for the calendar attachment.

Include the brief title, revision/date, stated goals, current context, selected service areas, constraints, known inputs, open questions and proposed discussion agenda. Distinguish visitor statements from suggested options and unresolved assumptions. Include: “This is a discussion brief. Scope, pricing and commitments are confirmed after review.” Do not generate prices, guarantees or timelines.

Exclude internal assessment, other visitors' information, raw prompts, provider diagnostics, credentials, unrestricted conversation logs and hidden notes. Use accessible headings, readable print layout and descriptive filenames. Sanitize rendered Markdown/HTML and prevent user content from triggering external resource fetches during PDF generation.

Private server exports require authorization on every download. Temporary download URLs are short-lived and excluded from analytics and referrers. A local download belongs to the visitor's device; revocation cannot recall a file already downloaded. Retain the exported revision and artifact checksum so the meeting attachment can be traced to what was reviewed.

## 4. Scheduling architecture

### Reuse Cal.com as the booking owner

Keep one system responsible for availability, booking, cancellation and rescheduling. Start with Cal.com's supported embed or API, choosing the smallest path that can carry an opaque booking correlation ID. Its booking API supports metadata, configured booking-field answers and guests. Do not put the brief, authentication tokens or confidential answers in URL parameters. Verify `leadEnrichmentOptOut` semantics and set the opt-out explicitly where supported; this project does not require third-party lead enrichment. [1]

Cal documents Google Calendar connection and Google Meet location configuration for automatic Meet creation. Verify these on the intended owner/event type before claiming readiness. Do not activate plan-dependent platform components solely to obtain an embed. [2]

### Literal attachments require an additional integration

Cal's current references endpoint is `GET /v2/bookings/{bookingUid}/references?type=google_calendar`. It returns `eventUid` and `destinationCalendarId`; the reviewed documentation specifies API version `2026-02-25` and OAuth `BOOKING_READ`. In an authorized integration spike, prove those references resolve to the correct Google Calendar event. Never assume Cal's booking UID, an iCalendar UID and Google's event ID are interchangeable. [3]

Use the owner's authorized Google connection to create a private PDF and a separate agenda/notes document in Drive, grant named recipient access, then attach them to that existing event. Google Calendar supports Drive attachments with `supportsAttachments=true`. Adding an attachment does not itself grant the guests permission to read its file. [4][5]

Use least-privilege OAuth scopes suited to the implementation, including app-created-file access where feasible. Keep refresh tokens server-side in protected storage. Do not default to domain-wide delegation or public Drive sharing. Verify external recipients can open the files under the owner's Workspace policy.

If the Cal-to-Calendar mapping or authorized attachment update is unavailable, pause this integration milestone. Choose a supported Cal integration or explicitly approved single-provider replacement. Do not create a second Calendar event to work around missing access. A secure brief link can be shown as a degraded fallback, clearly marked **“Attachment pending”**, but cannot pass full conversion acceptance.

### Booking sequence

1. The server creates `booking_intent`, bound to the current `explorer_session`, authorized `prospect_contact` if present, and proposed `brief_revision` or no-brief choice. The fixed `confirm_booking_share` action records the exact material choice, revision, intended recipients, confirmation time and idempotency key. With a selected brief it establishes `shared_for_booking`. An explicit no-brief choice establishes `no_brief_confirmed`. The reference sent to Cal is opaque and does not authorize access to the brief.
2. The visitor reviews their problem before opening Cal. The handoff includes only the displayed problem summary as the `notes` booking field and, when meeting preparation is configured, the opaque reference. The review explains that the summary is in the booking URL and may appear on the invite. Full-brief sharing is a separate choice and uses the exact authorized revision. The visitor selects a slot and confirms in Cal. Validate metadata and invitee data server-side. A browser callback can display pending confirmation, but only an authoritative provider result establishes a booking. [Cal booking fields](https://site.cal.com/features/booking-questions)
3. A verified provider webhook and authoritative booking lookup establish the provider booking UID, event type, host, invitees, lifecycle status and linked intent. Never correlate solely by email address or similar meeting times.
4. Before any external Drive grant or attachment, the durable job requires the persisted sharing confirmation, exact material choice/revision, matching intended recipients and verified visitor contact. A valid webhook or metadata cannot replace this gate. Changed material or recipients require fresh explicit authorization; a staff-managed change needs attributable authority of its own. The job verifies expected organizer, time and participants on the resolved calendar event. It creates the selected brief PDF and notes document, or notes alone for the explicitly confirmed no-brief branch.
5. Patch the existing event with the authorized artifacts and concise agenda information, preserving Meet details, guests, existing content and provider management links. Preserve the owner as organizer and include owner/visitor in the resulting event's participant configuration. Avoid a redundant owner invitation or duplicated event. Check the actual event and attendee experience.
6. Mark preparation ready only after the event, working Meet details, all required documents and recipient access are verified. For a selected brief, both its literal PDF and notes are required. For a confirmed no-brief booking, require notes and show **No brief supplied**. Display booked time, timezone, Meet link, brief revision or its explicit absence, and reschedule/cancel links. A preparation failure leaves the booking intact with **Meeting booked; documents pending**, a recoverable job and a staff-visible issue.

Cal remains the only booking creator. If a later approved replacement uses Calendar directly, create one event with attendees, `sendUpdates=all`, a unique conference request and `conferenceDataVersion=1`. Conference creation can be asynchronous; pending or failed conference status must not be shown as ready. Use a stable operation identity to resolve uncertain creation results before retrying. [6]

## 5. Webhooks, retries and lifecycle

Validate Cal's `x-cal-signature-256` HMAC-SHA256 against the raw request body using the configured secret and a constant-time comparison before trusting the payload. Restrict processing to intended account/event types. A valid signature does not make arbitrary metadata a permission grant. [7]

Persist receipt before enqueueing work. Deduplicate using a provider event identifier when available, or a documented composite and payload digest. Make document preparation idempotent by booking, brief revision and document kind. Store created Drive IDs before subsequent steps so retries reuse files. Ambiguous provider responses require a read/reconcile step before a second mutation.

Process cancellation, rescheduling and applicable booking-state changes. Re-fetch the current provider state when events arrive out of order; an old creation event must not revive a cancelled booking. Preserve provider reschedule lineage and re-resolve the calendar reference. Verify attachment survival or reattach to the correct replacement event without sending a second booking invitation.

Run a bounded reconciliation job for pending or recently changed bookings and missed webhooks. Do not assume webhook delivery is exactly once. Refresh permission checks when an attendee changes; remove booking-derived file grants for removed guests while preserving any independently authorized access. Cancelling a meeting does not silently erase its audit record. Use an explicit retention policy for documents and records.

## 6. Records and ownership

| Record | Minimum information and constraint |
| --- | --- |
| `booking_intent` | Session, contact/verification, material choice, exact revision or explicit no-brief state, sharing confirmation with recipients/time/idempotency, creation/expiry, allowed event type, non-secret correlation ID. No permission derives from knowing the ID. |
| `booking` | Intent, exact revision, provider/account identity, booking UID, lifecycle status, time/timezone, named participants, Meet details, calendar/event IDs, reschedule lineage, separate preparation status. |
| `booking_event` | Provider event identity/digest, receipt time, verified source, processing outcome and reconciliation reference. Retain minimal necessary payload data. |
| Booking artifact records | Revision/checksum, kind, private storage/Drive ID, recipient grants, attachment status, creation and retention timestamps. Reuse the shared artifact model. |
| `followup_consent` | Verified contact, purpose, exact consent-text version, source, timestamp, active/withdrawn status. Independent of workspace membership. |
| `followup_job` | Consent, contact/session, due time, inactivity cutoff, suppression reason, idempotency key, provider delivery ID and delivery status. |

Booking access does not create client-workspace membership or approval authority. Staff deliberately converts a suitable inquiry into a client/engagement and imports an approved brief revision. AI call accounting remains in `ai_operation` and `ai_call_attempt`, including abandoned sessions; booking and export reference those records rather than duplicating raw content.

## 7. Notes and follow-up

### Useful notes from the first release

Prepare a shared agenda/notes document containing the reviewed brief summary, questions to resolve, decisions, owners and next steps. Owner editing and visitor viewing is a simple starting permission choice. Internal observations belong in a separate restricted record. Human-authored meeting notes are sufficient initially.

Google Meet's automated note-taking depends on eligible Workspace editions and settings. Its outputs and sharing behavior require separate verification, participant notice and an appropriate consent process. Do not assume transcription, recording or automatic summaries are included or enabled. Treat these as later enhancements; retain human review before promoting generated notes into decisions or project requirements. [8]

### Optional recovery email

Suggested capture copy:

> **Save my progress**  
> Enter your email to receive a way to return to this brief. You can keep exploring without saving your email.

Separate, unchecked consent:

> Send me one reminder to finish my brief or book a conversation. I can opt out at any time.

Verify email ownership before associating private history or granting document access. Use the chosen established email-code authentication capability. Apply request limits and generic verification messages to reduce abuse. Initial verification and a requested save/resume email are transactional; neither enrolls the visitor in promotional follow-up or a newsletter.

Recommend one reminder after 48 hours of inactivity as a configurable first-release default. Send only with active purpose-specific consent and a verified address. Recheck immediately before dispatch. Suppress if booking is pending/confirmed, the brief is shared_for_booking, converted, unsubscribed, deleted, manually contacted, recently replied, bounced, complained, currently active or no longer consented. Do not label someone an abandoned lead after one question. Booking initiation suspends the reminder while confirmation is reconciled. Resolve stale booking intents before making an eligibility decision. A visitor who explicitly confirmed sharing a brief for the meeting is not sent an unfinished-brief reminder.

Use an outbox with delivery idempotency, controlled retries and recorded provider receipts. Reconcile ambiguous delivery before resending. Provide a simple unsubscribe requiring no login, scoped only to subscription withdrawal. Keep email content minimal; link to an authenticated resume flow rather than including the private brief. Do not grant workspace access through an unsubscribe or tracking token.

Do not automatically export every captured address to an outreach list. Staff may review consented prospects with their lifecycle status. Reminder sending stays disabled until owner review, sender/domain setup and consent/suppression verification are complete. No emails are sent as part of this planning work.

## 8. Delivery gates and acceptance checks

Implement local interfaces and provider fixtures first. Configure live connectors and perform real integration checks only in the authorized implementation phase with designated test identities. Fixture success must be reported as scaffold verification, not end-to-end completion.

| ID | Required evidence |
| --- | --- |
| BOOK-01 | Desktop/mobile keyboard users can book with a partial brief, skip early email capture and export without animation or AI availability. |
| EXPORT-01 | PDF/Markdown match the selected revision, expose assumptions, omit internal data and remain readable when printed. No extra model call occurs. |
| BOOK-02 | A confirmed provider booking is bound to the correct intent/revision despite two sessions using the same email. Tampered references fail safely. |
| BOOK-03 | A real test calendar event contains the owner/visitor participant configuration, working Meet details, literal private PDF attachment and agenda/notes document. Both intended recipients can open them. |
| BOOK-04 | A different visitor, anonymous requester and unrelated client cannot download the brief or open its Drive files through direct links, guessed IDs or forwarded app URLs. |
| BOOK-05 | Duplicate/out-of-order webhooks, network timeouts and worker retries produce one booking and one artifact set, with no duplicate invitation. Invalid signatures are rejected. |
| BOOK-06 | Cancellation/rescheduling updates status, suppresses obsolete reminders and preserves or repairs attachments on the correct event. A deliberately missed webhook is reconciled. |
| BOOK-07 | Calendar/Drive authorization failure preserves the booking, shows documents pending and supports recovery. Secure-link fallback does not pass BOOK-03. |
| EMAIL-01 | Unverified or unsubscribed addresses receive no recovery campaign. Confirmed brief sharing, booking immediately before dispatch, changed consent and a delivery timeout do not produce an improper or duplicate reminder. |
| BOOK-08 | Meet auto-notes are absent unless separately enabled and verified. The prepared notes document remains available without that product feature. |
| BOOK-09 | Explicit no-brief confirmation produces a ready Meet event and accessible notes, with No brief supplied shown. No context or PDF is fabricated; the brief-selected branch still requires its literal PDF. |
| BOOK-10 | A valid webhook with absent, stale or mismatched sharing confirmation cannot grant Drive access or attach private materials. Changed recipients or revision require fresh authorized confirmation. |

Before integration, verify account ownership, Cal API/webhook entitlement, intended Google calendar, private Drive sharing with external attendees, sender delivery capability and production secrets handling. These are capability checks. The owner's decision is needed only if the existing scheduling account cannot support the specified single-booking flow or if they prefer a different reminder policy.

## Official references

1. [Cal.com: create a booking](https://cal.com/docs/api-reference/v2/bookings/create-a-booking).
2. [Cal.com: Google Meet setup](https://cal.com/blog/customizing-your-scheduling-experience-with-cal-com-and-google-meet) and [embedding](https://cal.com/embed).
3. [Cal.com: get booking references](https://cal.com/docs/api-reference/v2/bookings/get-booking-references).
4. [Google Calendar: create events and attachments](https://developers.google.com/workspace/calendar/api/guides/create-events).
5. [Google Calendar: attachment access](https://support.google.com/calendar/answer/6192039) and [Drive: manage sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing).
6. [Google Calendar: event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) and [event resource/conference status](https://developers.google.com/workspace/calendar/api/v3/reference/events).
7. [Cal.com: webhooks](https://cal.com/docs/developing/guides/automation/webhooks).
8. [Google Meet: take notes for me](https://support.google.com/meet/answer/14754931).
