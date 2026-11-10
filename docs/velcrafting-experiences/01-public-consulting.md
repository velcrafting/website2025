# Public consulting page and project explorer

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** IMPLEMENTATION HANDOFF, REVIEW DRAFT  
**Scope:** Product requirements and proposed contracts. This document does not establish that any route, account or integration is configured.

## 1. Outcome and boundaries

The public experience should help a prospective client understand Velcrafting's work, explore an engagement and reach a useful conversation with a reviewable brief. It has two connected surfaces on /consulting: a deterministic service/process explanation and a conversational project explorer. Conversation is optional for the visitor and included in the complete deliverable.

The owner has selected Command Code with DeepSeek v4.1 Flash for the AI route. Record every triggered provider call, including an early question from a visitor who never finishes a brief. The previous recommendation to retain only submitted briefs is superseded. [AI observability and data](04-ai-observability-and-data.md) defines the recording, access and retention requirements.

Scope controls explain how work changes. The first release does not generate prices, guaranteed outcomes or delivery dates. A visitor may record their own budget or timing constraint, identified as their input. Generating a discussion brief does not create an engagement or commercial agreement.

## 2. Page information architecture

Use the existing notebook design language: parchment and raised-paper surfaces, dark ink, forest actions, violet links, serif headings, readable sans-serif body text and subtle rules. Reuse reviewed tokens and components rather than importing a new theme.

Page sequence:

1. Introductory statement and visible actions.
2. Four service entry points.
3. Interactive process explorer.
4. Conversational project explorer, entered deliberately.
5. Selected work with accurate maturity labels.
6. Contact route and client sign-in.

Working headline: **Turn complicated work into useful systems.**

Supporting copy: **Software, practical AI and clear communication, with scope, decisions and handoff kept in one place.**

Primary actions are **Explore your project** and **Schedule a conversation**. **Client sign in** is a persistent secondary navigation item. Link it to the client subdomain only when that destination is configured and verified.

| Starting point | Client need | Useful output |
| --- | --- | --- |
| Review and direction | Make a sound decision. | Evidence, options and a recommendation. |
| Prototype and build | Test or use something tangible. | Agreed journeys, a working artifact and handoff. |
| Workflow and AI integration | Make repeated work more reliable. | A bounded workflow, evaluation and operating instructions. |
| Communications and knowledge | Help people find and understand reliable information. | Reviewed resources, ownership and a usable process. |

Include **Not sure yet** in the explorer. These are entry points, not fixed commercial packages.

## 3. Process explorer

Show persistent stage controls and one illustrative workspace panel. Visitors can open any stage directly. Previous/Next controls are conveniences, with no autoplay or required completion order.

| Stage | Purpose | Velcrafting contributes | Client contributes | Output or next step |
| --- | --- | --- | --- | --- |
| Discovery | Understand the problem. | Gather context and expose unknowns. | Goals, constraints and relevant material. | Brief and proposed next step. |
| Quote | Establish commercial direction when useful. | Pricing basis, options and assumptions. | Budget direction or procurement requirements. | Dated quote, or pricing within the proposal. |
| Proposal | Make responsibilities concrete. | Scope, deliverables, exclusions and completion checks. | Review and an authorized decision-maker. | Identifiable version for external agreement. |
| Start | Make the first work possible. | Owners, dependencies and first milestone. | Agreed inputs and appropriate access. | Practical readiness checklist. |
| Updates | Keep progress and decisions visible. | Dated work, evidence, blockers and next steps. | Review and named decisions. | Preserved update and clear next action. |
| Delivery | Make the result usable. | Final artifacts, instructions and outstanding items. | Agreed review and operating ownership. | Handoff and agreed follow-up. |

Display: **The shape of the engagement depends on the work. Some stages combine, and updates follow the cadence we agree.**

Every example is explicitly fictional. Stage changes must not imply that earlier stages were completed. Preserve a readable sequential fallback without JavaScript or animation.

## 4. Conversational journey

### Enter and describe

Before the first AI request, show the recording notice in section 9. Ask: **What would you like to make easier, clearer or possible?** Offer fictional examples and a service selector.

Do not require email to explore, edit or export. An unsent draft is not an AI request and must not be recorded as message content. Sending a message creates a stored message and call record before provider dispatch.

### Understand and clarify

The model proposes an understanding and asks one focused question or a small related group. Distinguish visitor-confirmed facts, AI suggestions and unknowns. A correction updates structured state, not merely a hidden conversation summary.

