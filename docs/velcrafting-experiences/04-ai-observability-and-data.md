# AI call observability, inquiry data and follow-up

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** IMPLEMENTATION HANDOFF, REVIEW DRAFT  
**Scope:** Proposed records, controls and acceptance checks. No provider, logging or messaging configuration is implied.

## 1. Owner decision and objective

Record every triggered AI call, including a high-level question from an unfinished or abandoned exploration. The owner wants to understand what consumed the service, what visitors asked and whether the interaction produced useful information. Retaining only completed briefs would lose that evidence and is superseded.

The selected route is the website server through AI SDK to Command Code's Provider API, using the account-authorized DeepSeek v4.1 Flash model. Recheck the exact catalog identifier and entitlement before activation. No automatic alternate provider, paid top-up or model substitution is assumed.

Use one observability contract across public shaping and any later authorized private drafting feature. Public queries must never retrieve private engagement records. Private AI access remains subject to its own client, project, audience and staff permissions.

Recording calls is distinct from sending follow-up. An early question can be useful without an email address, a finished brief or marketing consent.

## 2. What is recorded

Record an explicit visitor submission, the source material actually supplied to the model, the resulting output, operation/attempt metadata and available usage evidence. Preserve early questions even when the visitor leaves immediately.

Do not capture unsent keystrokes, the clipboard, unrelated browser content or hidden session replay. Do not put message bodies into public analytics, standard application logs, exception dashboards or calendar query strings.

Store transcript content in a restricted content store. The call ledger refers to content records rather than duplicating full conversation history for every attempt. For each request, retain the exact ordered input references, approved instruction/template versions and a context integrity reference so the request can be reconstructed within its retention period.

If an obvious secret or prohibited content is detected, redact or block it before sending. Record that a redaction or block occurred. A filter is not a guarantee that sensitive information cannot be entered, so restricted access and deletion controls remain necessary.

The visitor-facing notice must state that sent messages and AI responses are recorded even if the exploration remains unfinished.

## 3. Proposed records and relationships

| Record | Purpose and essential fields |
| --- | --- |
| explorer_session | Opaque ID, anonymous or verified owner reference, creation/last activity, notice version, state, expiry and brief reference |
| conversation_message | Session, role, timestamp, sequence, restricted content reference, source/confirmation state and redaction status |
| brief_revision | Immutable revision, canonical fields, provenance, review state and related message references |
| prospect_contact | Email, verification state, optional name, capture purpose, created time and protected session association |
| followup_consent | Contact, precise purpose, consent state, shown wording/version, source action and timestamps |
| ai_operation | One requested action, session or engagement scope, initiating actor, idempotency key, requested brief revision and terminal outcome |
| ai_call_attempt | Every provider request within an operation, attempt number, model/route, request identifiers, timing, usage/cost evidence and failure state |
| ai_content | Restricted request/response bodies or references, classification, deletion deadline and integrity metadata |
| inquiry_review | Staff reviewer, useful finding/category, evidence reference, next action and visibility |
| conversion_link | Operation/session, inquiry or booking reference, selected brief revision and verified conversion state |

An operation may contain multiple attempts. A retry, a structure-repair request and a separate evaluation model request each create another attempt. Do not count them as one provider call.

Keep optional contact identity separate from content and aggregates. Typing an address does not prove ownership. Anonymous session ownership establishes possession of that session, not a named person's identity or approval authority.

## 4. Request lifecycle

1. Authenticate or validate the public session, origin and operation type.
2. Validate size, schema, allowed source references and usage limits.
3. Persist the submitted message and operation using a unique idempotency key.
4. Reserve the bounded usage allowance and persist an attempt in prepared state.
5. Mark dispatch time and call the approved provider through a server-held credential.
6. Capture response metadata and restricted output while streaming an allowed public result.
7. Validate the output, update the brief or expose a recoverable generation failure.
8. Finalize usage evidence and release or reconcile the reservation.
9. Associate later export, submission or booking events without rewriting the original attempt.

If the durable pre-dispatch record cannot be saved, do not make the provider call. Preserve the user's unsent input locally where feasible and offer retry or ordinary contact. This protects the owner's requirement that paid work has a corresponding record.

A browser disconnect is not proof that the provider stopped or that no charge occurred. Track the server/provider completion independently. Interrupted calls remain pending or indeterminate until available evidence resolves them. Use bounded recovery work for attempts left in prepared, dispatched or incomplete state.

## 5. Attempt fields and accounting semantics

Each attempt should retain:

