# Integration readiness and launch gates

**Version:** 0.3  
**Date:** 2026-11-10  
**Status:** REVIEW DRAFT, IMPLEMENTATION HANDOFF  
No dependencies, accounts, keys, infrastructure, invitations or production behavior are changed by this document.

## 1. Selected direction and verified boundary

Proceed with the existing Next.js App Router application and Node 22 runtime. The inspected repository uses Next.js 15.5.25 and React 19.1.0. Preserve its MDX configuration, current design system and existing public routes. The read-only Vercel baseline did not establish a configured client application: `client.velcrafting.com` was not attached in the inspected project/domain inventory. This does not prove the absence of DNS records or configuration elsewhere. Verify ownership, DNS, routing, certificates and the intended Vercel project before any eventual domain change.

The chosen integration direction is **AI SDK directly to Command Code**, **Supabase email codes for named users**, and **Cal.com for scheduling**. These choices do not need to be reopened. Account-specific capabilities remain unverified, including legacy Command Code entitlement, a usable Supabase project, production email delivery and the owner's Google integration.

Implement local behavior and provider boundaries first. A working fixture proves application behavior; it does not establish live account readiness. Track each gate as unverified, verified with dated evidence, or blocked with a concrete reason.

## 2. AI and interactive UI

### Command Code is the first provider

Use an explicitly constructed AI SDK OpenAI-compatible provider adapter with base URL `https://api.commandcode.ai/provider/v1`. The candidate model is `deepseek/deepseek-v4.1-flash`, subject to confirmation against the account's current model catalog. Command Code documents compatible API endpoints and API access for plans other than Go; coding-plan usage is charged against plan credits and permitted models. Public documentation cannot verify this owner's legacy subscription or remaining entitlement. Do not describe usage as unlimited or free. [1][2]

Before an authorized live test, confirm account access, model identity, supported request format, streaming, structured output, usage reporting, throttling and data-handling terms. Use one small, non-sensitive request after authorization to validate the actual path. Record its operation and physical attempt using the same observability contract required for every subsequent call. A successful CLI conversation is insufficient evidence for the website integration.

Keep credentials server-side. Explicitly set the compatible provider instance so a plain model string cannot accidentally select AI Gateway. Disable implicit SDK/provider retries or instrument every physical retry. If access, credits, audit persistence or the selected model fails, retain the editable brief and scheduling path, explain that assisted shaping is unavailable, and stop new paid attempts. There is no automatic GPT, MiniMax or Gateway fallback.

### Keep generation bounded

Recommend json-render for a small, approved catalog of brief cards, option controls and question components. Validate schema, component names, properties and action references before rendering. The model cannot supply executable code, arbitrary HTML, unrestricted URLs or new privileges. Server actions independently validate every request. A conventional form/card renderer remains the fallback for malformed output or package incompatibility. [3]

The upstream React package metadata inspected during this review specifies peer React `^19.2.3`, while this repository uses 19.1.0. Resolve this deliberately before installation: pin a compatible supported release, or plan a compatible React/Next update with focused regression checks. Verify the actual published package and lockfile rather than copying current `main` metadata as a release guarantee. Do not bypass peer checks to force installation.

OpenUI is a valid alternative with its own renderer and component-library approach. Evaluate it only if json-render fails the compatibility or interaction spike; do not ship both frameworks. Chat SDK serves messaging-platform integrations such as later Slack/Teams experiences. It is not required for the website's conversational interface. [4][5]

### Gateway and Workflow have separate jobs

The documented Command Code CLI integration with Vercel AI Gateway routes the CLI's requests **to Gateway using Gateway credentials**. It does not establish that a Command Code subscription key can be imported into Gateway as a supported upstream provider. Keep Gateway outside this release unless separately verified and deliberately adopted. [6]

Workflow SDK is optional infrastructure for durable booking preparation, retries, reconciliation and delayed reminders. Its Next.js integration wraps configuration with `withWorkflow`. Check composition with this repository's existing MDX wrapper, generated workflow routes, middleware and build caching before adoption. A database-backed outbox and reliable worker are an acceptable simpler implementation if they satisfy the same recovery tests. No in-memory timer should be the sole mechanism for a delayed email. Workflow selection must not change the chosen AI provider or make paid operations replay blindly. [7]

## 3. Private workspace and email readiness

Use Supabase's established email-code flow with verified server sessions. Configure email templates, code expiry, resend and verification limits, allowed origins/redirects, logout and recovery. Prospect email verification does not create client membership. Membership and project permissions come from staff-managed records, not email-domain inference or user-editable metadata. No live Supabase project access has been confirmed. [8]

Select compatible, pinned Supabase packages for the existing Next.js version. Configure cookie-based server integration and verify identity at protected page, API, action and file boundaries. Apply current membership checks on sensitive operations so stale claims cannot preserve removed access. Avoid caching private responses across users. Do not assume public and client hosts should share a broad domain cookie. [9]

For database access, inspect exposed schemas, table grants and RLS separately. Current Supabase changes mean table creation does not imply Data API exposure. Grant only required operations and enforce tenant/project predicates with RLS; protect views, functions and privileged paths as well. Test the Data API directly. Private files require private buckets, storage policies and authorization before a download or short-lived signed URL. Never expose a server secret/service-role key to the browser. [10][11]

