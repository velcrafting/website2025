"use client";

// Home path selector (Steven's visual review, item 2).
//
// What changed and why: the selected tab was signalled only by a thin accent top-rule and the
// faint sentence "Showing this preview", which did not read as selection. The selected tab now
// carries a branded surface + accent border AND a compact "Selected" badge, so the state is
// unmistakable and is not carried by colour alone.
//
// Three states stay visually distinct:
//   selection — accent border + raised surface + the word "Selected"
//   hover     — a darker border on an unselected tab only
//   focus     — an outline ring, from focus-visible, independent of both
//
// Tab semantics are completed here: roving tabindex, arrow keys (Left/Right and Up/Down, since
// the grid stacks on narrow screens), Home/End, and a panel labelled by the active tab. The
// copy, the two paths and the associated preview panel are unchanged.

import Link from "next/link";
import { useRef, useState } from "react";

import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

type PathId = "professional" | "lab";

type HomePath = {
  id: PathId;
  title: string;
  label: string;
  summary: string;
  previewTitle: string;
  preview: string;
  bullets: string[];
  href: string;
};

const paths: HomePath[] = [
  {
    id: "professional",
    title: "Professional",
    label: "Operating background",
    summary:
      "Communications leadership, reputation defense, cross-functional clarity, and AI-aware trust programs.",
    previewTitle: "Professional snapshot",
    preview:
      "A high-level view of the operating work: building communication systems, response functions, and executive-ready clarity around ambiguous technology and trust moments.",
    bullets: [
      "Built practical workflows, playbooks, and knowledge systems for high-stakes communications and reputation defense.",
      "Bridges executive narrative, product context, community intelligence, and operational response.",
      "Works across AI, Web3, trust, safety, and global communities without losing the human review layer.",
    ],
    href: "/about",
  },
  {
    id: "lab",
    title: "AI Research & Lab",
    label: "Independent build work",
    summary:
      "Inspectable AI systems, agent workbenches, local-first products, MCP tooling, simulations, and governance scaffolds.",
    previewTitle: "AI Research & Lab snapshot",
    preview:
      "The builder side of the site: local-first AI products, agent interfaces, MCP tools, authority layers, and simulations where claims are tied to visible receipts.",
    bullets: [
      "Builds under velcrafting and Vel-Labs with a bias toward inspectable systems over opaque demos.",
      "Current lanes include agent workbenches, local-first AI, synthetic simulations, MCP tooling, and governance scaffolds.",
      "The through-line is source-of-truth visibility: model behavior, human review, receipts, and audit trails should stay inspectable.",
    ],
    href: "/projects",
  },
];

export default function HomePathSelector() {
  const [activeId, setActiveId] = useState<PathId>("professional");
  const activePath = paths.find((path) => path.id === activeId) ?? paths[0];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const next = paths[index];
    if (!next) return;
    setActiveId(next.id);
    tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = paths.findIndex((path) => path.id === activeId);
    const last = paths.length - 1;
    let next: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = current === last ? 0 : current + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = current <= 0 ? last : current - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    focusTab(next);
  }

  return (
    <section className="mt-[var(--space-7)]" aria-labelledby="homepage-paths-title">
      <h2 id="homepage-paths-title">Choose a path</h2>
      <p className="measure-prose mt-[var(--space-2)]">
        Start with the professional operating story or the independent AI systems
        lab. The preview below updates in place.
      </p>

      <div
        className="mt-[var(--space-5)] grid gap-[var(--space-4)] lg:grid-cols-2"
        role="tablist"
        aria-label="Homepage paths"
        onKeyDown={onKeyDown}
      >
        {paths.map((path, index) => {
          const selected = activePath.id === path.id;
          return (
            <button
              key={path.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`homepage-path-tab-${path.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="homepage-path-preview"
              // Roving tabindex: one stop for the group, arrows move within it.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(path.id)}
              className={cn(
                "group h-full min-h-[48px] rounded-[var(--radius-surface)] border p-[var(--space-4)] text-left transition",
                // focus-visible ring is independent of selection and hover
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                selected
                  ? "border-[var(--accent)] bg-paper-raised"
                  : "border-rule bg-transparent hover:border-ink/40 hover:bg-paper-raised/60",
              )}
            >
              <span className="meta block uppercase tracking-wide">{path.label}</span>
              <span className="mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-3)]">
                <span className="text-[1.5rem] font-semibold text-ink">{path.title}</span>
                {selected ? <Badge variant="accent">Selected</Badge> : null}
              </span>
              <span className="mt-[var(--space-3)] block">{path.summary}</span>
              <span className={cn("meta mt-[var(--space-4)] block", selected ? "text-ink" : "")}>
                {selected ? "Preview shown below" : "Show this preview"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="homepage-path-preview"
        role="tabpanel"
        aria-labelledby={`homepage-path-tab-${activePath.id}`}
        className="surface mt-[var(--space-4)]"
      >
        <h3>{activePath.previewTitle}</h3>
        <p className="measure-prose mt-[var(--space-3)]">{activePath.preview}</p>
        <hr className="rule mt-[var(--space-5)]" />
        <ul className="mt-[var(--space-5)] grid list-none gap-[var(--space-4)] pl-0 lg:grid-cols-3">
          {activePath.bullets.map((bullet) => (
            <li key={bullet} className="meta">
              {bullet}
            </li>
          ))}
        </ul>
        <p className="mt-[var(--space-5)]">
          <Link href={activePath.href}>Read more</Link>
        </p>
      </div>
    </section>
  );
}
