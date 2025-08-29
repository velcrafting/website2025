// src/app/page.tsx
import { KPISection, LatestStrip } from "@/components/home";
import HeroRipple from "@/components/ui/HeroRipple";
import { allProjects, allWriting, allLabs } from "@/lib/content";
import Highlight from "@/components/about/highlight";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import Testimonials from "@/components/ui/testimonials";
import Separator from "@/components/ui/Separator";
import Script from "next/script";
import { SITE } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Home",
    description: "Strategic communications leader turning complexity into clarity across AI, Web3, and global communities.",
    canonicalPath: "/",
  });

export default async function Page() {
  const [projects, writing, labs] = await Promise.all([
    allProjects(),
    allWriting(),
    allLabs(),
  ]);

  const testimonials = [
  {
    quote:
      "Steven converts chaos into crisp action. Our response times dropped and our comms finally matched the stakes.",
    author: "Executive, Global Brand",
    role: "SVP Communications",
    // avatarUrl: "/avatars/someone.jpg",
  },
  {
    quote:
      "The AI-driven defenses saved us from a wave of phishing. Predictable process, measurable outcomes.",
    author: "Security Lead",
    role: "Head of Trust & Safety",
  },
  {
    quote:
      "Complex topics, simple narratives. He gets teams aligned fast without dumbing anything down.",
    author: "Product Leader",
    role: "Director of Product",
  },
];

  return (
    <div className="px-6 py-12">
      {/* JSON-LD: Person and WebSite */}
      <Script id="ld-person" type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: SITE.name,
            url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
            email: SITE.email,
            sameAs: [SITE.links.github, SITE.links.linkedin].filter(Boolean),
            jobTitle: "Strategic Communications Leader",
          }),
        }}
      />
      <Script id="ld-website" type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE.name,
            url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
            potentialAction: {
              "@type": "SearchAction",
              target: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/writing?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />
      <HeroRipple className="mb-4" contentAlign="start">
        {/* Keep mobile heading size through tablet; scale up only on desktop */}
        <h1 className="text-3xl lg:text-5xl xl:text-6xl font-bold leading-tight tracking-tight [text-wrap:balance] max-w-[22ch] lg:max-w-[28ch] xl:max-w-none">
          Strategic Communications Leader
        </h1>
        <p className="mt-3 max-w-[36ch] sm:max-w-xl text-base sm:text-lg text-pretty text-neutral-800 dark:text-white/80">
          Helping teams turn complexity into clarity across AI, Web3, and global communities.
        </p>

        <div className="mt-6 md:mt-10 lg:mt-12 flex flex-row flex-wrap gap-2 sm:gap-3">
          <Link
            href="/Steven_Pajewski_Resume.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "outline", size: "sm", className: "text-xs md:text-sm md:px-4 md:py-2 lg:px-5 lg:py-2.5" })}
          >
            View CV
          </Link>

          <a
            href="mailto:spajewski@outlook.com"
            className={buttonClasses({ variant: "outline", size: "sm", className: "text-xs md:text-sm md:px-4 md:py-2 lg:px-5 lg:py-2.5" })}
          >
            Email
          </a>

          <a
            href="https://linkedin.com/in/spajewski"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "outline", size: "sm", className: "text-xs md:text-sm md:px-4 md:py-2 lg:px-5 lg:py-2.5" })}
          >
            LinkedIn
          </a>
        </div>
      </HeroRipple>
      {/* JSON-LD: Organization (Velcrafting) */}
      <Script id="ld-org" type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Velcrafting",
            url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
            logo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/about/velcrafting.png`,
            sameAs: [SITE.links.github, SITE.links.linkedin].filter(Boolean),
            founder: {
              "@type": "Person",
              name: SITE.name,
              url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/about`,
              image: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/avatar.png`,
              email: SITE.email,
              sameAs: [SITE.links.github, SITE.links.linkedin].filter(Boolean),
            },
          }),
        }}
      />
      <Separator variant="gradient" />
      <KPISection />
      <Highlight className="mt-6" variant="compact" />
      <Testimonials items={testimonials} className="mt-6" />
      <LatestStrip projects={projects} writing={writing} labs={labs} limit={6} />
    </div>
  );
}
