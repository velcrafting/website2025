// src/components/about/timeline.tsx

/**
 * Logo assets guidance:
 * - Put logos in /public/about/logos
 * - Use square images with transparent background
 * - Source size: 160x160 px (min). 192x192 px is ideal for retina.
 * - Format: PNG or SVG. Keep file size < 50 KB.
 */

import Image from "next/image";
import clsx from "clsx";
import { Card } from "../ui";

type EmploymentType = "Full-time" | "Contract" | "Self-employed";

type Entry = {
  company: string;
  role: string;
  employmentType?: EmploymentType;
  location?: string;
  remote?: boolean;
  logo?: string;     // e.g. "/about/logos/ledger.png"
  start: string;     // "YYYY-MM-01"
  end?: string;      // omit for present
  summary?: string;
  highlights?: string[];
};

const RAW_ENTRIES: Entry[] = [
  {
    company: "Ledger",
    role: "Defensive Communications Manager",
    employmentType: "Contract",
    remote: true,
    logo: "/about/logos/ledger.png",
    start: "2024-07-01",
    summary:
      "Established first Defensive Communications function; frameworks for brand trust, misinformation response, and community mobilization across Reddit, Discord, X, YouTube, and TikTok.",
    highlights: [
      "Built the department’s foundation from scratch (playbooks, workflows, vendor partnerships)",
      "Reduced response times by 70% via streamlined workflows and approved messaging playbooks",
      "Designed and deployed cross‑functional FAQ/brand‑response database (AppSheet) used by PR, Support, Social, and affiliates",
      "Directed global moderation strategy, overseeing vendors moderating millions of interactions across Reddit, Discord, and X",
      "Co‑developed AI‑powered phishing detection projected to deliver 1M+ proactive alerts annually",
      "Launched Community Notes and education‑first initiatives; doubled social reach YoY and improved brand credibility",
      "Partnered with executives and cross‑functional leaders to align rapid‑response strategies during launches and sensitive events",
    ],
  },
  {
    company: "Self-employed",
    role: "Developer & Project Lead — velcrafting.com",
    employmentType: "Self-employed",
    remote: true,
    logo: "/about/logos/velcrafting.png",
    start: "2021-04-01",
    summary:
      "Independent consultant building open‑source tools, platforms, and blockchain systems with tokenomics. Led community ops and strategy.",
    highlights: [
      "Create AI‑driven tools and products to optimize workflows",
      "Build Web3 platforms, tokenomics, smart contracts, and mini‑game systems",
      "Lead digital event coordination and strategic content for community engagement",
      "Marketing and brand building support for startups and Web3 communities",
    ],
  },
  {
    company: "NUTEL Solutions",
    role: "Developer, Front-End Designer & Researcher",
    employmentType: "Full-time",
    remote: true,
    logo: "/about/logos/nutel.png",
    start: "2023-08-01",
    end: "2024-03-01",
    summary:
      "Delivered AI tutor‑agent prototype and integrated design into full‑stack workflow to improve team efficiency.",
    highlights: [
      "Developed educational AI tutor‑agent for finance team",
      "Introduced Figma into full‑stack workflow for development and creative teams",
      "Authored technical process documentation to ease onboarding to new tools",
    ],
  },
  {
    company: "Crimson Odyssey",
    role: "Co-Author, Developer & Designer",
    employmentType: "Self-employed",
    remote: true,
    logo: "/about/logos/crimson-odyssey.png",
    start: "2023-10-01",
    end: "2024-01-01",
    summary:
      "Co-wrote and produced a 50-page manga in one month; integrated AI sub-agents for continuity; 5-star rating on Amazon.",
  },
  {
    company: "Mike Maroone Automotive",
    role: "Director of IT",
    employmentType: "Full-time",
    location: "Colorado Springs, CO",
    logo: "/about/logos/mike-maroone.png",
    start: "2018-06-01",
    end: "2021-04-01",
    summary:
      "Managed IT operations across five locations and led enterprise infrastructure upgrades (cloud domain, network, VoIP).",
  },
  {
    company: "Comcast",
    role: "Infrastructure and Implementation Engineer II",
    location: "Colorado Springs, CO",
    logo: "/about/logos/comcast.png",
    start: "2017-09-01",
    end: "2018-04-01",
    summary:
      "Built CATS racks, ran coax/Cat6/fiber, created metrics and procedures, rapid troubleshooting.",
  },
  {
    company: "Randstad Technologies US",
    role: "Media IT Asset Manager",
    location: "Wilmington, DE",
    logo: "/about/logos/randstad.png",
    start: "2015-09-01",
    end: "2017-09-01",
    summary:
      "Data-center asset deployments, decommission logistics, ops documentation.",
  },
//   {
//     company: "Discover Financial Services",
//     role: "Account Manager",
//     location: "New Castle, DE",
//     logo: "/about/logos/discover.png",
//     start: "2015-03-01",
//     end: "2015-09-01",
//     summary:
//       "Customer retention and team performance analytics in a high-volume environment.",
//   },
//   {
//     company: "Self-employed",
//     role: "Independent Contractor",
//     location: "Orlando, FL",
//     logo: "/about/logos/independent-contractor.png",
//     start: "2014-09-01",
//     end: "2015-02-01",
//     summary:
//       "Telecom installs, Avaya programming, network upgrades, POS repair, SMB cabling solutions.",
//   },
//   {
//     company: "Geek Squad",
//     role: "Consultation Agent / Customer Specialist",
//     location: "Dover, DE",
//     logo: "/about/logos/geek-squad.png",
//     start: "2009-06-01",
//     end: "2014-09-01",
//     summary:
//       "Front-line diagnostics, customer support, and documentation across consumer tech.",
//   },
];

