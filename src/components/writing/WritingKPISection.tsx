"use client";
import { MetricTile } from "@/components/ui";

type KPI = { value: string; label: string };

export default function WritingKPISection({ items }: { items?: KPI[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((k, i) => (
          <MetricTile key={i} value={k.value} label={k.label} />
        ))}
      </div>
    </section>
  );
}
