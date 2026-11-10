# Private client workspace

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** REVIEW DRAFT, IMPLEMENTATION SPECIFICATION  
**Target:** client.velcrafting.com  
**Companion:** [Data, permissions and versions](03-data-permissions-and-versions.md)

## 1. Product contract and evidence limits

Give each authorized stakeholder one dependable place to understand an engagement: its current position, agreed scope, latest progress, decisions and handoff. Reuse the system across clients, projects and phases without losing previous context.

The selected authentication direction is Supabase email one-time codes. The inspected repository does not establish a working client authentication implementation. Live Auth, email delivery, database policy, private storage, DNS and TLS remain unverified. The prior Vercel review found the client subdomain was not attached to the website project. Verify configuration before claiming that any client URL works.

Reuse the existing Next.js application and editorial design where practical. The public root layout currently includes public navigation and guided chat. The client experience needs a distinct shell, metadata and authorization boundary. Relevant sources: [application layout](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/layout.tsx), [design tokens](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/globals.css).

This specification authorizes no live configuration or invitations. It defines the behavior the implementation agent must build and verify within its separately authorized environment.

## 2. Navigation and route contract

Use one client host for all clients. Do not provision a subdomain per client.

| Surface | Proposed client-host path | Purpose |
| --- | --- | --- |
| Sign in | /login | Email entry, code verification and help |
| Home | / | Accessible engagements, recent changes and next actions |
| Client context | /clients/[clientId] | Available projects for a selected client |
| Project | /projects/[projectId] | Relevant engagements and permitted prior context |
| Engagement overview | /engagements/[engagementId] | Status, latest update, next action and kickoff |
| Engagement sections | /engagements/[engagementId]/discovery, /proposal, /updates, /delivery | Intentionally shared records |
| Decisions | /engagements/[engagementId]/decisions | Open decisions and dated outcomes |
| Document version | /documents/[documentVersionId] | Stable issued or accepted version |
| Protected download | /files/[fileId]/download | Authorized file or export delivery |

These are interface contracts, not existing routes. Implement a distinct internal namespace, such as /client-workspace, so public /projects does not collide. Host routing may map friendly client-host paths to that namespace. Protect every alias, including the internal path on the public or preview host. Hostname and an obscure identifier never establish authorization.

Use Overview, Discovery, Proposal, Updates and Delivery as the main engagement navigation. Show Quote only when a separate quote exists. Keep Start within Overview unless its content genuinely warrants a section. Decisions should be reachable from both related content and their dated list. Preserve a stable engagement URL.

A stage can be relevant, omitted, pending, active or complete. Stage state does not enforce a universal linear funnel. Do not infer a percentage complete from the selected stage.

## 3. Named sign-in and access recovery

Login copy: “Welcome back. Enter your email to continue.”

Use the documented Supabase email-code flow, with code-oriented email templates and approved redirect destinations. Supabase automatically creates users in some passwordless flows by default; client-host login must disable implicit account creation. Staff approves client membership and engagement access. An existing verified prospect account can be granted access without creating a second identity. See [passwordless email documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless).

The public explorer uses a separate, rate-limited enrollment/verification endpoint. Recommended configuration keeps unrestricted signup disabled and isolates necessary Auth account provisioning in a narrowly scoped server operation, followed by the normal email-code flow. That operation receives only the validated email and required enrollment context; privileged credentials never reach the browser and never serve ordinary client-data queries. The resulting prospect identity has zero client memberships and grants. Claim the current explorer session only after both email proof and its existing session capability. Matching an email cannot claim unrelated history. This public flow and invite-only client access are compatible because identity and authorization are separate.

Show a generic code-request outcome without revealing which clients or projects an email can access. Provide resend and expired-code states, rate limiting and a way to correct the email. Verify code delivery and recovery behavior in the actual environment. Never implement a browser-only passcode gate.

Validate identity on the server using the version-appropriate Supabase SSR guidance. Do not trust a decoded browser session or getSession's embedded user as authorization. Fresh application grants determine data access after identity verification. See [SSR guidance](https://supabase.com/docs/guides/auth/server-side/nextjs).

