// /connect — the destination hub. R1/F2, 2026-09-17.
//
// WHAT THIS PAGE IS: the destination for a physical card, a social profile or a referral. Say who this is,
// make saving contact easy, offer one featured way in, then give the visitor a few purposeful places to go.
//
// R1 (independent audit, 2026-09-17) rejected the previous version as F2-incomplete, and it was right: the
// page had a correct identity column and a newsletter block, but its "destinations" were three plain text
// sections with headings — no imagery, no cards, no hierarchy between them. The audit's brief is now
// implemented below:
//
//   - ONE featured banner: "Join Vel, and be a Crafter", with the newsletter at the point of intent and the
//     Discord control honestly unavailable.
//   - 3 purposeful DESTINATION CARDS, each one link, each going somewhere real.
//   - Contact and schedule actions stay accessible in the identity column, as outline secondaries.
//   - NO nested interactive elements: a card is a single anchor and contains nothing clickable. The share
//     and social actions are deliberately OUTSIDE the cards, in their own row, for exactly that reason.
//   - Mobile first in DOM order: identity → actions → banner → cards. At lg the identity column sits beside
//     the banner and cards. Nothing is reordered by CSS.
//
// DESIGN CONTRACT (docs/2026-refresh.md): the 440px action-group measure appears only as the first grid
// column's track (`--measure-connect`); `.container-connect` is deliberately NOT applied to any wrapper —
// see the warning beside its definition in globals.css. Section gaps sit one step lower on the spacing
// scale because this page composes a lot; type sizes are untouched, because shrinking type to fit is
// forbidden.
//
// DESTINATIONS: compact token surfaces keep the next choices complete and scannable without a reserved
// cover area, stock image or invented artwork.
//
// HONESTY: no invented phone, email, follower or issue counts. A destination whose URL has not been
// supplied is labelled rather than linked — the Discord control being the current example.
//
// F2 REMAINS OPEN until 390/1440 browser evidence exists. This is a source-level implementation of the
// agreed composition, not a visual acceptance.

import Link from "next/link";

import ShareButton from "@/components/connect/ShareButton";
import UnavailableAction from "@/components/connect/UnavailableAction";
import { NewsletterForm } from "@/components/contact";
import { Button } from "@/components/ui";
import { SITE } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Connect",
    description:
      "Steven Pajewski — you can call me Vel. Save my contact, schedule a chat, join the newsletter, or find the work.",
    canonicalPath: "/connect",
  });

export const revalidate = 3600;

