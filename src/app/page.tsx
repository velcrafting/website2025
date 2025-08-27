// src/app/page.tsx
import { KPISection, LatestStrip } from "@/components/home";
import HeroRipple from "@/components/ui/HeroRipple";
import { allProjects, allWriting, allLabs } from "@/lib/content";
import Highlight from "@/components/about/highlight";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import Testimonials from "@/components/ui/testimonials";
import Separator from "@/components/ui/Separator";

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
      <HeroRipple className="mb-4">
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
          Strategic Communications Leader
        </h1>
        <p className="mt-3 max-w-xl text-md">
          Turning complexity into clarity across AI, Web3, and global communities.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/Steven_Pajewski_Resume.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "outline", size: "lg" })}
          >
            View CV
          </Link>

          <a
            href="mailto:spajewski@outlook.com"
            className={buttonClasses({ variant: "outline", size: "lg" })}
          >
            Email
          </a>

          <a
            href="https://linkedin.com/in/spajewski"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "outline", size: "lg" })}
          >
            LinkedIn
          </a>
        </div>
      </HeroRipple>
      <Separator variant="gradient" />
      <KPISection />
      <Highlight className="mt-6" variant="compact" />
      <Testimonials items={testimonials} className="mt-6" />
      <LatestStrip projects={projects} writing={writing} labs={labs} limit={6} />
    </div>
  );
}
