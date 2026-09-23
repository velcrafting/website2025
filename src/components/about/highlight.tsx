// src/components/about/highlight.tsx
//
// Concept 03 / refresh contract: the Card owns its own spacing, so the caller no
// longer forces `p-5` over it, and the decorative violet/blue radial bloom is
// retired (its arbitrary gradient was the last decorative radial rule inside a
// reached component). Colours move from the retired neutral palette to tokens.
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Card } from "../ui";

const linkAccent = cva("text-sm font-medium", {
  variants: {
    tone: {
      /** default: the editorial link colour */
      default: "text-link hover:text-ink",
      /** quieter treatment for secondary contexts */
      quiet: "text-muted hover:text-ink",
    },
  },
  defaultVariants: { tone: "default" },
});

type Props = {
  variant?: "compact" | "full";
  className?: string;
  /** Kept for callers that pass an explicit class; token-based by default. */
  accentClass?: string;
} & VariantProps<typeof linkAccent>;

export default function Highlight({
  variant = "compact",
  className,
  accentClass,
  tone,
}: Props) {
  return (
    <Card className={cn("relative", className)} aria-labelledby="about-highlight-title">
      <h2 id="about-highlight-title" className="text-lg font-semibold">
        About ✨
      </h2>

      {variant === "compact" ? (
        <>
          <p className="mt-[var(--space-3)] text-sm text-muted">
            Strategic communications and technology leader specializing in{" "}
            <em>brand reputation defense</em>, <em>misinformation management</em>, and{" "}
            <span className="decoration-link/40 underline underline-offset-2">
              AI‑driven community strategy
            </span>
            . I turn complexity into clear, <strong>defensible action</strong> across
            high‑stakes moments.
          </p>

          <ul className="mt-[var(--space-3)] list-disc space-y-2 pl-[var(--space-5)] text-sm text-muted">
            <li>
              Built Ledger&rsquo;s <strong>Defensive Communications</strong> function from{" "}
              <strong>0→1</strong>; now scaling globally.
            </li>
            <li>
              Reduced response times by <strong>70%</strong> via workflows and approved
              playbooks.
            </li>
            <li>
              Co‑developed <em>AI phishing detection</em> projected to deliver{" "}
              <strong>1M+</strong> proactive alerts annually.
            </li>
          </ul>

          <div className="mt-[var(--space-4)]">
            <a href="/about" className={cn(linkAccent({ tone }), accentClass)}>
              Read full bio →
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="mt-[var(--space-3)] text-sm text-muted">
            Strategic communications and technology leader focused on{" "}
            <em>brand reputation defense</em>, <em>misinformation management</em>, and{" "}
            <span className="decoration-link/40 underline underline-offset-2">
              AI integration
            </span>
            . I build functions from inception into <strong>global programs</strong>,
            bridging product, marketing, legal, and customer success to deliver unified,
            defensible messaging.
          </p>

          <p className="mt-[var(--space-3)] text-sm text-muted">
            I design <strong>scalable frameworks</strong> that combine{" "}
            <em>human moderation, automation, and AI</em> to safeguard reputation,
            strengthen community trust, and drive product adoption. Experienced in PLG
            motions through community intelligence, technical advocacy, and user
            enablement.
          </p>

          <h3 className="mt-[var(--space-5)] text-sm font-semibold">
            Career Highlights 🔥
          </h3>
          <ul className="mt-[var(--space-2)] space-y-2 text-sm text-muted">
            <li>
              Established Ledger&rsquo;s <strong>Defensive Communications</strong>{" "}
              department from <strong>0→1</strong>, now scaling globally.
            </li>
            <li>
              Launched education‑first initiatives and <em>Community Notes</em> that
              increased social reach year‑over‑year.
            </li>
            <li>
              Built cross‑functional{" "}
              <span className="decoration-link/40 underline underline-offset-2">
                knowledge systems
              </span>{" "}
              that empower rapid, credible response.
            </li>
            <li>
              Previously led <em>enterprise IT modernization</em>; now applying that rigor
              to AI, Web3, and comms.
            </li>
          </ul>

          <p className="mt-[var(--space-4)] text-sm text-muted">
            I thrive where communication, trust, and emerging technology intersect,
            helping organizations navigate uncertainty with measurable impact.
          </p>
        </>
      )}
    </Card>
  );
}
