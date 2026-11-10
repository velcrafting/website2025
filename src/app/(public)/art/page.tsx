// src/app/art/page.tsx
import ArtClient from "./ArtClient";
export const dynamic = "force-dynamic";
import { Card } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Art",
    description: "Interactive canvas: a playful physics demo representing visits and interactions.",
    canonicalPath: "/art",
  });

export default function Page() {
  return (
    <main className="min-h-dvh p-6">
    <Card>
      <h1 className="text-4xl sm:text-5xl md:text-6xl mb-4 [text-wrap:balance]">Bouncing Universe</h1>

      {/* The arcade is the other thing on this surface. Steven, 2026-09-16: the arcade "should operate
          like the tools page... but visually packaged like netflix". It lives at /arcade. */}
      <p className="mb-4">
        Looking for the games? They are in the <a href="/arcade">arcade</a>.
      </p>

      <div className="space-y-2 opacity-80 mb-4">
        <p>Shapes represent website visits. Built for desktop browser 🖥️</p>
        <p> Hover to create gravity and swirl them around. Use the sidebar as a configuration panel to switch modes, adjust mouse influence, and view the live winners chart.</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Sandbox: shapes loop and gradually respawn over time.</li>
          <li>Battle: pick a winner (shape type), then start — a black hole grows until one remains (≤ 60s). The hole appears during countdown and pulls only after GO.</li>
          <li>Destruction: collisions can shatter shapes into smaller pieces and colorful particles (per‑session only).</li>
          <li>Reset: after a battle ends, reset to go again. Winners are tallied anonymously over time.</li>
        </ul>
      </div>
    </Card>
      <ArtClient />
    </main>
  );
}
