# Implementation agent instructions

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** READY FOR OWNER-INITIATED IMPLEMENTATION

## When this instruction applies

Use this document when the owner asks an agent to begin implementation. The documentation PR alone does not authorize production changes, model spending, invitations, domain changes or permission changes. The current deliverable is the plan and handoff.

When implementation is requested, build the specified features in a local checkout and reviewable implementation PRs. Progress through work that is authorized and possible. Do not stop at another general plan, reopen settled product decisions or call fixtures a completed integration.

## Objective

Implement the connected Velcrafting `/consulting` experience and `client.velcrafting.com` workspace in `velcrafting/website2025`, following this packet. Preserve the existing public site, editorial identity and truthful portfolio maturity labels.

The complete target includes optional conversational shaping, recorded AI calls from the first question, deterministic brief export, scheduling with Google Meet and literal private meeting attachments, and a secure client record with immutable commercial baselines.

## First actions

1. Locate the actual repository and inspect `git status`, current HEAD and applicable AGENTS.md before changing files. Preserve uncommitted user work. Use an isolated branch/worktree if needed.
2. Read [README](README.md), [baseline](00-repository-baseline.md), [roadmap](06-delivery-roadmap.md), [data and permissions](03-data-permissions-and-versions.md), and [integration readiness](09-integration-readiness.md). Read the relevant feature specification before editing it.
3. Compare the current code with the reviewed baseline `7a2da367d924c67133dce7a32daaafcbaf271480`. Source has priority over stale path/version assumptions. Read installed-version documentation, including current Supabase and AI SDK guidance, before coding integrations.
4. Make a short, concrete implementation checklist with test evidence and open account gates. Then start the first functional slice. Do not create or modify an AGENTS.md merely to restate this packet.
5. If an account gate is unavailable, implement the adapter, failure behavior and fictional fixtures, then continue independent work. Report the exact unverified capability instead of inventing credentials, broadening permissions or silently choosing another provider.

## Selected product decisions

- Public explanation at `/consulting`, with freely explorable Discovery, Quote, Proposal, Start, Updates and Delivery. Stages are optional per engagement and updates are not inherently weekly.
- Conversation is optional for the visitor and part of the full deliverable. No email gate for exploration or export.
- AI SDK directly calls Command Code's Provider API through an explicitly configured compatible provider. Candidate model: `deepseek/deepseek-v4.1-flash`, subject to actual account catalog verification. No GPT, MiniMax, Gateway or alternate-model fallback without a later owner decision.
- Every physical provider attempt has a durable private record before dispatch. Retain submitted content and outputs under the adopted retention policy, including early questions and abandoned sessions. Do not record unsent keystrokes.
- Supabase email one-time codes identify named stakeholders. Client membership and engagement grants are separate. A prospect OTP or booked meeting creates no client access.
- Record external agreement to exact issued quote/proposal versions. Do not build a signing product or infer authority from possession of an email account.
- Reuse private structured templates and a narrow authoring/publishing operation. Filled records and operational master copies never go into public repository files.
- PDF, Markdown and copy exports include the exact partial or reviewed brief. Export does not require a model call.
- The existing Cal.com destination is the scheduling starting point. The final meeting must have owner/visitor participation, Google Meet, a literal private brief PDF attachment and a prepared notes attachment, with tested recipient access.
- Early email capture is optional. One proposed unfinished-inquiry reminder is separate consent, initially disabled. No newsletter enrollment or campaign system.
- Scope controls explain work and dependencies. No invented prices, guaranteed outcomes or delivery timelines.

## First implementation slice

Begin with roadmap phases 0 and 1. Build the consulting page, non-linear process explorer, four service entry points and fictional stage examples using the current design tokens. Keep ordinary contact and scheduling available. Add canonical brief state, safe visitor edits, clear unknowns, a small component catalog and deterministic export fixtures. Use provider and booking adapters with honest unavailable states.

Make the first PR reviewable through the actual rendered mobile/desktop page, keyboard behavior, no-animation view, sample export and a concise evidence report. A generic chat box with a fake booking success is insufficient.

Continue with the identity/data boundary and ledger before activating inference. The private workspace can proceed after those contracts stabilize, while account-dependent booking integration is developed separately.

## Architectural contracts

### Source and routing

Reuse the existing Next.js application. Refactor the current public root shell only as needed to support separate public and client shells and metadata. Use an explicit internal route namespace such as `/client-workspace` to avoid collisions with public `/projects`. Protect the internal namespace and friendly client-host aliases on every host, including preview and default deployment URLs.

Keep data access, provider integration, export generation, booking orchestration and UI rendering in clear modules. Proposed names in the specs are contracts, not proof that matching files already exist. Avoid unrelated site redesign and broad dependency upgrades.

### Authoritative records

Use immutable `brief_revision` snapshots, operation/attempt IDs, exact document revisions and scoped relationships. Visitor edits and confirmed facts are canonical application state. A generated layout, transcript summary, model tool call or event webhook cannot establish identity, grant access, change agreed scope or publish work.

Use the shared names in the data, AI and booking specifications. `confirm_booking_share` records the exact revision/recipients and `shared_for_booking` state. There is no additional general inquiry form in this release. Reconcile stale versions rather than overwriting newer user work.

