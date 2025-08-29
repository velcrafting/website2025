// src/app/about/page.tsx
import Highlight from "@/components/about/highlight";
import Timeline from "@/components/about/timeline";
import { Card } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import Script from "next/script";

export const generateMetadata = () =>
  buildMetadata({
    title: "About",
    description: "Strategic communications and technology leader focused on brand reputation defense, misinformation management, and AI‑driven community strategy.",
    canonicalPath: "/about",
  });

export default function AboutPage() {
  return (
    <div className="px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">About Steven Pajewski</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Strategic communications and technology leader specializing in <em>brand reputation defense</em>,
          <em> misinformation management</em>, and <span className="underline decoration-emerald-400/40 underline-offset-2">AI‑driven community strategy</span>.
        </p>
      </header>

      {/* JSON-LD: Breadcrumbs and Organization with nested Person */}
      <Script id="ld-breadcrumb-about" type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" },
              { "@type": "ListItem", position: 2, name: "About", item: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/about` },
            ],
          }),
        }}
      />
      <Script id="ld-org-about" type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Velcrafting",
            url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
            logo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/about/velcrafting.png`,
            sameAs: [
              "https://linkedin.com/in/spajewski",
              "https://github.com/velcrafting/",
            ],
            founder: {
              "@type": "Person",
              name: "Steven Pajewski",
              url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/about`,
              image: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/avatar.png`,
              sameAs: [
                "https://linkedin.com/in/spajewski",
                "https://github.com/velcrafting/",
              ],
            },
          }),
        }}
      />

      <Highlight variant="full" />

      <section aria-labelledby="skills-title" className="mt-6">
        <Card aria-labelledby="skills-title">
          <h2 id="skills-title" className="text-lg font-semibold">Skills Overview 🧰</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3 text-sm text-neutral-700 dark:text-neutral-300">
            <div>
              <div className="font-medium">📣 Communications & Brand</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>
                  Crisis Communications, <strong>Reputation Management</strong>
                </li>
                <li>
                  Community Engagement (<em>Reddit</em>, <em>Discord</em>, <em>X</em>)
                </li>
                <li>
                  Knowledge Management Systems
                </li>
                <li>
                  Content Strategy, SEO, <span className="underline decoration-sky-400/40 underline-offset-2">Generative Engine Optimization (GEO)</span>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-medium">🤝 Leadership & Enablement</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li><strong>Vendor</strong> & Team Management</li>
                <li>Executive Briefings, <em>Workshops</em></li>
                <li><span className="underline decoration-violet-400/40 underline-offset-2">Internal AI Education</span></li>
                <li>Cross‑functional Alignment</li>
              </ul>
            </div>
            <div>
              <div className="font-medium">🛠️ Technical Tools</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li><strong>Python</strong>, <strong>JavaScript/React</strong>, OpenAI API, SQL</li>
                <li>Figma, CMS, AWS</li>
                <li>Web3, <em>Tokenomics</em></li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      <Timeline className="mt-6" />

      <section aria-labelledby="highlights-title" className="mt-6">
        <Card aria-labelledby="highlights-title">
          <h2 id="highlights-title" className="text-lg font-semibold">Select Projects & Highlights ✨</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
            <li>🛡️ <span className="font-medium">Risqpost:</span> Built full‑stack <strong>AI</strong> system for brand risk detection and sentiment mapping.</li>
            <li>🎨 <span className="font-medium">Crimson Odyssey:</span> Co‑authored Amazon‑published manga using generative AI and Figma.</li>
            <li>🧠🤖 <span className="font-medium">AI Tutor Agent:</span> Boosted onboarding with custom OpenAI‑powered tool at Nutel.</li>
            <li>☁️📞 <span className="font-medium">Cloud/VoIP Overhaul:</span> Led enterprise IT upgrade across five automotive locations.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
