// src/components/home/KPISection.tsx
import MetricTile from "@/components/ui/MetricTile";

export default function KPISection() {
  return (
    <section className="">
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          value="70%"
          label="Faster response times"
          sublabel="from triage to resolution"
        />
        <MetricTile
          value="1M+"
          label="Proactive phishing alerts yearly"
          sublabel="AI-driven detection at scale"
        />
        <MetricTile
          value="Global"
          label="Community reach"
          sublabel="multi-region coverage"
        />
      </div>
    </section>
  );
}
