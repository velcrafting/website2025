// src/app/art/page.tsx
import ArtClient from "./ArtClient";
export const dynamic = "force-dynamic";
import { Card } from "@/components/ui";

export default function Page() {
  return (
    <main className="min-h-dvh p-6">
    <Card>
      <h1 className="text-6xl mb-4">Bouncing Universe</h1>
      <div className="space-y-2 opacity-80 mb-4">
        <p>Shapes represent visits. Hover to create gravity and swirl them around. Use the sidebar as a configuration panel to switch modes, adjust mouse influence, and view the live winners chart.</p>
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
