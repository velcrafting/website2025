# Delivery roadmap and release scope

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** PROPOSED IMPLEMENTATION SEQUENCE

## Delivery approach

Extend the existing Next.js repository with a public consulting experience, a separate private shell, shared typed records and narrow integrations. Keep the two experiences connected through selected brief revisions and explicit staff conversion. Do not make a prospect chat transcript the client system of record.

Build local, reviewable slices first. Add live services only when their configuration and scoped test evidence exist. A blocked account connection should not prevent useful work on content, deterministic exports, permissions, fixtures or recovery states.

The first public slice can ship as a useful explanation with the existing contact route. The complete requested deliverable also requires the optional conversational explorer, every-call recording, full meeting preparation and private workspace. Do not call the smaller slice the completed project.

## Scope by user and action

| User | Action | Required in the initial complete release | Later possibility |
| --- | --- | --- | --- |
| Visitor | Understand the process | Six freely explorable stages, useful copy, fictional examples and no-animation fallback. | More scenario examples when evidence supports them. |
| Visitor | Shape an idea | Optional conversation, service choices, confirmed/suggested/unknown fields, bounded generative UI and correction. | Rich visual mockups, larger catalogs and specialized agents. |
| Visitor | Adjust scope | Meaningful choices and their effects on work, dependencies and ownership. | A pricing estimator only after an owner-maintained pricing model exists. |
| Visitor | Leave early | Submitted question and every dispatched AI attempt remain in the restricted record. | Evaluated automated classification with human review rules. |
| Visitor | Export | Partial or reviewed brief as PDF, Markdown and copy, with exact revision and no new model request. | Additional document formats. |
| Prospect | Save progress | Optional verified email, own-session claim and authenticated resume. | Multi-device history controls after explicit account design. |
| Prospect | Schedule | Cal booking during exploration, Google Meet, owner/visitor participation, literal brief PDF and prepared notes attachment. | Group scheduling or more event types. |
| Prospect | Receive a reminder | One optional, consented unfinished-inquiry reminder with suppression and unsubscribe, disabled until adopted. | Broader campaigns under their own consent and controls. |
| Client stakeholder | Follow work | Accessible engagements, status, latest update, next action, shared records and files. | Notifications, structured client comments and uploads. |
| Commercial stakeholder | Review terms | Explicit commercial visibility and stable issued versions. | Established electronic signature integration if needed. |
| Staff | Manage engagement | Named access, structured private drafts, audience preview, publish/issue, agreement evidence, updates and delivery. | A larger administrative application only after manual operations reveal a need. |
| Staff | Understand usage | All-call ledger, restricted early questions, usage uncertainty, basic review labels and conversion linkage. | Advanced attribution and analysis after sufficient real data. |
| Staff | Operate integrations | Failed-job view, bounded retries, reconciliation, revocation and audit records. | More integrations and automation after verified demand. |

Payments, invoicing, sales pipelines, general chat, task boards and autonomous external agents are excluded. The scheduling and reminder requirements do need reliable background work; they do not require a general project-management system.

## Phase 0: implementation preflight

Read applicable AGENTS.md, these specifications, current source and installed-version documentation. Confirm the actual branch against the recorded baseline. Preserve existing work and establish a separate implementation branch or worktree. Inspect the package manager and lockfile before choosing new dependencies.

Create an implementation evidence ledger listing requirement, environment, revision, result and remaining gap. Resolve the internal private route namespace and shared/public layout split before building pages that rely on them. Verify the currently installed React peer range against the selected generative UI package. Record a narrow dependency decision rather than installing several competing frameworks.

**Exit:** a current source map, explicit package plan, disabled-by-default live integrations and a first implementation slice. Account checks can remain open while local work proceeds.

## Phase 1: useful public experience and deterministic brief

Build `/consulting`, service entry points, the non-linear process explorer and fictional examples in the existing design system. Keep ordinary scheduling/contact available without AI. Add the canonical brief schema, field provenance, revision behavior, local corrections and a deterministic export renderer using fictional fixtures.

Build the desktop conversation/brief arrangement and mobile navigation with an adapter stub. Fixed application controls own consent, sharing, export and booking. Test focus, zoom, reduced motion, readable no-animation content and HTML/URL sanitization.

**Exit:** the public process is understandable and the local brief/export flow works with fixtures. The actual model and new booking pipeline remain visibly unavailable until configured; do not substitute fake success responses.

## Phase 2: identity, private records and operation ledger

Implement the proposed data model in an authorized development environment, with constraints and explicit policies. Add named staff identity, separate prospect email verification, invite-only client login behavior, current-session claiming, grants and private file access.

Build the all-call operation/attempt ledger, restricted content store, cost-state model, atomic usage reservation and recovery. Add the narrow staff operations view. A provider call must be impossible before the corresponding durable record exists.

Prepare structured private authoring/import with validation, revision checks and audience projections. It may use a small staff UI or a local authenticated import tool. The same server mutation contracts should serve both; raw console edits are not the publication workflow.

