// src/components/about/timeline.tsx
//
// Concept 03 / refresh contract migration.
//
// What changed and why:
//  - The entries were a bordered `rounded-xl ... bg-white` box wrapping a `Card`, so
//    every role was a box inside a box. That nesting is the redundancy reported on
//    /about. Entries are now rule-topped blocks, which is how the reading surfaces
//    group repeated items.
//  - The retired neutral ramp and the emerald "Present" chip are replaced by tokens;
//    the Present marker uses the shared Badge status API instead of a one-off colour.
//  - Radii come from the radius tokens, and the shadow/surface styling is gone.
//
// Stored employment dates remain unchanged.
import Image from "next/image";

import Badge from "@/components/ui/Badge";
import { calendarMonthDifference, formatMonthYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/**
 * Logo assets guidance:
 * - Put logos in /public/about/logos
 * - Use square images with transparent background
 * - Source size: 160x160 px (min). 192x192 px is ideal for retina.
 * - Format: PNG or SVG. Keep file size < 50 KB.
 */

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
    role: "Defensive Communications Specialist",
    employmentType: "Contract",
    remote: true,
    logo: "/about/logos/ledger.png",
    start: "2024-07-01",
    summary:
      "Defensive Communications focused on Brand Trust & AI Visibility; built the function from 0→1 with response, FAQ, and visibility systems.",
    highlights: [
      "Built Defensive Communications from 0→1 with playbooks, workflows, and approved messaging.",
      "Reduced time to first comment from ~3–4 days to ~14 hours.",
      "Built an AppSheet FAQ and response system while improving AI-answer visibility from approximately 40% to 51%+ sustained and nearly doubling Ledger-owned citation share.",
    ],
  },
  {
    company: "Velcrafting",
    role: "Founder, Technical Consultant & Product Builder",
    employmentType: "Self-employed",
    remote: true,
    logo: "/about/logos/velcrafting.png",
    start: "2016-07-01",
    summary:
      "Public practice since 2016; developer work under the Velcrafting name began in 2021, with the company formed as an LLC in 2024.",
    highlights: [
      "Build public AI tools, products, and experiments to make complex work more usable.",
      "Develop platforms and community-facing systems across AI, Web3, and communications.",
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
      "Co-authored a 50-page manga in one month, combining generative AI, human storytelling, and Figma.",
    highlights: [
      "Worked across storyboarding, scripting, art direction, continuity, and layout.",
      "Built AI-assisted creative workflows and co-developed print-ready and digital editions in Figma.",
    ],
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
      "Led infrastructure and VoIP modernization across five dealership locations.",
    highlights: [
      "Directed IT operations for an estimated 400+ users across five dealership locations.",
      "Led infrastructure and VoIP modernization with zero downtime during cutover.",
      "Helped reduce onboarding from 3–4 weeks to 3 days.",
    ],
  },
  {
    company: "Comcast",
    role: "Infrastructure and Implementation Engineer II",
    location: "Colorado Springs, CO",
    logo: "/about/logos/comcast.png",
    start: "2017-09-01",
    end: "2018-04-01",
    summary:
      "Built and standardized Comcast Automated Testing System (CATS) racks to replicate field outages and support troubleshooting.",
    highlights: [
      "Constructed 24+ CATS racks, each supporting up to 24 household nodes.",
      "Deployed coax, Cat6, and fiber cabling to replicate real-world outage conditions",
      "Supported an estimated 20–30% improvement in mean time to repair (MTTR).",
    ],
  },
  {
    company: "Randstad Technologies US",
    role: "Media Information Technology Asset Manager",
    location: "Wilmington, DE",
    logo: "/about/logos/randstad.png",
    start: "2015-09-01",
    end: "2017-09-01",
    summary:
      "Managed lifecycle and data-center logistics, including secure disposal for enterprise IT assets.",
    highlights: [
      "Coordinated deployment and decommissioning of servers and networking assets.",
      "Supervised secure destruction of drives.",
      "Tracked assets and improved documentation across facilities.",
    ],
  },
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

function formatDuration(months: number | null) {
  if (months === null) return "";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const y = years > 0 ? `${years} yr${years > 1 ? "s" : ""}` : "";
  const m = rem > 0 ? `${rem} mo${rem > 1 ? "s" : ""}` : "";
  return [y, m].filter(Boolean).join(" ");
}

export default function Timeline({ className }: { className?: string }) {
  return (
    <section className={cn(className)} aria-labelledby="timeline-title">
      <h2 id="timeline-title" className="text-lg font-semibold">
        Career Timeline 🗓️
      </h2>
      {/* Rule-topped entries rather than a card per role: grouping comes from the
          hairline and the spacing scale. */}
      <ol className="mt-[var(--space-4)] list-none space-y-0 pl-0">
        {ENTRIES.map((item) => {
          const start = formatMonthYear(item.start);
          const end = item.end ? formatMonthYear(item.end) : "Present";
          const span = formatDuration(calendarMonthDifference(item.start, item.end));
          return (
            <li
              key={`${item.company}-${item.role}-${item.start}`}
              className="border-t border-rule py-[var(--space-4)]"
            >
              <div className="flex items-start gap-[var(--space-3)]">
                {item.logo ? (
                  <div className="shrink-0">
                    <Image
                      src={item.logo}
                      alt={`${item.company} logo`}
                      width={40}
                      height={40}
                      className="rounded-[var(--radius-chip)] border border-rule bg-[var(--field-background)] object-contain p-1"
                    />
                  </div>
                ) : null}

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{item.role}</div>
                  <div className="text-xs text-muted">
                    {item.company}
                    {item.employmentType ? ` · ${item.employmentType}` : ""}
                    {item.remote ? " · Remote" : item.location ? ` · ${item.location}` : ""}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-[var(--space-2)] text-xs text-muted">
                    <span>
                      {start} – {end}
                    </span>
                    {!item.end ? <Badge variant="accent">Present</Badge> : null}
                    {span ? <span>• {span}</span> : null}
                  </div>

                  {item.summary ? (
                    <p className="mt-[var(--space-2)] text-sm text-muted">{item.summary}</p>
                  ) : null}

                  {item.highlights?.length ? (
                    <ul className="mt-[var(--space-2)] list-disc space-y-1 pl-[var(--space-5)] text-sm text-muted">
                      {item.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
