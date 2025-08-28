// src/app/about/page.tsx
import Highlight from "@/components/about/highlight";
import Timeline from "@/components/about/timeline";
import { Card } from "@/components/ui";

export default function AboutPage() {
  return (
    <div className="px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">About Steven Pajewski</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Strategic communications and technology leader specializing in brand reputation defense,
          misinformation management, and AI‑driven community strategy.
        </p>
      </header>

      <Highlight variant="full" />

      <section aria-labelledby="skills-title" className="mt-6">
        <Card aria-labelledby="skills-title">
          <h2 id="skills-title" className="text-lg font-semibold">Skills Overview</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3 text-sm text-neutral-700 dark:text-neutral-300">
            <div>
              <div className="font-medium">Communications & Brand</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>Crisis Communications, Reputation Management</li>
                <li>Community Engagement (Reddit, Discord, X)</li>
                <li>Knowledge Management Systems</li>
                <li>Content Strategy, SEO, Generative Engine Optimization (GEO)</li>
              </ul>
            </div>
            <div>
              <div className="font-medium">Leadership & Enablement</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>Vendor & Team Management</li>
                <li>Executive Briefings, Workshops</li>
                <li>Internal AI Education</li>
                <li>Cross‑functional Alignment</li>
              </ul>
            </div>
            <div>
              <div className="font-medium">Technical Tools</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>Python, JavaScript/React, OpenAI API, SQL</li>
                <li>Figma, CMS, AWS</li>
                <li>Web3, Tokenomics</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      <Timeline className="mt-6" />

      <section aria-labelledby="highlights-title" className="mt-6">
        <Card aria-labelledby="highlights-title">
          <h2 id="highlights-title" className="text-lg font-semibold">Select Projects & Highlights</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
            <li><span className="font-medium">Risqpost:</span> Built full‑stack AI system for brand risk detection and sentiment mapping.</li>
            <li><span className="font-medium">Crimson Odyssey:</span> Co‑authored Amazon‑published manga using generative AI and Figma.</li>
            <li><span className="font-medium">AI Tutor Agent:</span> Boosted onboarding with custom OpenAI‑powered tool at Nutel.</li>
            <li><span className="font-medium">Cloud/VoIP Overhaul:</span> Led enterprise IT upgrade across five automotive locations.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