A stakeholder who loses access to their email requests help through the existing contact channel. Staff confirms the replacement address and authority before changing access. Do not transfer access based solely on an unverified email claim. Show sign-out clearly. Use documented secure session handling, host-scoped cookies and no shared parent-domain session unless a later requirement justifies it.

## 4. Home, project and engagement behavior

Home answers four questions: what can I access, where does it stand, what changed, and what needs me?

Each engagement row shows its client/project context, title, current plain-language status, latest published update date and next action with owner. Show “No action needed from you” when accurate. Display dates with understandable timezone context. Do not expose an inaccessible engagement through counts, search suggestions, notification text or empty cards.

A person may belong to multiple clients. Offer a client switcher only for authorized contexts. Project pages group accessible engagements, including completed phases. Previous phase records remain unchanged and require their own access grants. A newly added stakeholder does not automatically receive all history or future work.

The engagement header includes its objective, delivery owner, current status and next action. The summary distinguishes the current accepted scope from a newer proposal draft. “Latest” is not a synonym for “agreed.”

## 5. Minimum useful functionality by stage

| Stage | Client sees or does | Velcrafting manages |
| --- | --- | --- |
| Discovery | Reviews goals, requirements, constraints, unanswered questions and recorded decisions; requests corrections through the agreed channel. | Curates conversation notes and the selected shared brief, marks uncertain facts, assigns question owners and publishes the useful summary. |
| Quote | Authorized commercial viewers review pricing basis, assumptions, validity if used and the decision requested. | Issues a versioned quote when budget direction or procurement needs one; otherwise uses the proposal's commercial record. |
| Proposal | Reviews an outcome-focused overview and detailed scope, deliverables, exclusions, assumptions, responsibilities, milestones and observable checks. | Separates internal estimates, prepares commercial terms for authorized viewers, issues a frozen version and records external agreement evidence. |
| Start | Sees readiness, required inputs, owners, dependencies and the first useful milestone. | Maintains the kickoff checklist and distinguishes ready work from blocked work. |
| Updates | Reads dated progress, actual completed work, next steps, blockers and decisions needed; revisits earlier entries. | Publishes updates at the agreed cadence or meaningful events, with evidence and attributable corrections. |
| Delivery | Accesses final artifacts, instructions, ownership, outstanding items and agreed follow-up. | Checks delivery against the accepted baseline and amendments, records verification and provides the handoff. |

Discovery does not require a new client form initially. The public brief, meeting notes and normal conversations can supply the first structured record. Client correction and completion of an open question can use the established communication channel.

A separate quote is useful for commercial direction before detailed scope, distinct options or procurement. Avoid duplicate price sources. If a proposal incorporates a quote, record the exact relationship and any agreed precedence.

Updates must distinguish prepared, built, merged, deployed, verified and accepted when those states apply. Show evidence appropriate to the claim. Do not invent deadlines, progress percentages or completion from planned work.

## 6. Proposal review and agreement presentation

Use two layers within the same versioned source:

1. A concise overview: situation, proposed work, intended outcomes and next decision.
2. A concrete plan: deliverables, done-when checks, exclusions, responsibilities, dependencies and commercial references.

Commercial information must be excluded from unauthorized responses and exports, rather than hidden by CSS. A normal viewer may see the agreed shared scope while the exact pricing record and agreement evidence remain restricted.

Initially, do not implement an “Accept proposal” button. Staff records externally obtained agreement with the authorized acceptor, actual agreement time, exact version, evidence location and separate recorder identity. Acknowledgment, factual review, technical acceptance, publication permission and commercial agreement are distinct events.

Once issued, preserve the snapshot. Once agreement is recorded, preserve the identifiable baseline. A later change is a new proposal version or amendment with its own decision and evidence. Display pending changes separately.

## 7. Practical staff administration

Use a private, structured authoring process before investing in a broad admin application. The minimum operator workflow is:

1. Create the client, project and engagement from a selected private template version.
2. Add named stakeholder grants and commercial visibility deliberately.
3. Enter or import structured content into a private draft.
4. Preview the exact revision as each intended audience.
5. Publish or issue the reviewed revision.
6. Record externally obtained agreement or later corrections separately.
7. Remove access or archive the engagement when authorized.

