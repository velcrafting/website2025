// src/app/about/page.tsx
import Link from "next/link";
import { Bot, MessagesSquare, Route } from "lucide-react";

import Timeline from "@/components/about/timeline";
import { Card, Button } from "@/components/ui";
import { SITE } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "About",
    description: "Founder, Technical Consultant & Product Builder focused on communications, brand trust, and practical AI systems.",
    canonicalPath: "/about",
  });

const SKILL_GROUPS = [
  {
    icon: Bot,
    title: "Technology & AI",
    summary: "Build useful tools and help teams put them to work.",
    items: [
      "Python, TypeScript, React/Next.js",
      "AI workflows and automation",
      "Prototypes and internal tools",
    ],
    tone: "bg-lavender/50",
  },
  {
    icon: MessagesSquare,
    title: "Communications & Community",
    summary: "Explain complex products and help people find reliable answers.",
    items: [
      "Technical writing and product education",
      "Brand trust and misinformation response",
      "Community programs and knowledge systems",
    ],
    tone: "bg-paper-raised",
  },
  {
    icon: Route,
    title: "Delivery & Operations",
    summary: "Turn an unclear problem into a practical plan and carry it through.",
    items: [
      "Cross-functional project delivery",
      "Vendor coordination and negotiation",
      "Infrastructure modernization and onboarding",
    ],
    tone: "bg-forest/10",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="container-index py-[var(--space-7)]">
      <header className="max-w-3xl">
        <h1>
          Steven Pajewski,
          <br className="hidden md:block" />
          {" but you can call me Vel."}
        </h1>
        <p className="lead mt-[var(--space-4)]">
          I build software, lead technical projects, and help people make sense of complicated tools and ideas.
        </p>
        <p className="mt-[var(--space-4)] max-w-2xl">
          My background spans IT leadership, communications, community programs, and hands-on development.
          Through Velcrafting, I build tools, explore practical uses for AI, and share what I learn. I&rsquo;m
          based in Spring, Texas.
        </p>
        <div className="mt-[var(--space-5)] flex flex-wrap gap-[var(--space-3)]">
          <Button asChild>
            <a href={SITE.resumeUrl} target="_blank" rel="noopener noreferrer">View résumé</a>
          </Button>
          <Button asChild variant="outline">
            <a href={SITE.bookingUrl} target="_blank" rel="noopener noreferrer">Let&rsquo;s talk</a>
          </Button>
        </div>
      </header>

      <script
        id="ld-breadcrumb-about"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" },
              { "@type": "ListItem", position: 2, name: "About", item: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/about` },
            ],
          }),
        }}
      />

      <section className="mt-[var(--space-8)]" aria-labelledby="skills-title">
        <h2 id="skills-title">Skills overview</h2>
        <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] md:grid-cols-3">
          {SKILL_GROUPS.map((skill) => {
            const Icon = skill.icon;
            return (
              <Card key={skill.title} variant="soft" hoverLift={false} className={`!mt-0 ${skill.tone}`}>
                <div className="flex items-center gap-[var(--space-2)]">
                  <Icon className="size-5 text-forest" aria-hidden="true" />
                  <h3 className="m-0 text-base font-semibold">{skill.title}</h3>
                </div>
                <p className="mt-[var(--space-3)] text-sm text-muted">{skill.summary}</p>
                <ul className="mt-[var(--space-3)] list-disc space-y-1 pl-[var(--space-5)] text-sm text-muted">
                  {skill.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-[var(--space-8)]" aria-labelledby="selected-work-title">
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-4)]">
          <h2 id="selected-work-title">Selected work</h2>
          <Link href="/projects">Browse projects</Link>
        </div>
        <div className="mt-[var(--space-4)] grid gap-[var(--space-5)] md:grid-cols-3">
          <article className="border-t border-rule pt-[var(--space-4)]">
            <h3 className="text-base font-semibold">Building a communications function at Ledger</h3>
            <p className="mt-[var(--space-2)] text-sm text-muted">
              Built Defensive Communications from the ground up, including response workflows, shared knowledge resources, and coordination.
            </p>
          </article>
          <article className="border-t border-rule pt-[var(--space-4)]">
            <h3 className="text-base font-semibold">Modernizing IT across five dealerships</h3>
            <p className="mt-[var(--space-2)] text-sm text-muted">
              Directed IT for approximately 400 users, led infrastructure and phone upgrades, and reduced onboarding from several weeks to 3 days.
            </p>
          </article>
          <article className="border-t border-rule pt-[var(--space-4)]">
            <h3 className="text-base font-semibold">Building tools through Velcrafting</h3>
            <p className="mt-[var(--space-2)] text-sm text-muted">
              <a href="https://github.com/Vel-Labs/CareSight" target="_blank" rel="noopener noreferrer">CareSight</a> caregiver-awareness prototype and developer tools for AI agents.
            </p>
          </article>
        </div>
      </section>

      <Timeline className="mt-[var(--space-8)]" />
    </div>
  );
}