On desktop, place conversation beside a stable brief. On mobile, show the current task and a prominent **Your brief** control. Keep scheduling available in either view.

### Adjust scope

Use named controls with **Not sure** where appropriate:

| Dimension | Choices | Explain the effect on |
| --- | --- | --- |
| Delivery level | Review, prototype, live system | Deliverables, verification and ownership |
| Workflow breadth | One workflow, connected workflows | Dependencies and coordination |
| Information readiness | Existing material, preparation needed | Inputs and factual review |
| Audience | Internal team, external users | Access and operating requirements |
| Involvement | Handoff, continuing support | Ownership and separately agreed follow-up |

Use a numerical slider only when its unit is meaningful. Do not invent complexity percentages. Necessary security, accessibility and delivery quality are part of the applicable standard.

Choices update local state immediately. Use **Update my brief** for a bounded AI refinement, rather than requesting inference on every pointer movement. Show changed sections and preserve user edits.

### Review without forcing completion

The brief is useful at several stages. Label it **In progress** until reviewed, and retain unanswered questions. Offer export and scheduling even when only a high-level problem exists. A visitor should not have to finish an artificial questionnaire to speak with Velcrafting.

## 5. Component and state contract

Start with these component families: understanding summary, question, choice group, scope selector, comparison, dependency list, open question and brief section. Fixed application controls handle export, email, scheduling, consent and confirmation of what is shared.

The canonical brief state contains:

- Brief identifier, revision, creation/update time and draft/reviewed state.
- Problem, audience, desired outcome and selected service entry point.
- Scope choices, constraints, dependencies and illustrative deliverables.
- Open questions, suggested next step and visitor corrections.
- Provenance per field: visitor, model suggestion or staff.
- Confirmation state and source message references.

The model's rendered layout is not authoritative state. Validate component types, property lengths, allowed state paths and action parameters. Stable component identifiers preserve focus and edits during regeneration. Reject arbitrary HTML, executable code, unapproved destinations and network actions.

Proposed operations are send_message, update_choice, confirm_field, edit_brief, refine_brief, export_brief, begin_booking and confirm_booking_share. Each mutation includes the current revision and an idempotency key where it can cause a provider call or stored submission. Stale updates return the latest revision for reconciliation.

There is no separate inquiry form or general Submit brief action in this release. The fixed **Use this brief for my meeting** action calls confirm_booking_share with the booking intent, exact brief revision, expected version and idempotency key. Require the current session capability and verified contact before externally sharing private artifacts. Record the selected recipients, confirmation time and shared_for_booking state. This action does not call a model or send an invitation. It identifies the exact context the visitor chose to share, while earlier sent messages were already recorded. An export or saved email alone does not set this state.

**Continue without a brief** uses the same fixed operation with an explicit no-brief material choice, null revision and no_brief_confirmed state. That meeting still receives a prepared notes document; no brief is fabricated. Both branches require the specified authorization before sharing artifacts.

## 6. Brief export

Provide **Download PDF**, **Download Markdown** and **Copy brief**. Export is available for an incomplete brief and does not require email capture.

Each export is an immutable snapshot of the selected revision, with title, generated date, version, review state, known facts, suggestions, open questions and an exploration-only label. Include visitor constraints faithfully. Do not include internal scoring, call costs, hidden prompts, reviewer notes or the raw transcript by default.

A PDF must contain selectable text, readable headings and sensible page breaks. Sanitize text, escape markup and prevent untrusted remote-resource loading in the export renderer. A failure can offer Markdown and copy without losing the brief.

Downloads must respect session or verified-identity access. Do not place private exports in public assets or use a permanent public URL. A browser print action alone does not satisfy a promised downloadable PDF.

## 7. Scheduling during exploration

The persistent **Schedule a conversation** action works from the hero, conversation and brief view. Preserve the current brief before opening scheduling. Let the visitor review the exact snapshot to share; an incomplete brief is labeled accurately.

The handoff contract includes a booking-intent identifier, brief revision, attendee name and email, timezone, requested event type and a verified return destination. Do not put conversation text, contact details or bearer credentials in scheduling query strings.

The completed conversion must connect a confirmed booking with:

- The owner as organizer or assigned host.
- The visitor as an invited attendee.
- A real Google Meet conference reference.
- The reviewed brief snapshot.
- A shared meeting-notes artifact with deliberately granted access.
- Cancellation and rescheduling references.

A CTA click or return to a success page is not evidence that those resources exist. Show **Booking pending** until a trusted server event or reconciliation confirms them. If conference creation or attachment preparation fails, retain the booking and show a recoverable preparation state without claiming complete setup.