A validated local authoring/import tool or a small staff-only editor is sufficient. Store filled records in private runtime storage. Do not put real engagement content in public MDX, static assets, repository fixtures or generated previews.

Avoid making raw database-console edits the ongoing publication workflow. The chosen interface must validate tenant references, preserve revision history, show audience previews and write an audit event. An initial owner may hold all staff capabilities; the operations must still be attributable to that named person.

Do not reuse the current shared ADMIN_KEY as staff identity. The existing [admin helper](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/lib/admin.ts) and [editor service](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/editor/service.ts) provide publishing concepts, not an adequate identity model for client actions.

## 8. Inquiry, meeting and private engagement connection

Public exploration records every triggered AI call under the public specification, including early questions and abandoned sessions. Those records remain staff-restricted prospect data. They do not become client-visible automatically.

A staff-reviewed conversion links selected immutable brief revisions and the relevant booking to an engagement. Import the client-useful context, identify its source and confirm any inferred facts. Keep internal call logs, cost analysis, rejected drafts and staff judgments outside the published Discovery record.

A booking or verified prospect email is not an access grant. Only the authorized staff process can establish client membership and engagement grants. Do not infer membership from an email domain, meeting attendee list or matching name.

Show relevant meeting information only after the booking integration confirms it. Link the selected brief revision and shared notes through explicit booking-artifact access. A verified prospect can access their permitted booking artifacts without becoming a client member. Do not expose internal meeting notes or unrelated engagement records. An organizer's calendar permissions do not replace portal permissions, and calendar attachments can persist outside the portal. The scheduling specification governs calendar delivery and attachment access.

## 9. Files, exports and AI assistance

Provide permission-aware export of client-published briefs, proposals and delivery records. Export identifies the document, version, date and scope of included content. A viewer export omits commercial data entirely. The issuing operator can produce the full commercial snapshot for authorized recipients.

All originals and generated exports use private storage. Authenticate and authorize generation and download separately. Prefer an authenticated download route for strong revocation behavior. If using a short-lived signed URL, document its residual validity and never describe it as immediately revocable. See [Supabase private storage](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Command Code with DeepSeek v4.1 Flash is the planned model route wherever AI is introduced in this deliverable. Private client-data processing requires verified provider settings and the applicable engagement permission before activation. Staff drafting can remain disabled while the public explorer runs.

A staff AI draft is an internal candidate. The job records its sources, template version and audience; human publication is separate. Client Q&A remains a later feature. Comments, client uploads, task boards, invoicing, payments and chat are outside the first release.

## 10. Acceptance checks

All checks below are proposed gates, not completed tests. Use fictional clients and named test accounts.

| ID | Scenario and required result |
| --- | --- |
| PW-01 | Approved stakeholder signs in with a code and sees only explicitly granted engagements. Unapproved or ungranted identities receive no project information. |
| PW-02 | Home and project pages accurately show status, latest published update and next action across multiple engagements and clients. |
| PW-03 | A review-only engagement omits unnecessary stages; event-based updates work without a weekly assumption. |
| PW-04 | A commercial-restricted viewer cannot receive pricing through HTML, JSON, links, exports, notifications or search. |
| PW-05 | An issued proposal remains readable and unchanged after a newer draft or accepted amendment exists. |
| PW-06 | An external agreement record identifies the acceptor and recorder separately and never appears from an ordinary acknowledgment. |
| PW-07 | A draft, internal estimate or AI candidate cannot appear in the client view before intentional publication. |
| PW-08 | Staff previews an exact revision for its audience; a concurrent edit prevents stale publication. Earlier updates remain available. |
| PW-09 | Revoking a stakeholder stops subsequent protected page, API, file and export requests, including direct internal-route aliases. |
| PW-10 | Keyboard, screen-reader labels, narrow layout, zoom and reduced motion permit the complete login-to-handoff journey. Focus and error messages remain understandable. |
| PW-11 | A booking and prospect conversion preserve source references without automatically granting portal access or exposing raw AI logs. |
| PW-12 | Provider outage or disabled private AI leaves manual authoring, client reading and downloads usable. |

