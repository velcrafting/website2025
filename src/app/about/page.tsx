// src/app/about/page.tsx
import Link from "next/link";
import Highlight from "@/components/about/highlight";
import Timeline from "@/components/about/timeline";

export default function AboutPage() {
  return (
    <div className="px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">About Steven Pajewski</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Communications, AI systems, and brand defense.</p>
      </header>

      <Highlight variant="full" />

      <section aria-labelledby="quick-facts-title">
        {/* quick facts unchanged */}
      </section>

      <Timeline />

      <section aria-labelledby="links-title">
        {/* links unchanged, using <Link> */}
      </section>
    </div>
  );
}