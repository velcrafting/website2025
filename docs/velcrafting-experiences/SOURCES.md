# Sources and evidence limits

**Reviewed:** 2026-11-10  
**Packet:** 0.3  
**Purpose:** Separate observed source/configuration from proposed product behavior.

## Repository evidence

Repository baseline: [website2025 commit 7a2da367d924c67133dce7a32daaafcbaf271480](https://github.com/velcrafting/website2025/commit/7a2da367d924c67133dce7a32daaafcbaf271480).

| Source | Evidence used |
| --- | --- |
| [package.json](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/package.json) and [lockfile](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/package-lock.json) | Stack, resolved versions, existing Cal/Resend/postgres dependencies and validation scripts. |
| [Next configuration](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/next.config.ts) | Existing MDX wrapper and build constraints. |
| [Global CSS](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/globals.css) and [root layout](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/layout.tsx) | Editorial tokens, typography and globally applied public chrome. |
| [About](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/about/page.tsx) and [portfolio data](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/lib/portfolio-projects.ts) | Service context and evidence/maturity distinctions. The four consulting entry points are a proposed organization of this work. |
| [Site configuration](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/config/site.ts) and [connect page](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/connect/page.tsx) | Real public email and Cal.com destination. |
| [Steps](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/components/ui/Steps.tsx), [Tabs](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/components/ui/Tabs.tsx), [HomePathSelector](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/components/home/HomePathSelector.tsx) | Interaction reuse and required accessibility changes. |
| [Guided chat content](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/components/guided-chat/content.ts) | Existing deterministic site navigation, separate from new AI shaping. |
| [Admin helper](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/lib/admin.ts) and [editor service](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/editor/service.ts) | Existing shared-secret administration and publishing concepts; neither establishes client identity or commercial authority. |
| [Postgres adapter](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/editor/repository/postgres.ts) and [editor security SQL](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/db/postgres/002-editor-security.sql) | Existing editorial persistence and broad editorial policies that must not be reused as client isolation. |
| [Release readiness](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/docs/release-readiness.md) | Historical operational context only. |

The read-only Vercel project/domain inventory supports the hosting observations in [the baseline](00-repository-baseline.md). Account identifiers and deployment metadata are intentionally excluded from this public packet. No client-domain setup, live Supabase configuration or working Google connection was established by those observations.

## AI transport, generative UI and workflow

| Primary reference | What it establishes and what it does not |
| --- | --- |
| [Command Code Provider API](https://commandcode.ai/docs/provider) | Compatible API endpoints and plan-dependent access. It cannot establish this account's remaining allowance or legacy entitlement. |
| [Command Code model registry](https://commandcode.ai/docs/reference/cli/models) | The reviewed catalog includes `deepseek/deepseek-v4.1-flash`. Recheck account availability before activation. |
| [Command Code privacy](https://commandcode.ai/privacy) and [zero-retention guidance](https://commandcode.ai/docs/resources/zdr) | Provider handling and optional retention route. Do not promise zero retention without verifying the chosen route. |
| [AI SDK documentation](https://ai-sdk.dev/docs) and [compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers) | Provider abstraction and version-dependent integration. Use installed-version docs during implementation. |
| [json-render documentation](https://json-render.dev/docs) | Catalog-based rendering candidate for bounded UI. It does not supply application authorization. |
| [Pinned json-render React package](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/react/package.json) | Inspected metadata declares version 0.22.0 and peer React ^19.2.3. This is source at a commit, not proof of the current published package. |
| [OpenUI](https://github.com/thesysdev/openui) | Alternative generated-UI/component-library approach. It is an alternative to evaluate, not a second required renderer. |
| [Chat SDK](https://chat-sdk.dev/docs) | Messaging-platform integration. It is not required for browser conversation on the consulting page. |
| [Command Code with AI Gateway](https://vercel.com/docs/ai-gateway/coding-agents/command-code) | Documented CLI-to-Gateway route. It does not establish Command Code as a supported upstream Gateway BYOK credential. |
| [AI Gateway authentication/BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok) | Gateway authentication and upstream credentials are separate concerns. No Gateway adoption is implied by using AI SDK. |
| [Workflow Next.js integration](https://workflow-sdk.dev/docs/getting-started/next) | Candidate durable orchestration and config wrapping. Recovery/idempotency still require application design and tests. |

This packet recommends a small controlled component catalog, not unrestricted page generation. Framework choice is subordinate to state integrity, access controls and a reliable visitor interaction. Actual model quality, latency and cost need evaluation on the chosen account.

## Identity, data and files

- [Supabase email passwordless authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless): established code flow and account-creation behavior.
- [Supabase server-side Next.js integration](https://supabase.com/docs/guides/auth/server-side/nextjs): current server-session guidance.
- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions): token/session behavior and limits of sign-out.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Data API security](https://supabase.com/docs/guides/api/securing-your-api): grants, exposed schemas and row policies are separate checks.
- [Supabase storage fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [storage access control](https://supabase.com/docs/guides/storage/security/access-control): private object retrieval and policy requirements.
- [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp): production delivery requires a suitable configured sender.
- [Supabase changelog](https://supabase.com/changelog): recheck relevant changes at implementation time.

The logical data model, capability boundaries and proposed retention periods are recommendations in this packet. They are not statements about deployed policies, statutory retention obligations or the legal sufficiency of agreement evidence.

## Scheduling and conversion

- [Cal.com booking creation](https://cal.com/docs/api-reference/v2/bookings/create-a-booking): documented request fields, metadata and booking behavior.
- [Cal.com booking references](https://cal.com/docs/api-reference/v2/bookings/get-booking-references): Google event/calendar references; the reviewed endpoint requires its documented API version. Real identifier mapping must be tested.
- [Cal.com webhooks](https://cal.com/docs/developing/guides/automation/webhooks): webhook delivery and signature guidance.
- [Cal.com Google Meet setup](https://cal.com/blog/customizing-your-scheduling-experience-with-cal-com-and-google-meet) and [embed](https://cal.com/embed): candidate use of the existing scheduler.
- [Google Calendar event creation and attachments](https://developers.google.com/workspace/calendar/api/guides/create-events): event participants, conference details and Drive attachment mechanics.
- [Google Calendar event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events): event identifiers, attachments and conference states.
- [Google attachment access](https://support.google.com/calendar/answer/6192039) and [Drive sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing): file sharing must be checked separately from attachment presence.
- [Google Meet notes](https://support.google.com/meet/answer/14754931): automatic note-taking is account/feature-dependent. Prepared meeting notes in this packet do not require that feature.

## Evidence discipline

All implementation and end-to-end checks are proposed. Account capability, public documentation, source inspection, mocked behavior and real user outcomes are distinct evidence classes. Keep these labels in future implementation reports. Preserve dated source references when dependencies or product capabilities change.