Production email-code delivery requires a verified sender. Supabase documents its default SMTP service as restricted and unsuitable for production; configure custom SMTP or an appropriate supported send-email hook. Verify sender-domain records, external recipient delivery, message templates, rate limits and failure handling. Keep authentication delivery separate from optional reminder traffic. Reminder sending remains disabled until owner review and delivery/consent checks pass. [12]

## 4. Booking and Google integration

The current public scheduling URL comes from `src/config/site.ts`: `https://cal.com/spajewski/30min`. Verify the intended owner/event type, Google Calendar connection, Google Meet location, API entitlement and signed-webhook configuration. Inspect applicable request limits and retry guidance without assuming a particular subscription tier.

Cal's booking-reference API supplies `eventUid` and `destinationCalendarId`. Prove the Google reference identifies the exact event before attaching anything. Use an authorized owner OAuth connection with the narrowest practical Calendar/Drive grants. Create a private brief PDF and agenda/notes document, grant access only to named intended participants, and attach them to the existing event. Check access for an external recipient, including someone without a Google account if that is an expected client case. Do not make files public to bypass an account policy. [13][14]

Cal remains the single booking owner. A failed Google attachment step leaves the meeting booked and documents pending; it does not create a replacement event or duplicate invite. Confirm webhook signatures, duplicate handling, rescheduling, cancellation, partial-failure recovery and missed-event reconciliation. Meet automatic notes/transcription remain optional and account/consent-dependent. See [the complete booking specification](05-booking-export-and-follow-up.md).

## 5. Dependency gates

| Dependency | Proof required | Fallback and launch behavior |
| --- | --- | --- |
| Runtime and UI packages | Reproducible Node 22 build; selected SDK versions and React peers compatible; MDX/public routes preserved. | Use existing deterministic components. Do not force incompatible dependencies. |
| Command Code | Authorized API request returns selected model output and usage; actual plan permits access; limits and data handling understood. | Assisted shaping disabled; static exploration, editing/export and contact remain available. No provider switch. |
| AI records and limits | Every physical attempt recorded; budgets/concurrency enforced; failures and unknown usage reconciled. | Fail closed for new AI calls while preserving visitor work. |
| Supabase and sessions | Intended project, migrations, session handling, explicit membership, direct API/RLS and private-file isolation verified. | Private workspace cannot launch with real client data. |
| Authentication sender | Codes reach approved external test recipients; expiry, resend limits and recovery work. | Keep private login unreleased; do not substitute shared passcodes. |
| Client host | Correct project attachment, DNS, TLS, host routing, cookies and direct-link protection verified. | Keep client-host release pending. The public page can launch independently. |
| Cal/Google | Exact event mapping, Meet, named participants, literal attachments and recipient access pass real integration tests. | Show explicit preparation failure; a private link is a degraded fallback, not attachment completion. |
| Durable jobs/reminders | Retry/reconcile behavior, suppression, consent and delivery idempotency verified. | Use staff-visible recovery tasks; automated reminder sending remains disabled. |

## 6. Proposed configuration inventory

These are candidate names for the implementation, not existing variables or instructions to create secrets now. Keep credentials in the deployment's approved secret mechanism, with separate development/preview/production values. Commit only safe examples.

| Proposed setting | Purpose |
| --- | --- |
| `AI_PROVIDER=command-code` | Explicit application provider selection. |
| `COMMAND_CODE_BASE_URL=https://api.commandcode.ai/provider/v1` | Server-controlled endpoint; never supplied by a visitor. |
| `COMMAND_CODE_MODEL=deepseek/deepseek-v4.1-flash` | Candidate model, verified before activation. |
| `CMD_API_KEY` | Server-only Command Code credential, value omitted. |
| `AI_SHAPING_ENABLED`, `FOLLOWUP_SEND_ENABLED` | Independent feature gates, initially false in connected environments. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public connection metadata where the chosen integration requires it. RLS still applies. |
| `SUPABASE_SECRET_KEY` | Server-only privileged operations, if necessary, never a general authorization shortcut. |
| `CAL_API_TOKEN`, `CAL_WEBHOOK_SECRET` | Server-only scheduling integration and webhook verification. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth application configuration. Store owner token grants securely outside public configuration. |
| `PUBLIC_SITE_ORIGIN`, `CLIENT_SITE_ORIGIN` | Explicit canonical origins used for routing, redirects and validation. |

Choose rate, concurrency, retention and spend limits in validated server configuration. Do not embed account identifiers, keys, subscription costs or real client examples in this public documentation packet.

## Official references

1. [Command Code Provider API](https://commandcode.ai/docs/provider).
2. [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers).
3. [json-render repository](https://github.com/vercel-labs/json-render) and [pinned React package metadata](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/react/package.json).
4. [OpenUI repository](https://github.com/thesysdev/openui).
5. [Chat SDK](https://chat-sdk.dev/docs).
6. [Command Code with AI Gateway](https://vercel.com/docs/ai-gateway/coding-agents/command-code) and [Gateway authentication/BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok).
7. [Workflow Next.js integration](https://workflow-sdk.dev/docs/getting-started/next).
8. [Supabase email-code authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless).
9. [Supabase server-side integration](https://supabase.com/docs/guides/auth/server-side).
10. [Supabase securing the Data API](https://supabase.com/docs/guides/api/securing-your-api) and [changelog](https://supabase.com/changelog).
11. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
12. [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
13. [Cal.com booking references](https://cal.com/docs/api-reference/v2/bookings/get-booking-references).
14. [Google Calendar attachments](https://developers.google.com/workspace/calendar/api/guides/create-events) and [Drive sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing).
