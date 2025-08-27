"use client";
import { useState } from "react";

type Tab = { id: string; label: string; content: React.ReactNode };
export default function Tabs({ tabs, initialId }: { tabs: Tab[]; initialId?: string }) {
  const [active, setActive] = useState(initialId || tabs[0]?.id);
  return (
    <div>
      <div className="flex gap-2 border-b dark:border-neutral-800">
        {tabs.map(t => (
          <button key={t.id}
            className={`px-3 py-2 text-sm ${active === t.id ? "border-b-2 border-neutral-900 dark:border-white font-medium" : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300"}`}
            onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-3">{tabs.find(t => t.id === active)?.content}</div>
    </div>
  );
}