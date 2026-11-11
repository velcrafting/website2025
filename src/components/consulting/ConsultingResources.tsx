import Link from "next/link";
import type { Service } from "@/consulting/brief";
import styles from "./disclosure.module.css";

const serviceCards = [
  ["review", "Choose a direction", "Decide what to build or buy."],
  ["build", "Build a prototype", "Build what your tools are missing."],
  ["workflow", "Improve a workflow", "Automate repetitive work."],
  ["communications", "Clarify your message", "Make your offer easier to find."],
] as const;

export const serviceCardTitles = Object.fromEntries(serviceCards.map(([key, title]) => [key, title])) as Record<Exclude<Service, "unsure">, string>;

const work = [
  {
    id: "companyos",
    title: "CompanyOS",
    category: "Enterprise work",
    summary: "A knowledge system that helps teams find approved answers and keep them current.",
    detail: "Steven built and maintains the system. It identifies trusted sources, shows who owns the information, and routes corrections for review. Teams use it to prepare briefs and answer questions using the latest guidance.",
  },
  {
    id: "nutel-solutions",
    title: "NUTEL Solutions",
    category: "Client engagement",
    summary: "An AI tutor prototype for onboarding finance managers.",
    detail: "Steven led finance and management workshops, then built a tutor that draws on training materials and guides learners through a staged curriculum. An initial group of 12 finance managers used the working prototype. NUTEL staff received tools they could adapt and maintain.",
  },
  {
    id: "still",
    title: "Still",
    category: "Velcrafting product",
    summary: "An iPhone and web product for Scripture reading and reflection.",
    detail: "Still gives readers a short passage in context and a place to reflect on it. The project brings together native iPhone design, a public web reader, and daily reflections in a product Velcrafting builds and operates.",
    href: "https://stillfaithful.app/",
  },
] as const;

export function ConsultingServices({ selectedService, onSelect }: {
  selectedService: Service;
  onSelect: (service: Exclude<Service, "unsure">) => void;
}) {
  return (
    <section aria-labelledby="services-title" className="pt-2">
      <h2 id="services-title" className="text-xl!">How Velcrafting can help</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {serviceCards.map(([key, title, summary]) => (
          <li key={key} id={key} className="min-w-0 scroll-mt-6">
            <a href={`/consulting?service=${key}#explorer`} className={styles.serviceCard}
              aria-current={selectedService === key ? "true" : undefined}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onSelect(key);
              }}>
              <span className="font-semibold">{title}</span>
              <span className="text-sm text-muted">{summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SelectedWork() {
  return (
    <details id="selected-work">
      <summary className={styles.summary}>
        <h2 className="text-xl!">Selected work</h2>
      </summary>
      <ul className="grid gap-3 pt-2 sm:grid-cols-3">
        {work.map((project) => (
          <li key={project.id} id={project.id} className="flex min-w-0">
            <details className={styles.card}>
              <summary className={styles.summary}>
                <span className="min-w-0">
                  <span className="block font-sans text-xs text-muted">{project.category}</span>
                  <span className="mt-1 block font-semibold">{project.title}</span>
                  <span className="mt-1 block text-sm text-muted">{project.summary}</span>
                </span>
              </summary>
              <div className={styles.cardBody}>
                <p className="text-sm">{project.detail}</p>
                {"href" in project && (
                  <a href={project.href} className="inline-flex min-h-11 items-center text-sm">Visit Still</a>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
      <Link className="mt-1 inline-flex min-h-11 items-center text-sm" href="/projects">See the project portfolio</Link>
    </details>
  );
}
