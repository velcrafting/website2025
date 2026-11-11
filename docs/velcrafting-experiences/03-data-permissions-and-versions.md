# Data, permissions and document versions

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** REVIEW DRAFT, IMPLEMENTATION SPECIFICATION  
**Companion:** [Private workspace](02-private-workspace.md)

## 1. Architecture boundaries

Supabase is the selected identity, relational-data and private-file direction. Actual project configuration, grants, email delivery, storage policies and hosting remain unverified. This is a proposed logical model, not applied migrations or an assurance about a live database.

Keep authoritative business state in the application database. AI outputs, workflow runs, calendar events and uploaded files reference that state; they do not establish scope, identity or agreement by themselves.

Separate three access domains: public explorer sessions, staff-only prospect operations, and named-stakeholder client engagements. A prospect can move between them only through explicit, attributable operations.

The existing editorial database role has broad access to editorial tables. Do not extend that role or its USING(true) policies to client/prospect tables. Relevant repository sources: [editor adapter](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/editor/repository/postgres.ts), [editor security migration](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/db/postgres/002-editor-security.sql).

## 2. Core logical records

Physical table grouping can be simplified during implementation when it preserves the boundaries below. Versioned structured JSON is appropriate for different content templates; access, relationships and lifecycle fields remain explicit.

| Record | Required fields and responsibility |
| --- | --- |
| profile | Auth user ID, display name, lifecycle state and verification references. No user-editable authorization flags. |
| client | ID, display name, status and timestamps. A client is an organization or relationship, not an email domain. |
| project | ID, client ID, title, purpose and status. Groups related engagements. |
| engagement | ID, project ID, client ID, objective, owner, selected template/version, relevant stages, status, next action and update arrangement. |
| client_membership | User ID, client ID, active/revoked state, authorizer, granted/revoked timestamps. Establishes a relationship, not access to every engagement. |
| engagement_grant | User ID, engagement ID, commercial visibility, role/authority reference, status, authorizer and timestamps. Enumerates permitted work. |
| staff_access | Named user, capabilities and applicable client scope. Initial owner can have all capabilities; grants remain explicit. |
| content_item | Engagement ID, kind, audience, current draft revision and current published revision. Kinds include discovery, kickoff, update, decision, delivery and internal estimate. |
| content_revision | Item ID, engagement ID, revision number, structured body, source references, template version, author and creation time. Append-only revision content. |
| commercial_revision | Engagement ID, structured pricing/terms, version, author and creation time. Stored separately from ordinary client content. |
| issued_document | Engagement ID, document kind, document/version number, exact shared and commercial revision IDs, issue time, issuer, integrity reference and predecessor. Frozen composition. |
| agreement_evidence | Exact issued-document references, acceptor, authority basis, actual agreement time, private evidence, staff recorder and recorded time. |
| file_record | Engagement, prospect or booking scope, audience, private object key/version, original name, media type, size, integrity value and lifecycle. |
| audit_event | Actor, action, scope, target/revision, time, correlation ID and minimal attributable change summary. No secrets or unnecessary raw content. |

Record identifiers must not encode client names, email addresses or secrets. Human-readable labels are presentation data, never security controls.

## 3. Prospect and conversion records

Use the shared names below to align the public explorer, logging and scheduling specifications:

| Record | Relationship to the private workspace |
| --- | --- |
| explorer_session | Anonymous or claimed exploration context. Possession of a valid session capability is not an individual identity or client membership. |
| brief_revision | Immutable visitor brief snapshot with confirmed values, model suggestions and unknowns distinguished. Exports and bookings reference an exact revision. |
| prospect_contact | Supplied contact fields, source and verification state. Never treat typed email as verified identity. |
| followup_consent | Purpose, contact, consent state, wording/version, time and withdrawal. Separate from transactional booking notices. |
| ai_operation | One user action requesting AI work; references the session or authorized engagement and operation purpose. |
| ai_call_attempt | Each provider attempt, retry and outcome. Cost status is pending, estimated, verified or unavailable; subscription credits remain distinct from currency. |
| ai_content | Restricted input/output record or content references for the attempt. Not client-published by default. |
| booking | Scheduling/provider references, meeting lifecycle, attendee linkage and exact brief revision. Follow the scheduling specification for retries and attachment handling. |
| booking_artifact_grant | Booking/artifact, verified recipient identity, permitted action, authorizer and revocation. Grants selected brief/notes access without client membership. |
| prospect_conversion | Selected prospect/brief/booking IDs, destination engagement, converting staff member, time and imported record references. |

Log every triggered call as required by the owner, including abandoned exploration. That requirement does not mean capturing unsubmitted keystrokes or making logs available to clients. The detailed ledger and retention policy live in [AI observability and data](04-ai-observability-and-data.md).