A later brief revision does not silently replace the snapshot attached to an existing meeting. Offer an explicit update with a visible revision record. Meeting invitation does not mean the attendee accepted the invitation.

The conversion specification owns provider-specific event creation, attachment mechanics, notes permissions and recovery. Account configuration is a prerequisite, not an existing capability.

The listed brief resource is required when a brief was selected. A deliberately confirmed no-brief booking shows its absence and requires the meeting and notes instead, as specified in BOOK-09. BOOK-10 prevents a webhook from bypassing the visitor's sharing confirmation.

## 8. Optional early email capture

Offer **Save my progress** after initial value is visible, while allowing continued exploration without it. Use a dedicated, server-rate-limited prospect enrollment/email-code flow with privileged provisioning isolated server-side. A verified Supabase prospect identity has zero client memberships or grants. Claim the current brief only after both email verification and proof of its existing session capability; do not collect unrelated history merely because its typed email matches.

Separate three actions:

- A requested save/resume or booking transaction.
- Consent to a limited reminder about this unfinished inquiry.
- Optional broader marketing, which is outside the first release.

An email field alone does not authorize follow-up. Use an unchecked reminder choice with clear purpose. Confirm the address before enabling reminders or exposing previously saved content. Suppress reminders after booking, confirmed sharing for the meeting, opt-out, hard bounce or staff suppression. The booking specification defines the complete eligibility predicate.

Do not import prospect addresses into newsletter lists. Allow a verified visitor to resume their own brief without exposing another visitor's records or disclosing whether an unrelated email exists.

## 9. Fixed visitor copy

Before the first request:

> **Explore your project with AI**  
> Velcrafting records the messages you send and the AI responses, including unfinished conversations, so we can review inquiries, understand usage and improve this experience. Our AI service providers process these messages. Please keep details general and leave out confidential company information, customer records, passwords and personal information about others.  
> **How your information is used**

Beside early email capture:

> **Save your progress**  
> Enter your email to receive a way to return to this brief. You can keep exploring without saving your email.

Separate unchecked choice:

> Send me one reminder to finish my brief or book a conversation. I can opt out at any time.

Beside booking:

> Review the brief you want to share. Once your booking is confirmed, we'll include that version with the meeting details and a place for notes.

At all brief views:

> This is a discussion brief. Scope, pricing and commitments are confirmed after review.

These notices describe intended behavior and must match the deployed implementation.

## 10. Failure handling and accessibility

Keep entered text through recoverable failures. Distinguish service busy, usage limit, invalid generation, save failure, export failure and booking preparation failure. Permit ordinary contact when inference is unavailable. Never silently switch provider or spend beyond approved limits.

Use labeled controls, visible focus, complete keyboard behavior, adequate contrast and touch targets. Announce new content without repeatedly interrupting screen readers. Streaming must not move active controls. Respect reduced motion and support zoom and narrow screens.

## 11. Acceptance criteria

| ID | Required evidence |
| --- | --- |
| PUB-01 | Every process stage is reachable directly and understandable without animation. |
| PUB-02 | Fictional software and communications scenarios produce relevant, different questions. |
| PUB-03 | Visitor edits survive regeneration; unknowns remain visibly unknown. |
| PUB-04 | Scope changes explain work without invented prices, dates or guarantees. |
| PUB-05 | An early abandoned question remains in the restricted call/content record. |
| PUB-06 | PDF, Markdown and copy export the chosen revision, including an incomplete brief. See EXPORT-01 for the full export check. |
| PUB-07 | Scheduling works during exploration and preserves the selected brief snapshot. |
| PUB-08 | Complete-booking status requires confirmed attendee, Meet, brief and notes evidence. |
| PUB-09 | Optional email capture does not block exploration or imply reminder consent. |
| PUB-10 | Invalid generated actions cannot submit, navigate or expose another session's data. |
| PUB-11 | Keyboard, mobile, zoom, reduced motion and provider-failure paths remain usable. |
| PUB-12 | A duplicate send, export or booking action does not create unintended duplicate work. |

## 12. Sources and implementation limits

The existing [About source](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/about/page.tsx), [design tokens](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/globals.css) and [site configuration](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/config/site.ts) ground the brand and existing contact path. [json-render](https://json-render.dev/docs) is the preferred rendering candidate, subject to package compatibility checks. No model-quality, live scheduling, export or accessibility result is established by this specification.

