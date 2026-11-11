import type { ReactNode } from "react";
import Link from "next/link";
import { services } from "@/consulting/brief";
import { portfolioProjects } from "@/lib/portfolio-projects";
import styles from "./disclosure.module.css";

const serviceIntents = [
  ["review", "Decide what to automate, build or buy.", "Compare your options against the way your team works, with a recommendation and a first step you can test."],
  ["build", "Close a gap your current tools leave open.", "Prototype an internal tool or integration, test it with the people who will use it, and hand over the working software and documentation."],
  ["workflow", "Spend less time on recurring manual work.", "Map the steps, test where automation or AI helps, and document where a person needs to check the result."],
  ["communications", "Help people and AI search tools understand what you offer.", "Review your public information, check which sources people and AI answers rely on, and prioritize updates to your service pages and supporting content."],
] as const;

const workSummaries = new Map([
  ["veldesk", "A desktop workbench for coding agents that run in the terminal."],
  ["yolo26-mlx-swift", "On-device computer vision for Apple platforms."],
]);
const selectedWork = portfolioProjects.filter((project) => workSummaries.has(project.slug));

function TopicCard({ id, title, summary, children }: { id: string; title: string; summary: string; children: ReactNode }) {
  return (
    <li id={id} className="min-w-0 scroll-mt-6">
      <details className={styles.card}>
        <summary className={styles.summary}>
          <span className="min-w-0">
            <span className="block font-semibold break-words">{title}</span>
            <span className="mt-1 block text-sm text-muted">{summary}</span>
          </span>
        </summary>
        <div className={styles.cardBody}>{children}</div>
      </details>
    </li>
  );
}

export default function ConsultingResources() {
  return (
    <details className="min-w-0 flex-1">
      <summary className={styles.summary}>
        <h2 className="text-xl!">Services and selected work</h2>
      </summary>
      <div className="space-y-5 pt-2 pb-4">
        <section aria-labelledby="services-title">
          <h3 id="services-title" className="text-base!">How Velcrafting can help</h3>
          <ul className="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {serviceIntents.map(([key, summary, outcome]) => (
              <TopicCard key={key} id={key} title={services[key][0]} summary={summary}>
                <p className="text-sm">{outcome}</p>
                <a href={`/consulting?service=${key}#explorer`} aria-label={`Start a brief for ${services[key][0]}`}
                  className="mt-1 inline-flex min-h-11 items-center text-sm">
                  Start a brief
                </a>
              </TopicCard>
            ))}
          </ul>
          <a href="/consulting?service=unsure#explorer" className="inline-flex min-h-11 items-center text-sm">Not sure yet</a>
        </section>
        <section aria-labelledby="work-title">
          <h3 id="work-title" className="text-base!">Selected work</h3>
          <ul className="mt-3 grid items-start gap-3 sm:grid-cols-2">
            {selectedWork.map((project) => (
              <TopicCard key={project.slug} id={project.slug} title={project.name} summary={workSummaries.get(project.slug) ?? project.summary}>
                <p className="text-sm">{project.summary}</p>
                <p className="mt-2 text-sm">{project.proves}</p>
                {project.links.map(({ label, href }) => (
                  <a key={href} href={href} className="inline-flex min-h-11 items-center text-sm">{label}</a>
                ))}
              </TopicCard>
            ))}
          </ul>
          <Link className="mt-1 inline-flex min-h-11 items-center text-sm" href="/projects">See the project portfolio</Link>
        </section>
      </div>
    </details>
  );
}