Public email verification uses a separate, server-rate-limited Supabase enrollment/OTP flow. Keep unrestricted signup disabled; isolate any privileged account provisioning in a narrow server-only operation. It creates identity without client membership or authorization. Client-host login does not create accounts. Claim only the current session after verified email proof and its existing session capability. Contact capture, verification and client access are distinct states.

Conversion must be staff initiated and idempotent. It can create an engagement or attach selected context to an existing one. The operator reviews the destination and information being imported. Matching email alone must not merge unrelated sessions, clients or private records. Retain provenance without exposing raw operational logs.

## 4. Relationship and lifecycle invariants

Enforce relationships in the database, not only in form validation:

- Every project belongs to one client; every engagement belongs to one matching project/client.
- Child records cannot reference an engagement and a parent from different clients. Use scoped foreign-key constraints or equivalent database-enforced relationships.
- A user needs active client membership and an active grant for the specific engagement. Project navigation derives from accessible engagements.
- A project-level convenience operation materializes grants for explicitly selected engagements. It does not create automatic access to future phases.
- A grant cannot outlive a revoked client membership. Revocation remains an attributable event.
- Published revisions, issued snapshots, agreement evidence and accepted amendments cannot be silently overwritten.
- A shared content revision must not embed a restricted commercial body, raw internal estimate, secret or inaccessible attachment.
- Unique document version numbers are scoped to a document family/engagement. IDs alone never determine access.
- A booked meeting, verified email, completed AI job or exported brief cannot create agreement or engagement grants.
- Store timestamps consistently and present the relevant timezone. Preserve unknown historical agreement times as unknown.

Archive marks work inactive while preserving authorized history. It is not a deletion mechanism and must not restore revoked access. Retention disposal must account for legal/business record needs and the explicitly adopted policy; do not cascade-delete accepted agreements when removing an Auth identity.

## 5. Permission model

Keep three concepts separate: viewing work, viewing commercial details and having authority to agree.

| Actor | Shared published work | Internal drafts/estimates | Commercial records | Publish or issue | Manage access | Record external agreement |
| --- | --- | --- | --- | --- | --- | --- |
| Anonymous prospect | Own permitted explorer state only | No | No | No | No | No |
| Client viewer | Granted engagements | No | Only with commercial grant | No | No | No |
| Recorded approver | Same viewing rules | No | Only with commercial grant | No | No | No portal signing in MVP |
| Staff operator | Within staff scope | Within staff scope | Separate capability | Separate capability | Separate capability | Separate capability |
| Public website editor | No client/prospect access | No | No | Public content only | No | No |

“Approver” describes established authority for a particular decision or engagement. It does not automatically grant access to prices or let the user perform every action. The first release records external agreement rather than implementing client signing.

The single-owner business can assign all staff capabilities to one named operator. Separate capability checks still make actions attributable and allow later limited assistance without a redesign.

## 6. Server authorization and RLS intent

Every protected page, API, server action, stream, export and download must verify the actor and current resource permission. Centralize this logic in a server-side access layer, then enforce compatible row-level policies as defense in depth.

For client reads, the policy intent is: verified account; active client membership; active grant for the record's engagement; allowed publication state; and permitted audience. Commercial rows require the additional commercial grant. Internal rows require staff authority. Filtering after loading broad client data is insufficient.

