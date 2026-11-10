// src/app/art/components/CountdownOverlay.tsx
"use client";
import React from "react";

export default function CountdownOverlay({ visible, t0, now }: { visible: boolean; t0: number | null; now: number }) {
  if (!visible || !t0) return null;
  const elapsed = Math.max(0, now - t0);
  const idx = Math.min(3, Math.floor(elapsed / 1000)); // 0..3
  const items = ["3", "2", "1", "GO!"];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex items-baseline gap-6">
        {items.map((txt, i) => (
          <span
            key={txt}
            className={
              "font-extrabold " + (i === 3 ? "text-5xl" : "text-6xl") + " " + (i === idx ? "text-emerald-400" : "text-white/25")
            }
          >
            {txt}
          </span>
        ))}
      </div>
    </div>
  );
}