export default async function ConnectPage() {
  /**
   * Keep the destinations to the few places worth a visitor's next click; each card is one accessible link
   * with its title, description and directional affordance together.
   */
  const destinations = [
    {
      key: "projects",
      href: "/projects",
      title: "Projects",
      line: "Browse the systems, tools, and case studies I build.",
    },
    {
      key: "writing",
      href: "/blog",
      title: "Writing",
      line: "Read notes on AI, communication, and building in public.",
    },
    {
      key: "resume",
      href: SITE.resumeUrl,
      title: "View resume (PDF)",
      line: "Download the formal resume PDF and see the experience behind the work.",
    },
  ];

  return (
    <div className="container-page py-[var(--space-5)]">
      <header className="flex flex-wrap items-center justify-between gap-[var(--space-4)]">
        <Link href="/" className="wordmark">
          <span aria-hidden="true">❧</span> velcrafting
        </Link>
        <ShareButton label="Share" />
      </header>

      <hr className="rule mt-[var(--space-4)]" />

      <div className="mt-[var(--space-5)] grid gap-[var(--space-5)] lg:grid-cols-[minmax(0,var(--measure-connect))_minmax(0,1fr)] lg:gap-[var(--space-7)]">
        {/* Identity and the two contact actions. Secondary to the newsletter, which is the page's one
            filled control. */}
        <div>
          <section aria-labelledby="connect-intro">
            <h1 id="connect-intro">
              Steven Pajewski,
              <br />
              but you can call me <em>Vel.</em>
            </h1>
            <p className="lead mt-[var(--space-3)]">
              A notebook for things I&rsquo;m making, questions I&rsquo;m following, and people I&rsquo;m
              glad to meet.
            </p>
            <p className="meta mt-[var(--space-2)]">Spring + The Woodlands, TX</p>
          </section>

          <section className="mt-[var(--space-5)]" aria-label="Ways to get in touch">
            <div className="flex flex-wrap items-center gap-[var(--space-3)]">
              <Button asChild variant="outline">
                <a href="/steven-pajewski.vcf" download>
                  Save my contact <span aria-hidden="true">→</span>
                </a>
              </Button>
              {/* The booking destination is a verified public page, so it is a normal link and nothing
                  third-party loads until the visitor chooses to open it. */}
              <Button asChild variant="outline">
                <a href={SITE.bookingUrl} target="_blank" rel="noopener noreferrer">
                  Schedule a chat <span aria-hidden="true">↗</span>
                </a>
              </Button>
            </div>
            <p className="meta measure-prose mt-[var(--space-3)]">
              Scheduling opens a 30-minute booking page. You choose the time and get a confirmation you can
              cancel or move.
            </p>
          </section>
        </div>

        {/* THE FEATURED BANNER. One way in, given the space it deserves: the heading, concise intro,
            newsletter, and honest Discord state. */}
        <section className="surface p-[var(--space-4)]" aria-labelledby="connect-join">
          <div className="min-w-0">
            <h2 id="connect-join">Join Vel, and be a Crafter</h2>
            <p className="measure-prose mt-[var(--space-2)]">
              Notes on AI, useful research, tools, and the people building with them.
            </p>

            <div className="mt-[var(--space-4)] max-w-[var(--measure-prose)]">
              <p className="meta uppercase tracking-wide">Newsletter</p>
              <div className="mt-[var(--space-2)]">
                <NewsletterForm />
              </div>
            </div>

            <div className="mt-[var(--space-4)]">
              <p className="meta uppercase tracking-wide">Discord</p>
              <div className="mt-[var(--space-2)]">
                {/* No invite URL exists, so this says so. Reuse the shared control rather than a hand-rolled
                    paragraph: it carries the honest label/state/reason/alternative structure the design
                    checks assert, and a destination that is not open is labelled, not linked. */}
                <UnavailableAction
                  label="Join the Discord"
                  state="Not open yet"
                  reason="The public community space is not open, so there is nothing to join yet."
                  alternative="Send a note on LinkedIn and I will tell you when it opens."
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* THE DESTINATIONS. Three compact surfaces, each a single anchor with no nested interactive content. */}
      <section className="mt-[var(--space-7)]" aria-labelledby="connect-destinations">
        <h2 id="connect-destinations">Where to go next</h2>
        <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <Link
              key={d.key}
              href={d.href}
              className="surface group flex h-full flex-col !no-underline transition-colors hover:border-ink/40 hover:bg-paper focus-visible:border-ink/40"
            >
              <div className="flex items-start justify-between gap-[var(--space-3)]">
                <h3 className="m-0 text-[1.05rem] font-semibold text-ink group-hover:underline group-focus-visible:underline">
                  {d.title}
                </h3>
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-accent transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </div>
              <p className="mt-[var(--space-3)] text-muted">{d.line}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Referral and social, deliberately outside the cards so no interactive element sits inside another. */}
      <section className="mt-[var(--space-6)] border-t border-rule pt-[var(--space-4)]" aria-labelledby="connect-meet">
        <h2 id="connect-meet" className="text-[1.05rem]">
          Know someone I should meet?
        </h2>
        <p className="measure-prose mt-[var(--space-2)]">
          Passing this page on is the most useful thing you can do with it.
        </p>
        <div className="mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-5)]">
          <ShareButton label="Share this page" />
          <a href={SITE.links.linkedin} rel="me">
            LinkedIn
          </a>
          <a href={SITE.links.github} rel="me">
            GitHub
          </a>
        </div>
        <p className="meta mt-[var(--space-3)]">Sharing is optional. Nothing on this page is gated behind it.</p>
      </section>
    </div>
  );
}
