// src/app/art/page.tsx
import ArtClient from "./ArtClient";
export const dynamic = "force-dynamic";
import { Card } from "@/components/ui";

export default function Page() {
  return (
    <main className="min-h-dvh p-6">
    <Card>
      <h1 className="text-2xl mb-4">Bouncing Universe</h1>
      <p className="opacity-70 mb-6">Shapes represent visits. Hover to influence them.</p>
    </Card>
      <ArtClient />
    </main>
  );
}