- Operation, sequence, scope and authorized initiating actor.
- Requested provider/model and actual returned provider/model where supplied.
- Application request ID, provider request ID and workflow/run reference if used.
- Instruction, template, catalog and source versions.
- Started, dispatched, first response and completed timestamps.
- HTTP/provider result, application outcome and normalized failure category.
- Input/output tokens, cached tokens and other metering dimensions when supplied.
- Reported subscription credits or other provider units, with the unit named.
- Currency amount and currency code only when a monetary measure is available.
- Usage source, pricing/rate snapshot reference and cost status.
- Retry reason, replacement/superseding attempt and content references.

Use these cost states:

| State | Meaning |
| --- | --- |
| pending | A request may have consumed usage; final evidence has not arrived. |
| estimated | A documented calculation uses available usage and a dated rate basis. |
| verified | Authoritative provider evidence establishes the recorded amount or units. |
| unavailable | The available provider interface cannot establish the amount. |

A verified zero requires evidence. An error response, missing usage field or prepaid subscription does not by itself establish zero cost. Keep provider credits and currency distinct; do not silently convert a subscription allowance into a cash invoice.

Store estimated and verified values separately. Reconciliation appends or updates the evidence state without erasing the original observation. If no trustworthy rate is available, show the call count, metering data and **Cost unavailable** rather than inventing an estimate.

Never infer revenue or return on investment from a booking alone. Engagement value, paid revenue and model usage are different records.

## 6. Bounded usage and recovery

Require explicit deployment configuration for per-operation limits, session limits, concurrency, maximum input/output size, conversation length, retries and an aggregate allowance. An unset production allowance must not expose an unbounded anonymous endpoint.

Reserve usage atomically so simultaneous requests cannot each spend the same remaining allowance. Repeated submission of one idempotency key returns or resumes the same operation. A genuine retry receives a distinct attempt linked to it.

Scope selection, scrolling, opening the process explorer, editing text locally and downloading an existing snapshot do not require inference. A visitor action such as **Update my brief** makes the paid action understandable and measurable.

On a limit or provider outage, preserve the available brief and provide export and contact. Do not automatically activate a new provider, consume unrelated credits or purchase more capacity. Record the refused action and reason without falsely reporting a provider call when none occurred.