The same operation can record an explicit no-brief choice as `no_brief_confirmed`. That branch needs Meet and notes without a fabricated brief. The booking worker checks the stored material choice, exact revision, recipients and verified contact before sharing; a webhook cannot authorize those grants.

### Authorization

Require server identity/session validation and current permissions on pages, APIs, server actions, streams, downloads, exports and workers. Apply matching database and storage policies. Test direct requests, not only hidden navigation.

Separate client membership, engagement grants, commercial visibility, recorded approval authority and staff capabilities. Do not reuse ADMIN_KEY as a person's identity, rely on user metadata, give the editorial role client access or use a privileged database client as the general query path.

Prospect enrollment uses established Supabase capabilities through a narrow, rate-limited server operation. Client login does not create arbitrary accounts. Claim only the current session after email proof plus its existing capability. Keep public and client cookies scoped deliberately.

### AI controls

Record input and operation, reserve allowance and create the attempt before provider dispatch. Instrument or disable hidden retries so every physical call is represented. A repair call is another attempt. Failed storage blocks inference; browser disconnect does not imply cancellation or zero cost.

Keep cost pending, estimated, verified or unavailable. Name provider units and preserve evidence. Do not report a prepaid request as verified zero. Add explicit production usage, size, concurrency and retry limits before enabling anonymous traffic.

Validate the small component catalog and action schema server-side and client-side where relevant. Never run model-supplied code, arbitrary HTML, external URLs or unauthorized tools. The public model has no client-data retrieval tool. Private staff drafting, if enabled later, creates internal candidates with source and audience records.

### Meeting conversion

Cal remains the single booking owner. Persist and verify webhook events, bind the exact booking intent, resolve the corresponding Google event and attach private Drive artifacts through the authorized owner connection. Keep Calendar attachment presence and Drive file access as separate checks.

Use durable jobs and idempotent receipts for preparation, retries and reconciliation. Preserve existing event participants, Meet details and unrelated attachments. No duplicate Calendar event workaround. Track booking status separately from preparation status. Secure links alone do not satisfy the required literal attachment result.

Notes are a prepared shared document by default. Do not claim automatic recording, transcription or Meet-generated notes without separately verified account features and participant handling.

### Publishing and agreement

Use exact-revision audience preview, stale-write protection, attributable publication and frozen issued snapshots. Project restricted fields out of client responses and exports before serialization. Do not rely on a hidden panel or a protected link to hide the existence of restricted commercial evidence.

Record who agreed, their authority, which exact versions, when agreement occurred, the evidence, who recorded it and when. Missing authority or ambiguous version remains pending. Later changes use separate versions/amendments and evidence. Current accepted scope remains identifiable.

## Validation and evidence

Implement the journeys in [end-to-end acceptance](07-end-to-end-acceptance.md). Prioritize two-client isolation, commercial projection, direct file access, revocation, race conditions, immutable accepted versions, durable call recording and literal meeting attachments.

Use the repository's actual package manager and scripts. The inspected manifest has lint, typecheck and build scripts and specific editor/design tests, not a generic test script. Add targeted tests for new security and recovery boundaries. Do not write superficial tests that only restate the implementation.

Use fictional records and controlled test recipients. Store detailed live evidence privately when it contains identifiers, transcripts or access tokens. In PRs, report which checks were mocked, which used real integrations and which remain blocked. A successful build does not prove a deployed user journey.

## External actions and release boundaries

Local implementation authorization does not by itself authorize production migrations, DNS/domain changes, adding secrets or API keys, changing account permissions, spending credits, purchasing capacity, sending invitations/reminders, publishing client content or merging/deploying. Before any such action, use the authority already present in the active user session; if it is absent, finish the concrete local result and request only the missing scoped decision.

Do not ask again for already approved actions. Do not let one missing external connection stop independent authorized implementation. Never work around an access denial by switching credentials or widening privileges.

If repository automation creates a preview after a PR, report the observed state accurately. Do not trigger a separate deployment or change workflow settings without authority. Never put real client/prospect data into previews or fixtures.

## Completion report

For each implementation slice report:

1. The working user behavior and changed source paths.
2. Tests run and observed results, including screenshots/artifacts where useful.
3. Account or production checks that remain unverified.
4. Exact next configuration or decision needed, with a reviewable proposal.
5. The PR and any known material limitations.

Do not call the complete deliverable finished until the enabled public and private journeys and the required full meeting conversion pass their corresponding evidence gates.

## Copyable kickoff instruction

```text
Begin implementing the Velcrafting consulting and client experiences from
docs/velcrafting-experiences/AGENT-START.md in velcrafting/website2025.

Read applicable AGENTS.md, inspect the current checkout, and follow this handoff.
Start with roadmap phases 0 and 1, then continue in reviewable implementation
PRs through the authorized local work. Preserve the existing design system.

Use Command Code with DeepSeek v4.1 Flash for AI integrations. Build durable
records for every provider attempt before enabling inference. Keep live AI,
messages and account-dependent integrations disabled until their readiness
checks and required authority are in place.

Do not make production, permission, spending, invitation or deployment changes
without authority for those actions. Continue useful local work around blocked
account connections. Report working behavior, actual test evidence and the
specific remaining integration gates.
```