// Present-first comparator. Then sort present roles by newest start.
// Past roles sorted by newest end, then start.
const ENTRIES = [...RAW_ENTRIES].sort((a, b) => {
  const aPresent = !a.end;
  const bPresent = !b.end;

  if (aPresent !== bPresent) return aPresent ? -1 : 1;
  if (aPresent && bPresent) {
    return Date.parse(b.start) - Date.parse(a.start);
  }
  const endDelta = Date.parse(b.end!) - Date.parse(a.end!);
  if (endDelta !== 0) return endDelta;
  return Date.parse(b.start) - Date.parse(a.start);
});

function fmtMMMYYYY(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

function diffYM(startISO: string, endISO?: string) {
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : new Date();
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const y = years > 0 ? `${years} yr${years > 1 ? "s" : ""}` : "";
  const m = rem > 0 ? `${rem} mo${rem > 1 ? "s" : ""}` : "";
  return [y, m].filter(Boolean).join(" ");
}

export default function Timeline({ className }: { className?: string }) {
  return (
    <section className={clsx("space-y-4", className)} aria-labelledby="timeline-title">
      <h2 id="timeline-title" className="text-lg font-semibold text-neutral-900 dark:text-white">Timeline</h2>
      <ol className="space-y-3">
        {ENTRIES.map((item) => {
          const start = fmtMMMYYYY(item.start);
          const end = item.end ? fmtMMMYYYY(item.end) : "Present";
          const span = diffYM(item.start, item.end);
          return (
            <li key={`${item.company}-${item.role}-${item.start}`}>
              <div className="rounded-xl border p-4 bg-white border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900/60">
                <Card>
                <div className="flex items-start gap-3">
                  {item.logo ? (
                    <div className="shrink-0">
                      <Image
                        src={item.logo}
                        alt={`${item.company} logo`}
                        width={40}
                        height={40}
                        className="rounded-md border border-neutral-800 bg-neutral-100 object-contain p-1 dark:bg-neutral-900"
                      />
                    </div>
                  ) : null}

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white">{item.role}</div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      {item.company}
                      {item.employmentType ? ` · ${item.employmentType}` : ""}
                      {item.remote ? " · Remote" : item.location ? ` · ${item.location}` : ""}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {start} to {end} {span ? `• ${span}` : ""}
                    </div>

                    {item.summary ? (
                      <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{item.summary}</p>
                    ) : null}

                    {item.highlights?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
                        {item.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
                </Card>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
