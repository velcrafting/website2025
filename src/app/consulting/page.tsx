import type { Metadata } from "next";
import Link from "next/link";
import ProcessTimeline from "@/components/consulting/ProcessTimeline";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { SITE_URL } from "@/lib/seo";
import { portfolioProjects } from "@/lib/portfolio-projects";
import { meetingPreparation } from "@/consulting/availability";
import { parseService, services } from "@/consulting/brief";
import { stages } from "@/consulting/fixtures";
import BriefDesk from "./BriefDesk";

export const metadata: Metadata = {
  title: "AI, Software & Communications Consulting",
  description: "Velcrafting helps teams with AI workflows, custom software and communications. Based in Spring, Texas, serving The Woodlands, greater Houston and remote clients worldwide.",
  alternates: { canonical: `${SITE_URL}/consulting` },
};

const serviceIntents = [
  ["review", "You need to decide what to automate, build or buy.", "Compare your options against the way your team works, with a recommendation and a first step you can test."],
  ["build", "An off-the-shelf tool leaves a gap in your process.", "Prototype an internal tool or integration, test it with the people who will use it, and hand over the working software and documentation."],
  ["workflow", "A recurring task takes too much manual work.", "Map the steps, test where automation or AI helps, and document where a person needs to check the result."],
  ["communications", "Customers or AI search tools misunderstand what you offer.", "Review your public information, check which sources people and AI answers rely on, and prioritize updates to your service pages and supporting content."],
] as const;

export default async function ConsultingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const selectedService = parseService((await searchParams).service);
  const work = portfolioProjects.filter(({ slug }) => slug === "veldesk" || slug === "yolo26-mlx-swift");

  return (
    <div className="container-page pt-8 md:pt-10">
      <header className="grid items-end gap-4 border-b border-rule pb-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <p className="meta uppercase tracking-wide">Velcrafting · Consulting</p>
          <h1 className="mt-3 max-w-[21ch]">Turn complicated work into useful systems.</h1>
          <p className="mt-4 max-w-prose text-lg">Velcrafting helps teams decide what to build, make recurring work easier, and explain what they offer clearly to customers and search tools.</p>
          <p className="mt-3 max-w-prose">Based in Spring, Texas, serving The Woodlands and greater Houston, with remote engagements worldwide. Remote work combines working sessions with written scope, decisions and handoff.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2 md:justify-end">
          <Button asChild><a href="#explorer">Explore your project</a></Button>
          <Button asChild variant="outline"><a href="#schedule">Schedule a conversation</a></Button>
        </div>
      </header>

      <ProcessTimeline stages={stages} />

      <section className="section-gap border-t border-rule pt-6" aria-labelledby="services-title">
        <h2 id="services-title">How Velcrafting can help</h2>
        <p className="mt-3">Choose the problem closest to yours to start a brief.</p>
        <ul className="mt-4 grid gap-x-8 md:grid-cols-2">
          {serviceIntents.map(([key, problem, outcome]) => (
            <li key={key} id={key} className="scroll-mt-6 border-t border-rule py-3">
              <h3><Link href={`/consulting?service=${key}#explorer`} className="inline-flex min-h-11 items-center">{services[key][0]}</Link></h3>
              <p className="font-semibold">{problem}</p>
              <p className="mt-1">{outcome}</p>
            </li>
          ))}
        </ul>
        <Link href="/consulting?service=unsure#explorer" className="inline-flex min-h-11 items-center">Not sure yet</Link>
      </section>

      {/* The fictional walkthrough never populates the visitor's brief. */}

      <BriefDesk initialService={selectedService} />

      <section aria-labelledby="work-title" className="section-gap border-t border-rule pt-6">
        <h2 id="work-title">Selected work</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {work.map((project) => <li key={project.slug}>
            <div className="flex flex-wrap items-center gap-2">
              <h3>{project.name}</h3>
              <Badge>{project.status === "active" ? "Active" : "Prototype"}</Badge>
            </div>
            <p className="mt-2 max-w-prose">{project.summary}</p>
          </li>)}
        </ul>
        <Link className="mt-3 inline-flex min-h-11 items-center" href="/projects">See the project portfolio</Link>
      </section>

      <section id="schedule" aria-labelledby="schedule-title" className="section-gap scroll-mt-6 border-t border-rule pt-6">
        <h2 id="schedule-title">Schedule a conversation</h2>
        <p className="mt-3 max-w-prose">{meetingPreparation.message} Scheduling opens in a new tab so you can return to your brief. No brief is required. You can also get in touch by email.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild><a href={SITE.bookingUrl} target="_blank" rel="noopener noreferrer">Open scheduling on Cal.com (new tab)</a></Button>
          <Button asChild variant="outline"><a href={`mailto:${SITE.email}`}>Email Velcrafting</a></Button>
        </div>
        <p className="meta mt-4">Client sign in is unavailable here.</p>
      </section>
    </div>
  );
}
