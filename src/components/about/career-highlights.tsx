// src/components/about/career-highlights.tsx
//
// The Career Highlights card (Steven's visual review, item 3).
//
// Split out of the combined component that previously nested these bullets inside the About
// card as a mismatched subsection. It is now a sibling card with the same treatment as About
// and Skills Overview: shared Card surface, one `text-lg font-semibold` heading, same body
// rhythm, padding owned by the Card.
//
// The highlights are the approved on-the-record lines, unchanged.
import { Card } from "@/components/ui";

const CAREER_HIGHLIGHTS: string[] = [
  "Established Ledger’s Defensive Communications department from 0→1, now scaling globally.",
  "Launched education-first initiatives and Community Notes that increased social reach year-over-year.",
  "Built cross-functional knowledge systems that empower rapid, credible response.",
  "Previously led enterprise IT modernization; now applying that rigor to AI, Web3, and comms.",
];

export default function CareerHighlights({ className }: { className?: string }) {
  return (
    <section aria-labelledby="career-highlights-title" className={className}>
      <Card aria-labelledby="career-highlights-title">
        <h2 id="career-highlights-title" className="text-lg font-semibold">
          Career Highlights 🔥
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          {CAREER_HIGHLIGHTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
