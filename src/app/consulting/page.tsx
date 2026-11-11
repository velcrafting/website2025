import type { Metadata } from "next";
import Link from "next/link";
import ProcessTimeline from "@/components/consulting/ProcessTimeline";
import Button from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { SITE_URL } from "@/lib/seo";
import { portfolioProjects } from "@/lib/portfolio-projects";
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
          <h1 className="mt-3 max-w-[21ch]">Fix the work that keeps getting stuck.</h1>
          <p className="mt-4 max-w-prose text-lg">Steven helps you find what’s slowing your team down, fix the workflow, software, or messaging with you, and hand over a solution your team can run.</p>
          <p className="mt-3 max-w-prose">Based in Spring, Texas, serving The Woodlands and greater Houston, with remote engagements worldwide. Remote work combines working sessions with written scope, decisions and handoff.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2 md:justify-end">
          <Button asChild><a href="#explorer">Explore your project</a></Button>
          <Button asChild variant="outline"><a href="#schedule">Schedule a conversation</a></Button>
        </div>
      </header>

      <ProcessTimeline stages={stages} />

      <BriefDesk initialService={selectedService} />

      <div className="mx-auto mt-4 w-full max-w-[44rem]">
        <div id="schedule" tabIndex={-1} aria-label="Schedule a conversation" className="scroll-mt-6">
          <div className="flex flex-wrap items-center gap-x-5">
            <a href={SITE.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium">Schedule a call <span aria-hidden="true">↗</span><span className="sr-only">(Cal.com, new tab)</span></a>
            <a href={`mailto:${SITE.email}`} className="inline-flex min-h-11 items-center">Email Steven</a>
          </div>
          <p className="max-w-prose text-sm text-muted">Cal.com opens separately and receives no brief.</p>
        </div>
        <details className="mt-4 border-y border-rule">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">Services and selected work</summary>
          <div className="space-y-6 pb-4">
            <section aria-labelledby="services-title">
              <h2 id="services-title">How Velcrafting can help</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                {serviceIntents.map(([key, problem, outcome]) => (
                  <li key={key} id={key} className="scroll-mt-6 border-t border-rule pt-2">
                    <h3><Link href={`/consulting?service=${key}#explorer`} className="inline-flex min-h-11 items-center">{services[key][0]}</Link></h3>
                    <p className="font-semibold">{problem}</p>
                    <p className="mt-1">{outcome}</p>
                  </li>
                ))}
              </ul>
              <Link href="/consulting?service=unsure#explorer" className="inline-flex min-h-11 items-center">Not sure yet</Link>
            </section>
            <section aria-labelledby="work-title">
              <h2 id="work-title">Selected work</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                {work.map((project) => <li key={project.slug}>
                  <h3>{project.name}</h3>
                  <p className="mt-2">{project.summary}</p>
                </li>)}
              </ul>
              <Link className="mt-3 inline-flex min-h-11 items-center" href="/projects">See the project portfolio</Link>
            </section>
          </div>
        </details>
      </div>
    </div>
  );
}