Use the current supported Supabase SSR identity validation. Do not authorize from user-editable metadata, browser role fields, URL tenant IDs or a getSession result without validation. Membership and revocation checks read authoritative database state rather than relying solely on stale JWT role claims. Sources: [SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Enable RLS for every exposed data table and explicitly review schema/table grants. Database views, functions, RPCs and storage policies require the same scrutiny. Do not solve an access problem by introducing an unrestricted security-definer function or a service credential on ordinary user requests.

Public explorer endpoints receive only their defined session capability or a verified identity explicitly bound to that session. They cannot query client tables. A booking artifact requires its own explicit recipient grant. Anonymous database roles must not browse prospects, call contents or bookings. Staff analytics can aggregate restricted call records without exposing them through public reporting APIs.

## 7. Mutation and publication contracts

All mutations require a named staff capability or a narrowly scoped public operation.

A draft save supplies the expected current revision. A conflicting save returns a conflict with the current version and preserves both useful work and the opportunity to reconcile. No last-write-wins overwrite of a reviewed candidate.

Publication supplies the exact candidate revision, audience and expected published baseline. In one transaction, verify ownership, authorization, version freshness and audience constraints, then update the published pointer and append the audit event. A retry key makes a repeated operation return the original result.

Issuing a document freezes the shared/commercial revision composition, version label and integrity reference. Enforce immutability through database constraints, privileges or narrow mutation functions. Object files supporting the issued snapshot are versioned and must not be replaced under a mutable key.

Changing access requires a separate capability and audit event. Any pending export, background job or publication rechecks permission before its next protected read and before committing a result. Worker credentials must be scoped to the operation; possession of an internal job ID does not establish permission.

State-changing browser requests use origin/CSRF protection appropriate to the session architecture. Validate every input server-side, including expected versions and idempotency keys. A model-generated action is never an authorization decision.

## 8. Issued versions, accepted baselines and amendments

Use these distinct states:

| State | Meaning |
| --- | --- |
| Draft revision | Editable through new revisions; not intentionally issued to the client. |
| Issued document | A dated, frozen composition available to its authorized audience. |
| Superseded issue | An earlier issue retained for history; not deleted or rewritten. |
| Agreement recorded | Staff has recorded evidence concerning an exact issue or amendment. |
| Accepted baseline | The issue and accepted amendments designated as the engagement's currently agreed scope. |
| Proposed change | New work or terms awaiting the relevant authorized decision. |

An agreement record must contain the exact proposal version, relevant quote/terms version, acceptor's name and organization, evidence of identity, authority basis and limits, actual agreement time if known, evidence file/reference, recorder and recording time. The acceptor and recorder are separate fields.

Record an external email or executed agreement faithfully. Do not infer consent from silence, attendance, clicking a file or acknowledging receipt. The application records evidence; it does not claim that any particular message is legally sufficient. Formal execution, when required, uses an established signing workflow and stores its output.

A correction adds an attributable record explaining the error and its replacement; it does not erase the original evidence. If authority or version cannot be verified, keep the agreement pending verification and do not advance the accepted baseline.

An amendment references the prior baseline and explains changed scope, responsibilities, dependencies and commercial effects. Its own agreement evidence is required before it joins the accepted baseline. An optional consolidated view is derived from the baseline plus accepted amendments and shows those sources. A newer draft never silently becomes the agreed version.

## 9. Files, sessions, exports and generated content

Private files must stay in private buckets, with application and storage authorization aligned. Supabase supports authenticated downloads and time-limited signed URLs; public buckets bypass retrieval controls. See [storage access models](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Prefer authorization on each download for sensitive commercial records. If signed URLs are used, keep lifetimes short and document that an already-issued URL can remain usable until expiry. A recipient can also retain an already-downloaded export. Do not promise recall of distributed files.

File generation receives an authorized content snapshot, not arbitrary record IDs from a model. The artifact records exact version, audience, creator, creation time and object integrity. Generated files, logs, caches, error traces and search indexes must preserve the same scope.

Validate sessions using the documented mechanism and apply current grants on every request. Supabase access tokens can outlast sign-out until expiry; sensitive staff writes can require a fresh session-validity check. Record a deactivated application profile to deny access immediately independent of token lifetime. See [session behavior](https://supabase.com/docs/guides/auth/sessions).

Use private/no-store caching for personalized and token-setting responses. Never place client responses in shared CDN caches, public search indexes, public metadata, source maps or preview fixtures. Log minimal denial details without leaking resource existence.

AI jobs are scoped to their initiating actor, engagement, audience and exact input revisions. Restricted commercial data is excluded before model context construction when the audience lacks access. A completed job produces a candidate, not publication or agreement. The selected provider is Command Code with DeepSeek v4.1 Flash; actual private-data settings require verification before use.

## 10. Acceptance and adversarial checks

Use two fictional clients, multiple engagements, a noncommercial viewer, a commercial viewer, an approver, a revoked user and a named staff operator.

| ID | Required result |
| --- | --- |
| DP-01 | Changing a URL, body ID or query filter to another client fails across pages, APIs, RPCs, files, exports, jobs and streams. |
| DP-02 | A stakeholder granted one phase cannot enumerate previous or future phases without a separate grant. |
| DP-03 | Updating user metadata or browser-supplied roles cannot increase access. A valid identity with no grant sees no client data. |
| DP-04 | A commercial viewer receives pricing; a normal viewer receives no pricing bytes or restricted attachment references. |
| DP-05 | Direct use of the public/editor database role cannot read client, commercial, prospect or AI-content records. |
| DP-06 | Forged parent relationships and cross-engagement revision references fail at the database boundary. |
| DP-07 | Concurrent draft saves or stale publication attempts produce a conflict; retries do not duplicate publication. |
| DP-08 | Issued snapshots and their stored artifacts resist overwrite; later drafts leave the accepted baseline unchanged. |
| DP-09 | Missing acceptor authority, mismatched versions or acknowledgment-only evidence cannot establish an accepted baseline. |
| DP-10 | An amendment requires its own evidence; a consolidated view remains traceable to the original issue and accepted amendments. |
| DP-11 | Revocation blocks subsequent protected work even with an unexpired token and while a background job is paused. |
| DP-12 | Prospect verification claims only the presented session; verified email and booking presence cannot grant client access, merge another person's history or reveal artifacts outside an explicit booking grant. |
| DP-13 | A prospect conversion is explicit, scoped and idempotent; internal AI logs remain staff-only. |
| DP-14 | Exported content matches its exact permitted revision; direct storage access and cross-user cached responses fail. |

These are implementation gates. No database policies, account configuration or live checks were applied by this document.

