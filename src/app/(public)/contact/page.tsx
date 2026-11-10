// src/app/contact/page.tsx
//
// /contact → /connect, permanently.
//
// D1 (docs/implementation_plan_Sep16.md §4 task 2.3 and §12): connect and contact
// were two pages offering the same actions, so they competed. /connect survives —
// it is the homepage's action target and the destination of the physical card's QR
// code — and the message form on it is the single primary action. /contact is not
// deleted and its content was not dropped: it redirects, so every existing link
// (site nav, sitemap history, the prose link in src/content/blog/ai/geo-llm-discovery.mdx,
// anything already printed or shared) still lands somewhere useful.
//
// A 308, not a 302: the consolidation is permanent, and a permanent redirect is what
// transfers the search signal for the old URL. `permanentRedirect()` also runs before
// any of this route's rendering, so this file holds no markup, no metadata, and no
// form components — a redirecting page that still rendered a second contact form is
// exactly the duplication D1 removes.
//
// The components the old page rendered now have one home:
//   NewsletterForm→ /connect, in the "Join Vel, and be a Crafter" block (the low-lift action).
//   ContactForm   → no longer rendered anywhere as of 2026-09-16 (Phase 8.2). The component and
//                   its /api/contact route are kept, not deleted: the labelled mailto in the
//                   sidebar replaced it, and reversing that is one line in /connect.
//   ScheduleEmbed → removed entirely 2026-09-16. Superseded: /connect links the verified booking
//                   page instead of loading a third-party iframe.
//
// Verified through the served response, not a build log:
//   curl -s -o /dev/null -D - http://127.0.0.1:<port>/contact   → 308, location: /connect
//
// Reversal is one commit: restore the previous page body and remove the redirect.

import { permanentRedirect } from "next/navigation";

export default function ContactPage(): never {
  permanentRedirect("/connect");
}