**Exit:** two fictional clients remain isolated across direct interfaces; revocation and commercial projection work; the ledger handles simulated call failures without losing or inventing accounting evidence.

## Phase 3: bounded conversational shaping

Integrate AI SDK through a server-held Command Code compatible provider adapter. Use the account-authorized DeepSeek v4.1 Flash identifier. Verify streaming, structured-output support, usage fields and failure behavior in the selected versions. Do not accidentally route a plain model string through Gateway when direct Command Code is intended.

Use a small allowlisted component catalog, preferably json-render after compatibility is resolved. Keep UI state and allowed actions in application code. If the current package requires a broader React change than justified, use a compatible pinned release or the same typed catalog with native React while preserving its contract. Record this decision; do not force peer dependencies or add OpenUI as a second renderer.

Create a fictional evaluation set spanning review work, software, workflow/AI integration and communications. Check corrections, uncertainty, invented commitments, prompt injection, forbidden actions and invalid output. A model repair is another recorded and bounded provider attempt.

**Exit:** live provider evidence, if authorized and configured, proves correct model/route, durable input/output record, usage states, bounded failure and useful brief behavior. Fixture success alone does not open the public AI endpoint.

## Phase 4: export and meeting conversion

Complete protected PDF/Markdown exports and optional verified save/resume. Bind booking intent to the exact brief revision the visitor confirms. Keep Cal.com as the scheduling owner, validate signed webhooks and resolve the matching Google event through documented booking references.

Use an authorized owner Google connection to create private Drive artifacts, grant the intended recipients access and attach the brief PDF plus notes document to that event. Preserve attendee, conferencing and unrelated event content. Use durable processing for event preparation and reconciliation. Vercel Workflow is a candidate, subject to runtime, MDX configuration and cost checks; a properly durable database outbox/worker can satisfy the same contract.

Do not depend on a browser staying open or on an unawaited server task after the response. Persist event receipts and idempotent artifact states. A confirmed booking and completed meeting preparation are separate facts.

**Exit:** an authorized test event satisfies BOOK-03, both intended participants can open its artifacts, duplicate/rescheduled/cancelled/missed events reconcile correctly, and failures do not create a second booking. A secure-link-only fallback does not complete this phase.

## Phase 5: private client workspace

Build the private shell, login, accessible home, project/engagement navigation and shared content sections. Preserve meaningful previous phases through explicit grants. Add discovery, optional quote, proposal, kickoff, dated updates, decisions and delivery using the templates.

Finish exact-revision preview/publication, frozen issues, separate commercial rows, external agreement evidence, accepted baselines and amendments. Implement deliberate prospect conversion and explicit booking-artifact permissions. Keep raw AI logs and staff analysis out of client content.

**Exit:** one fictional engagement of each workflow type can be authored, published, reviewed by appropriate actors, amended and handed off. All denial paths pass. No client signing, commenting or uploading application is required.

Phase 5 can proceed in parallel with phases 3 and 4 once phase 2 contracts are stable. Avoid simultaneous edits to shared authorization and data definitions without a single owner.

## Phase 6: retention, limited follow-up and operations

Implement retention jobs, content expiry, provider/accounting reconciliation, reminder consent, one-send idempotency and suppression. Use one eligibility function for queueing, send-time recheck and manual operations. Handle pending bookings, explicit brief sharing, recent replies, manual contact, unsubscribe, deletion, bounces and complaints.

The reminder remains disabled until the owner adopts the schedule/copy and sender readiness is verified. Add a small operational guide: disable AI, revoke an account, find failed preparation, retry safely, delete an inquiry, review unknown costs and recover a pending job. Record actual limits and owners in private operational configuration.

**Exit:** retention and reminder scenarios pass with fixtures, and only the specifically authorized real checks are performed. Recovery is usable by the owner without a developer reconstructing database state.

## Phase 7: release evidence and controlled activation

Run focused repository checks and the end-to-end matrix. Recheck direct private namespace aliases, Vercel preview hosts, mobile layouts, cross-client file delivery, background-job authorization and cache behavior. Verify real account connections separately from local fixtures.

Prepare a concrete release review with changed behavior, exact migration/configuration actions, proof, remaining gaps, rollback and the proposed activation sequence. DNS, domain attachment, production migrations, sender configuration and live invitations need authority for those specific actions. Do not change them merely because a documentation PR exists.

**Exit:** owner-reviewed release evidence and actual successful journeys for the enabled surfaces. Keep incomplete integrations disabled with accurate fallback copy. Record subsequent production verification instead of treating a successful build as completion.

## Implementation PR boundaries

Prefer separate PRs for the public foundation, security/data contracts, shaping, meeting conversion and workspace publication. Each should explain the user problem, resulting behavior, tests and unverified dependencies. Keep lockfile changes with the feature that requires them. Include no client records or private operational config in fixtures or PR descriptions.

Do not estimate calendar delivery dates from these phases. The live authentication, provider and Google attachment gates determine effort that cannot be proven from repository inspection alone.
