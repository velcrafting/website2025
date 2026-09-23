// src/components/about/about-summary.tsx
//
// The About card (Steven's visual review, item 3).
//
// It previously lived inside one combined component that also contained Career Highlights, so
// the card read as "About" with a mismatched subsection bolted on. About and Career Highlights
// are now separate sibling cards, and this one uses the same card treatment as Skills Overview:
// the shared Card surface, one `text-lg font-semibold` heading, and the same `mt-3` body
// rhythm. Padding comes from the Card, so all three cards line up.
//
// The copy is the approved About text, unchanged.
import { Card } from "@/components/ui";

export default function AboutSummary({ className }: { className?: string }) {
  return (
    <section aria-labelledby="about-summary-title" className={className}>
      <Card aria-labelledby="about-summary-title">
        <h2 id="about-summary-title" className="text-lg font-semibold">
          About 🧭
        </h2>
        <div className="mt-3 space-y-3 text-sm text-muted">
          <p>
            Strategic communications and technology leader focused on{" "}
            <em>brand reputation defense</em>, <em>misinformation management</em>, and{" "}
            <span className="underline decoration-link/40 underline-offset-2">
              AI integration
            </span>
            . I build functions from inception into <strong>global programs</strong>, bridging
            product, marketing, legal, and customer success to deliver unified, defensible
            messaging.
          </p>
          <p>
            I design <strong>scalable frameworks</strong> that combine{" "}
            <em>human moderation, automation, and AI</em> to safeguard reputation, strengthen
            community trust, and drive product adoption. Experienced in PLG motions through
            community intelligence, technical advocacy, and user enablement.
          </p>
          <p>
            I thrive where communication, trust, and emerging technology intersect, helping
            organizations navigate uncertainty with measurable impact.
          </p>
        </div>
      </Card>
    </section>
  );
}