The recommended provider facts and integration boundaries are documented in [Command Code Provider API](https://commandcode.ai/docs/provider), its [model registry](https://commandcode.ai/docs/reference/cli/models), and AI SDK's [compatible-provider interface](https://ai-sdk.dev/providers/openai-compatible-providers). Actual account capacity remains unverified.

## 7. Staff view and evaluating value

Start with a narrow staff operations view or equivalent protected structured review. A full CRM is unnecessary.

Provide four useful views:

1. **Usage:** operations, attempts, failures, latency and cost states by feature, model and date.
2. **Early questions:** the first submitted question, chosen starting point, abandonment stage and staff review state.
3. **Session detail:** restricted transcript, brief revisions, exports, contact verification, consent and conversion references.
4. **Exceptions:** incomplete accounting, repeated invalid generations, suspicious traffic and failed booking preparation.

Use separate permissions for aggregate metrics and raw content review. The existing shared administrative key is unsuitable for attributing this work; named staff identities must govern these views.

A reviewer can label a question useful, unclear, irrelevant, abusive, a service gap or a candidate for improving instructions. Record the reviewer and source. A model-generated classification is a suggestion until treated according to an explicit review rule.

Measure useful completed briefs, corrected assumptions, staff-rated useful early questions, booked conversations, error/retry rates and usage per outcome. Avoid measuring success only by the number of chat turns or the amount of content collected.

Reusable lessons should be abstracted from specific inquiries. Do not publish a visitor's story, use it as another client's example or add it to a model-training dataset merely because it was recorded for operational review.

## 8. Email capture and unfinished-inquiry follow-up

Early capture is optional and purpose-specific. **Save my progress** can request an email to resume the current brief. Use a dedicated, server-rate-limited Supabase prospect enrollment/email-code flow, with privileged provisioning isolated server-side. The identity receives no client grants. Claim only the current session after email verification and proof of its existing session capability; a matching typed email must not expose unrelated history. Client-host login does not provision prospects.

Store the submitted address as unverified until verification completes. Avoid responses that disclose whether an unrelated address already has an inquiry. Rate-limit verification and resend actions.

A separate, unchecked choice may authorize a reminder about the unfinished project inquiry. Retain the exact wording/version, affirmative action, timestamp and verified contact reference. Save/resume and booking communications serve their requested transaction; they must not silently enroll the contact in a promotional sequence.

Proposed initial policy, subject to review: at most one unfinished-inquiry reminder after 48 hours without meaningful progress. Sending stays disabled until the owner approves the schedule and copy and the sending domain is verified. Suppress it if the visitor books, confirms brief sharing for the meeting, opts out, becomes an active engagement, has an invalid/unverified address, bounces or is manually suppressed. Use the complete eligibility predicate in the booking specification for every queue and sender path.

Recheck eligibility immediately before sending, even if a job was queued earlier. Use an idempotent send record and record delivery status accurately. A successful API response is not evidence that the recipient read the message. Include a straightforward way to stop reminders.

Broader marketing and newsletter enrollment are later possibilities with their own purpose and choice. No invitation or follow-up is authorized by creating this specification.

## 9. Access, retention and deletion

Raw messages, outputs, email and review notes are private operational data. Use server-side authorization and database policies for pages, APIs, exports and background jobs. Apply permissions before loading content into a model or returning a stream. Do not expose data through a public query, index, cache or predictable identifier.

Use protected storage, encrypted transport and platform-supported encryption at rest. Keep service credentials server-side and restrict their scope. Staff access and exports should be attributable. Redact ordinary error logs and remove content from trace attributes sent to external observability services.

Proposed retention defaults for owner review:

| Data | Proposed default |
| --- | --- |
| Raw exploratory messages and AI outputs | Delete 30 days after last session activity unless deliberately associated with a live inquiry. |
| Unconverted inquiry, relevant content and contact | Delete 90 days after the last meaningful interaction. |
| Call metadata and usage evidence | Retain 12 months for operating analysis, with content/contact references removed when those records expire. |
| Aggregate, nonidentifying service metrics | Retain for trend analysis under a documented policy. |
| Converted engagement records | Apply the separate engagement retention arrangement. |
| Reminder opt-out | Retain the minimum suppression record needed to honor the choice. |

These are proposed operating defaults, not legal minimums or an implemented policy. Retention extensions require an identified purpose and expiry. Do not keep raw content indefinitely because it might be useful.

Deletion should remove content, exports and active references, suppress queued reminders and record a limited deletion audit. Explain backup and provider-retention limits accurately. Deleting an application row does not prove removal from a provider's retained request records.

Command Code's [privacy policy](https://commandcode.ai/privacy) permits default request-content retention subject to its conditions. Its [zero-retention option](https://commandcode.ai/docs/resources/zdr) requires an eligible route and can affect availability or cost. Verify the selected setting rather than promising universal zero retention.

## 10. Fixed disclosure requirements

Before the first provider call, disclose recording of sent messages and responses, unfinished conversations, intended operational uses and AI-provider processing. Link readable details covering storage, access, retention and deletion requests.

The public notice asks for high-level information and discourages confidential business data, credentials and other people's personal records. It does not define the private workspace's handling of authorized confidential engagement material.

The booking-share review action must say what it adds to the existing record. It must not imply that the preceding conversation was unrecorded. The public specification defines shared_for_booking; no extra inquiry form is implied. Email and reminder consent are separate fields with separate meanings.

## 11. Acceptance criteria

| ID | Required evidence |
| --- | --- |
| AI-01 | An abandoned first message has an operation, attempt, restricted input/output and available usage evidence. |
| AI-02 | No provider dispatch occurs when the durable pre-call record fails. |
| AI-03 | Retries and repair calls create distinct attempts without duplicating the user operation. |
| AI-04 | Missing cost remains unknown; prepaid usage is not reported as verified zero. |
| AI-05 | Reconciliation preserves estimated versus verified values and provider units. |
| AI-06 | Concurrent requests respect atomic reservations and configured limits. |
| AI-07 | Disconnects and crashes leave recoverable records rather than disappearing charges. |
| DATA-01 | Staff can review an early question without exposing raw content to general analytics. |
| DATA-02 | Another session, client or unauthorized staff role cannot read content, exports or streams. |
| DATA-03 | Save/resume email does not imply reminder or marketing consent. |
| DATA-04 | A reminder rechecks consent and suppression at send time and cannot send twice. |
| DATA-05 | Retention expiry deletes the intended records and cancels eligible queued follow-up. |
| DATA-06 | The notice matches actual recording, provider processing and retention behavior. |
| AI-08 | Public model retrieval cannot access private engagement records or internal estimates. |

## 12. Agent implementation notes

Implement this contract before enabling anonymous inference. Use fictional inputs and provider stubs for early validation; perform authorized live tests only after account, usage and data-processing configuration is ready. Document evidence separately for implementation, mocked checks and actual provider results. A complete ledger is part of the feature, not optional analytics added after launch.

