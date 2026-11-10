# Repository and infrastructure baseline

**Version:** 0.3  
**Date inspected:** 2026-11-10  
**Status:** READ-ONLY FINDINGS AND IMPLEMENTATION CONSTRAINTS

## Inspection scope

The identified repository is [velcrafting/website2025](https://github.com/velcrafting/website2025). Main resolved to `7a2da367d924c67133dce7a32daaafcbaf271480`, with 299 tracked files in the returned recursive tree. Repository contents were inspected through the GitHub connector because the working directory did not contain a local checkout. Do not describe this as a local application build or runtime audit.

No applicable local AGENTS.md was found in the workspace ancestry, and no tracked AGENTS.md appeared in the inspected repository tree. The user's supplied instructions apply. The implementation agent must check again after obtaining the actual checkout because the branch and local instructions may have changed.

The Vercel project and attached domains were inspected read-only. Live Supabase access was not available to this review. No credentials were inspected or printed. No dependency installation, application test run, database mutation, infrastructure configuration, live model call or real booking was performed for this handoff.

## Stack and constraints

Resolved versions below come from the inspected lockfile, not the broad ranges in package.json.

| Area | Verified source state | Consequence |
| --- | --- | --- |
| Application | Next.js 15.5.25, App Router, TypeScript 5.9.2 | Extend the current application in small slices. Verify current framework and security compatibility before upgrading. |
| UI runtime | React and React DOM 19.1.0 | Check new library peer dependencies. Do not force an incompatible generative UI package into the lockfile. |
| Styling | Tailwind 4.1.12, shared tokens, Radix primitives, Framer Motion | Reuse the editorial system and accessible primitives. Avoid a second unrelated component kit. |
| Content | MDX with remark/rehype plugins | Keep public editorial content in the existing pipeline; keep private client data out of public MDX and static generation. |
| Runtime | package engines Node >=22.5; inspected Vercel project uses Node 22.x | Verify dependencies against the actual deployment runtime and lock versions. |
| Scheduling | @calcom/embed-react 1.5.3 already installed; existing outbound booking link | Reuse Cal.com if its account and integration capabilities pass the proposed checks. An installed package does not prove an embedded workflow exists. |
| Email | Resend 6.0.2 dependency and existing email/newsletter-related paths | Reuse an established sender where suitable after verifying configuration and purpose-specific consent. |
| Data | postgres 3.4.9 and an editorial repository adapter | Existing editorial persistence is not a client data model or tenant boundary. |
| AI and client auth | No AI SDK or Supabase client-auth implementation identified in the inspected source | Treat both as new integrations with explicit setup and testing. |

Sources: [package.json](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/package.json), [package-lock.json](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/package-lock.json), [next.config.ts](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/next.config.ts).

The current Next configuration wraps MDX, declares TS/TSX/MD/MDX extensions and a content plugin pipeline, disables mdxRs, and sets file-tracing behavior. If Workflow SDK or another compiler wrapper is introduced, prove the composition rather than replacing the current configuration wholesale.

## Design and public positioning

The site has a notebook-like editorial identity: parchment surfaces, ink text, forest accents, violet links, serif headings and sans-serif interface text. The inspected tokens include base parchment `#eae5d8`, raised surface `#f4f0e6`, ink `#2f2c32` and forest `#3c5749`. Source Serif 4 and Source Sans 3 support that hierarchy.

Carry these characteristics into consulting through a working notebook or project desk: clear stages, selected examples, a developing brief and precise next actions. The creative direction should make the service concrete without suggesting that every prospective project becomes a software build.

The service framing in this packet is a proposed organization of the site's work, not a claim that the repository already sells a fixed consultancy package. Preserve the portfolio's distinction between live work, prototypes, local tools and experiments. Never turn a prototype into a production case study through the new copy.

| Path | Finding and intended use |
| --- | --- |
| `src/app/globals.css` | Central tokens, typography, surfaces and motion guidance. Reuse and check contrast in the actual components. |
| `src/app/layout.tsx` | Current root includes public navigation, mobile header, guided chat and public metadata. Create distinct public/client shells so private pages do not inherit these features or indexing assumptions. |
| `src/components/ui/Steps.tsx` | Implies linear progress and completion of earlier stages. Do not use that meaning for a visitor exploring stages in any order. |
| `src/components/ui/Tabs.tsx` | Needs accessibility work before use for this flow. A visual tab is not a complete keyboard interaction. |
| `src/components/home/HomePathSelector.tsx` | Offers a stronger keyboard interaction reference for selecting among related views. |
| `src/components/guided-chat/content.ts` | Existing guided chat is a deterministic site navigator, not a model integration. Keep its purpose distinct from brief shaping. |
| `src/lib/portfolio-projects.ts` | Project evidence and maturity context. Reuse verified references without exaggerating their state. |

Re-resolve these source paths in the implementation checkout and preserve any newer improvements.

## Existing contact and conversion

`src/config/site.ts` declares the public contact address `steven@velcrafting.com` and booking destination `https://cal.com/spajewski/30min`. `src/app/connect/page.tsx` links to that booking destination and includes the existing newsletter surface. `/contact` redirects to `/connect`.

Use these real contact choices. Do not invent an inquiry endpoint, promise free consultancy, add a price or make the newsletter consent cover inquiry reminders. A parked contact form points to a missing API and should not be activated as a shortcut.

The current connect page uses an outbound Cal link. This does not establish a working Google Meet integration, event reference lookup, Drive attachment, webhook or brief handoff. Those are part of the planned conversion work.

Sources: [site configuration](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/config/site.ts), [connect page](https://github.com/velcrafting/website2025/blob/7a2da367d924c67133dce7a32daaafcbaf271480/src/app/connect/page.tsx).

## Existing administration is not client authorization

`src/lib/admin.ts` uses a shared ADMIN_KEY and cookie. That can explain the existing editorial workflow, but it cannot identify which person reviewed a prospect record, changed client access or recorded agreement.

`src/editor/service.ts` has useful draft/review/publication concepts. Its recorded subject is not, by itself, proof of an authenticated individual. Editorial approval means approval to publish a particular revision, not authority to accept commercial terms.

`src/editor/repository/postgres.ts` and `db/postgres/002-editor-security.sql` describe editorial persistence with broad editorial access policies. Do not extend that role or its USING(true) policies to prospects, private files, commercial records or client tables.

The private workspace needs its own named identities, explicit grants and protected data access. Reuse concepts and code only after checking their boundaries.

## Hosting and data readiness

| Item | Observed or unverified |
| --- | --- |
| Vercel project | Existing website2025 project, Next.js, Node 22.x and a latest production deployment reported READY. This does not prove every production feature works. |
| Attached domains | Apex Velcrafting domain redirects to www; www and the existing Vercel alias are attached. |
| Client subdomain | `client.velcrafting.com` was not attached to the inspected project. DNS, TLS and any configuration elsewhere remain unverified. |
| Deployment protection | Project reports SSO protection except custom domains. This is not stakeholder authorization for client records. |
| Repository automation | No tracked .github/workflows or vercel.json was found in the inspected tree. Project-level Git integration and automatic preview behavior still need checking. |
| Supabase | A candidate relationship appears in earlier source context, but live Auth, database grants, storage and email configuration were not verified. Do not infer readiness from that reference. |
| Secrets and accounts | Command Code, Cal, Google OAuth, email sender, database and Supabase credentials were not inspected. |
| Historical release notes | `docs/release-readiness.md` is useful context, not current runtime evidence. |

## Authentication alternatives, now resolved

| Option | Usability and identity | Removal and recovery | Operational cost | Fit |
| --- | --- | --- | --- | --- |
| Shared passcode | Easy to share; identifies possession of a secret, not a stakeholder. | Individual removal is unreliable; rotation disrupts everyone. Attribution remains weak. | Initially small, then manual sharing and rotation overhead. | Reject for the client workspace and agreement attribution. |
| Named email and password | Individual identity with a familiar recurring sign-in. | Per-user revocation and password recovery supported by an established provider. | Adds password reset/support and account-security choices. | Valid alternative if later client needs justify it. |
| Named email one-time code | No new password to remember; proves current control of the email account. | Individual grants can be removed; lost-mailbox recovery needs verified staff handling. | Requires reliable transactional delivery, code/resend limits and session handling. | Selected approach using Supabase. |

An email code does not establish an individual's corporate signing authority. Authentication, engagement access, commercial visibility and authority to agree remain separate. See [permissions and versions](03-data-permissions-and-versions.md) and [Supabase's email flow](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## What the implementation agent must recheck

Confirm main HEAD and applicable instructions, resolve the working component paths, inspect available secrets by name without exposing values, and read installed-version documentation after dependency selection. Verify private-shell routing on both intended and alternate hosts. Treat every account-dependent feature as disabled until its scoped test evidence exists.
