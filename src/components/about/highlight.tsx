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
      <h2 id="about-highlight-title" className="text-lg font-semibold">About ✨</h2>

      {variant === "compact" ? (
        <>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            Strategic communications and technology leader specializing in <em>brand reputation defense</em>,
            <em> misinformation management</em>, and <span className="underline decoration-emerald-400/40 underline-offset-2">AI‑driven community strategy</span>.
            I turn complexity into clear, <strong>defensible action</strong> across high‑stakes moments.
          </p>

          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Built Ledger’s <strong>Defensive Communications</strong> function from <strong>0→1</strong>; now scaling globally.</li>
            <li>Reduced response times by <strong>70%</strong> via workflows and approved playbooks.</li>
            <li>Co‑developed <em>AI phishing detection</em> projected to deliver <strong>1M+</strong> proactive alerts annually.</li>
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
            Strategic communications and technology leader focused on <em>brand reputation defense</em>,
            <em> misinformation management</em>, and <span className="underline decoration-emerald-400/40 underline-offset-2">AI integration</span>.
            I build functions from inception into <strong>global programs</strong>, bridging product, marketing, legal, and customer success
            to deliver unified, defensible messaging.
          </p>

          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            I design <strong>scalable frameworks</strong> that combine <em>human moderation, automation, and AI</em> to safeguard reputation,
            strengthen community trust, and drive product adoption. Experienced in PLG motions through community
            intelligence, technical advocacy, and user enablement.
          </p>

          <h3 className="mt-5 text-sm font-semibold">Career Highlights 🔥</h3>
          <ul className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Established Ledger’s <strong>Defensive Communications</strong> department from <strong>0→1</strong>, now scaling globally.</li>
            <li>Launched education‑first initiatives and <em>Community Notes</em> that increased social reach year‑over‑year.</li>
            <li>Built cross‑functional <span className="underline decoration-sky-400/40 underline-offset-2">knowledge systems</span> that empower rapid, credible response.</li>
            <li>Previously led <em>enterprise IT modernization</em>; now applying that rigor to AI, Web3, and comms.</li>
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
