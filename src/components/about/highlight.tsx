// src/components/about/Highlight.tsx
import clsx from "clsx";
import { Card } from "../ui";

type Props = {
  variant?: "compact" | "full";
  className?: string;
  accentClass?: string; // e.g., "text-emerald-400 hover:text-emerald-300"
};

export default function Highlight({
  variant = "compact",
  className,
  accentClass = "text-emerald-400 hover:text-emerald-300",
}: Props) {
  return (
    <Card
      className={clsx(
        "relative overflow-hidden p-5",
        "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(40%_60%_at_10%_-10%,rgba(147,51,234,0.08),transparent_60%),radial-gradient(40%_60%_at_110%_120%,rgba(59,130,246,0.06),transparent_60%)]",
        className
      )}
      aria-labelledby="about-highlight-title"
    >
      <h2 id="about-highlight-title" className="text-lg font-semibold">
        About
      </h2>

      {variant === "compact" ? (
        <>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            Strategic comms and systems builder. I turn complexity into clarity across AI, Web3, and global communities.
          </p>

          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Built Ledger’s Defensive Communications from 0→1 and now scaling globally.</li>
            <li>Shipped AI-driven defenses delivering 1M+ proactive phishing alerts yearly.</li>
            <li>Created knowledge systems that cut response times by 70% and empower teams.</li>
          </ul>

          <div className="mt-4">
            <a href="/about" className={clsx("text-sm font-medium", accentClass)}>
              Read full bio →
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            Multi-disciplinary communications and technology leader with a track record of building functions from scratch
            and scaling them into global programs. My work bridges brand defense, AI integration, and community engagement,
            turning high-stakes complexity into clear action.
          </p>

          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            I design scalable frameworks to combat misinformation, lead vendor teams moderating millions of interactions,
            and build AI-driven systems that proactively protect users while empowering internal teams to respond faster.
          </p>

          <h3 className="mt-5 text-sm font-semibold">Career highlights</h3>
          <ul className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Established Ledger’s Defensive Communications department from 0→1, now scaling globally.</li>
            <li>Developed AI-powered tools delivering 1M+ proactive phishing alerts annually.</li>
            <li>Built community-driven knowledge systems and workshops enabling direct brand defense.</li>
            <li>Led IT modernization and large-scale infrastructure projects before pivoting into Web3, AI, and comms.</li>
          </ul>

          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
            I thrive where communication, trust, and emerging technology intersect, helping organizations navigate
            uncertainty with measurable impact.
          </p>
        </>
      )}
    </Card>
  );
}
