import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { SITE_URL } from "@/lib/seo";
import { portfolioProjects } from "@/lib/portfolio-projects";
import { meetingPreparation } from "@/consulting/availability";
import { parseService, services } from "@/consulting/brief";
import { stages } from "@/consulting/fixtures";
import { aiSettings } from "@/consulting/server/ai-runtime";
import { authSettings } from "@/consulting/server/auth-settings";
import { configuredOrigin } from "@/consulting/server/request-boundary";
import BriefDesk from "./BriefDesk";

export const metadata: Metadata = {
  title: "Consulting",
  description: "Software, practical AI and clear communication, with scope, decisions and handoff kept in one place.",
  alternates: { canonical: `${SITE_URL}/consulting` },
};

export default async function ConsultingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const selectedService = parseService((await searchParams).service);
  const publicOrigin = configuredOrigin(process.env.PUBLIC_SITE_ORIGIN);
  const publicHost = publicOrigin && (await headers()).get("host") === new URL(publicOrigin).host;
  const prospect = Boolean(publicHost && process.env.VELCRAFTING_EXPLORER_ENABLED === "1" && authSettings("prospect"));
  const availability = {
    shaping: Boolean(publicHost && aiSettings()),
    prospect,
    booking: false,
    bookingUrl: SITE.bookingUrl,
  };
  const clientSignIn = authSettings("client")?.origin;
  const work = portfolioProjects.filter(({ slug }) => slug === "veldesk" || slug === "yolo26-mlx-swift");

  return (
    <div className="container-page pt-[var(--space-7)]">
      <header className="grid items-end gap-6 border-b border-rule pb-[var(--space-6)] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <p className="meta uppercase tracking-wide">Velcrafting · Consulting</p>
          <h1 className="mt-3 max-w-[21ch]">Turn complicated work into useful systems.</h1>
          <p className="mt-4 max-w-prose text-lg">{metadata.description}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2 md:justify-end">
          <Button asChild><a href="#explorer">Explore your project</a></Button>
          <Button asChild variant="outline"><a href="#schedule">Schedule a conversation</a></Button>
        </div>
      </header>

      <section className="section-gap" aria-labelledby="services-title">
        <p className="meta">Starting points</p>
        <h2 id="services-title" className="mt-2">What would help right now?</h2>
        <p className="mt-3">Choose the closest starting point. We can adjust it as we understand the work.</p>
        <ul className="mt-4 grid gap-x-8 md:grid-cols-2">
          {Object.entries(services).filter(([key]) => key !== "unsure").map(([key, [label, description]]) => (
            <li key={key} className="border-t border-rule py-3">
              <Link href={`/consulting?service=${key}#explorer`} className="inline-flex min-h-11 items-center font-semibold">{label}</Link>
              <p>{description}</p>
            </li>
          ))}
        </ul>
        <Link href="/consulting?service=unsure#explorer" className="inline-flex min-h-11 items-center">Not sure yet</Link>
      </section>

      <section className="section-gap grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" aria-labelledby="process-title">
        <div>
          <p className="meta">How we work</p>
          <h2 id="process-title" className="mt-2">Explore the process</h2>
          <p className="mt-3 max-w-prose">The shape of the engagement depends on the work. Some stages combine, and updates follow the cadence we agree.</p>
          <p className="mt-3">Open any stage to see what each side brings and what comes out of it.</p>
        </div>
        <div className="border-y border-rule">
          {stages.map((stage, index) => (
            <details key={stage.id} name="consulting-stage" open={index === 0} className="border-b border-rule last:border-b-0">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">{stage.title}</summary>
              <div className="grid gap-3 pb-4 pl-4">
                <p>{stage.purpose}</p>
                <dl className="grid gap-2 sm:grid-cols-3">
                  <div><dt className="meta">Velcrafting</dt><dd>{stage.studio}</dd></div>
                  <div><dt className="meta">You</dt><dd>{stage.client}</dd></div>
                  <div><dt className="meta">Output</dt><dd>{stage.output}</dd></div>
                </dl>
                <div className="border-l border-rule pl-3"><p className="meta">Fictional example</p><p>{stage.example}</p></div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <BriefDesk initialService={selectedService} availability={availability} />

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
          {availability.booking && <Button asChild variant="outline"><a href="#integrated-scheduling">Prepare meeting materials</a></Button>}
          <Button asChild><a href={SITE.bookingUrl} target="_blank" rel="noopener noreferrer">Open scheduling on Cal.com (new tab)</a></Button>
          <Button asChild variant="outline"><a href={`mailto:${SITE.email}`}>Email Velcrafting</a></Button>
        </div>
        {clientSignIn ? <p className="mt-4"><a href={new URL("/login", clientSignIn).href}>Client sign in</a></p>
          : <p className="meta mt-4">Client sign in is unavailable here.</p>}
      </section>
    </div>
  );
}
