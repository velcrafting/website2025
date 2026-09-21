import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileText, Github, Leaf, Linkedin, Mail, Send, UserRound } from "lucide-react";

import ShareButton from "@/components/connect/ShareButton";
import { GuidedChatTrigger } from "@/components/guided-chat";
import { SITE } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

const LINKS_CANONICAL = "https://velcrafting.com/links";

const LINK_ASSETS = {
  background: "/links/parchment-margin.png",
  featured: "/links/vel-labs-banner.png",
  notebook: "/links/notebook-card.png",
  tools: "/links/tools-sculpture.png",
} as const;

export const generateMetadata = () =>
  buildMetadata({
    title: "Links",
    description: "Steven Pajewski / velcrafting: things I am making and ideas I am researching.",
    canonicalPath: "/links",
  });

export default function LinksPage() {
  return (
    <div data-standalone-page="links" className="relative min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div className="pointer-events-none fixed inset-0 z-0">
        <Image
          src={LINK_ASSETS.background}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-90"
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[var(--measure-index)] px-[var(--gutter)] py-[var(--space-5)] sm:px-[var(--space-6)] lg:py-[var(--space-7)]">
        <header className="flex items-center justify-between gap-[var(--space-4)]">
          <Link href="/" className="font-serif text-[1.1rem] font-semibold tracking-tight text-ink no-underline hover:underline">
            velcrafting <span className="mx-[var(--space-2)] text-muted">/</span> <em className="font-normal text-link">links</em>
          </Link>
          <div className="flex items-center gap-[var(--space-2)]">
            <GuidedChatTrigger className="px-[var(--space-2)]" />
            <ShareButton canonicalUrl={LINKS_CANONICAL} />
          </div>
        </header>

        <hr className="rule mt-[var(--space-4)]" />

        <div>
          <section className="mx-auto mt-[var(--space-7)] max-w-[var(--measure-prose)] text-center" aria-labelledby="links-identity">
            <Image
              src="/avatar.png"
              alt="Steven Pajewski"
              width={96}
              height={96}
              priority
              className="mx-auto rounded-full border border-rule"
            />
            <h1 id="links-identity" className="mt-[var(--space-4)]">Steven Pajewski</h1>
            <p className="mt-[var(--space-1)] text-[1.35rem] italic text-link"><em>you can call me Vel.</em></p>
            <div className="mx-auto mt-[var(--space-5)] max-w-[var(--measure-prose)]">
              <p className="text-[1.15rem]">Things I&rsquo;m making. Ideas I&rsquo;m researching.</p>
              <p className="mt-[var(--space-2)] text-muted">
              Helping you understand, identify opportunities for, and implement AI in your business.
              </p>
            </div>
          </section>

          <section className="mx-auto mt-[var(--space-6)] max-w-[42rem] text-center" aria-labelledby="find-me">
            <h2 id="find-me" className="meta uppercase tracking-wide">Where to find me</h2>
            <ul className="mt-[var(--space-3)] flex flex-wrap justify-center gap-x-[var(--space-5)] gap-y-[var(--space-3)] pl-0">
              <li className="list-none">
                <a href={SITE.links.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[var(--space-2)] no-underline hover:underline">
                  <Github className="size-4" aria-hidden="true" /> GitHub
                </a>
              </li>
              <li className="list-none">
                <a href={SITE.links.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[var(--space-2)] no-underline hover:underline">
                  <Linkedin className="size-4" aria-hidden="true" /> LinkedIn
                </a>
              </li>
              <li className="list-none">
                <a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-[var(--space-2)] no-underline hover:underline">
                  <Mail className="size-4" aria-hidden="true" /> Email
                </a>
              </li>
              <li className="list-none">
                <Link href="/" className="inline-flex items-center gap-[var(--space-2)] no-underline hover:underline">
                  <ArrowRight className="size-4" aria-hidden="true" /> Continue to website
                </Link>
              </li>
            </ul>
          </section>

          <section className="mt-[var(--space-7)]" aria-labelledby="vel-labs-title">
            <Link
              href="/projects"
              className="group relative block aspect-[2.2/1] overflow-hidden rounded-[16px] border border-rule !no-underline transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:aspect-[4.8/1]"
            >
              <Image
                src={LINK_ASSETS.featured}
                alt=""
                aria-hidden="true"
                fill
                priority
                sizes="(min-width: 1024px) min(1160px, calc(100vw - 64px)), calc(100vw - 40px)"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-forest/95 via-forest/60 via-[68%] to-transparent" aria-hidden="true" />
              <div className="absolute inset-y-0 left-0 flex w-[76%] items-center p-[var(--space-4)] sm:p-[var(--space-5)] lg:w-[55%] lg:p-[var(--space-7)]">
                <div>
                  <div className="flex items-start justify-between gap-[var(--space-4)]">
                    <h2 id="vel-labs-title" className="!text-[var(--parchment)] text-[clamp(1.8rem,3.8vw,3rem)]">Explore Vel-Labs</h2>
                    <ArrowUpRight className="size-6 shrink-0 !text-[var(--parchment)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                  <p className="mt-[var(--space-2)] text-[1.125rem] leading-snug !text-[var(--parchment)]">
                    Projects, experiments, and tools I&rsquo;m building.
                  </p>
                </div>
              </div>
            </Link>
          </section>

          <section className="mt-[var(--space-5)]" aria-labelledby="explore-title">
            <h2 id="explore-title" className="sr-only">Explore the notebook and tools</h2>
            <div className="grid gap-[var(--space-5)] md:grid-cols-2">
              <Link
                href="/blog"
                className="group relative overflow-hidden rounded-[16px] border border-rule bg-surface !no-underline transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <div className="relative aspect-[2.3/1]">
                  <Image
                    src={LINK_ASSETS.notebook}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 768px) calc((min(1160px, 100vw - 64px) - 24px) / 2), calc(100vw - 40px)"
                    className="object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-plum/75 via-plum/25 to-transparent" aria-hidden="true" />
                <div className="absolute inset-y-0 left-0 flex w-[72%] items-center p-[var(--space-4)] sm:p-[var(--space-5)]">
                  <div>
                    <div className="flex items-start justify-between gap-[var(--space-3)]">
                      <h3 className="m-0 !text-[var(--parchment)] text-[clamp(1.7rem,3vw,2.7rem)]">The notebook</h3>
                      <ArrowUpRight className="size-5 shrink-0 !text-[var(--parchment)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                    <p className="mt-[var(--space-2)] text-[1.05rem] leading-snug !text-[var(--parchment)]">Research, useful ideas, and work in progress.</p>
                  </div>
                </div>
              </Link>

              <Link
                href="/tools"
                className="group relative overflow-hidden rounded-[16px] border border-rule bg-surface !no-underline transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <div className="relative aspect-[2.3/1]">
                  <Image
                    src={LINK_ASSETS.tools}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 768px) calc((min(1160px, 100vw - 64px) - 24px) / 2), calc(100vw - 40px)"
                    className="object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-plum/75 via-plum/25 to-transparent" aria-hidden="true" />
                <div className="absolute inset-y-0 left-0 flex w-[72%] items-center p-[var(--space-4)] sm:p-[var(--space-5)]">
                  <div>
                    <div className="flex items-start justify-between gap-[var(--space-3)]">
                      <h3 className="m-0 !text-[var(--parchment)] text-[clamp(1.7rem,3vw,2.7rem)]">Tools &amp; little experiments</h3>
                      <ArrowUpRight className="size-5 shrink-0 !text-[var(--parchment)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                    <p className="mt-[var(--space-2)] text-[1.05rem] leading-snug !text-[var(--parchment)]">Useful things. Room to play.</p>
                  </div>
                </div>
              </Link>
            </div>
          </section>

          <section className="mt-[var(--space-7)] grid gap-[var(--space-3)]" aria-label="About and resume">
            <Link href="/about" className="group flex items-center justify-between gap-[var(--space-4)] rounded-[16px] border border-rule bg-paper/80 px-[var(--space-5)] py-[var(--space-4)] !no-underline hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span className="flex items-center gap-[var(--space-4)]">
                <Leaf className="size-8 shrink-0 text-ink" aria-hidden="true" />
                <span>
                <h2 className="m-0 text-[1.2rem]">About &amp; working together</h2>
                <span className="mt-[var(--space-1)] block text-muted">Ideas, collaboration, and what drives me.</span>
                </span>
              </span>
              <ArrowUpRight className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
            <a href={SITE.resumeUrl} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-[var(--space-4)] rounded-[16px] border border-rule bg-paper/80 px-[var(--space-5)] py-[var(--space-4)] !no-underline hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span className="flex items-center gap-[var(--space-4)]">
                <FileText className="size-8 shrink-0 text-ink" aria-hidden="true" />
                <span>
                <h2 className="m-0 text-[1.2rem]">View résumé · PDF</h2>
                <span className="mt-[var(--space-1)] block text-muted">Experience, skills, and selected work.</span>
                </span>
              </span>
              <ArrowUpRight className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </a>
          </section>
        </div>

        <footer className="mt-[var(--space-7)] flex flex-wrap items-center justify-between gap-[var(--space-4)] border-t border-rule pt-[var(--space-5)]">
          <Link href="/connect" className="inline-flex items-center gap-[var(--space-2)] no-underline hover:underline">
            <Send className="size-4" aria-hidden="true" /> Say hello <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <a href="/steven-pajewski.vcf" download className="inline-flex items-center gap-[var(--space-2)] no-underline hover:underline">
            <UserRound className="size-4" aria-hidden="true" /> Save my contact <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </div>
  );
}
