// src/app/art/components/WinnerOverlay.tsx
"use client";
import React from "react";
import Button from "@/components/ui/Button";

type Counts = Record<string, number>;
type ShapeKind = "circle" | "square" | "triangle" | "star";

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      {kind === "circle" && (<circle cx="12" cy="12" r="8" fill="#9b87f5" />)}
      {kind === "square" && (<rect x="6" y="6" width="12" height="12" rx="2" fill="#60a5fa" />)}
      {kind === "triangle" && (<path d="M12 5 L19 19 L5 19 Z" fill="#34d399" />)}
      {kind === "star" && (<path d="M12 4 L14.9 9.5 L21 10.5 L16.5 14.6 L17.8 20.7 L12 17.8 L6.2 20.7 L7.5 14.6 L3 10.5 L9.1 9.5 Z" fill="#f59e0b" />)}
    </svg>
  );
}

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = React.useState(target);
  const ref = React.useRef<number>(target);
  React.useEffect(() => {
    const start = performance.now();
    const from = ref.current;
    const anim = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (target - from) * eased);
      setValue(v);
      if (t < 1) requestAnimationFrame(anim); else ref.current = target;
    };
    requestAnimationFrame(anim);
  }, [target, duration]);
  return value;
}

function CountTile({ kind, value }: { kind: ShapeKind; value: number }) {
  const animated = useCountUp(value);
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-white/5 p-3">
      <ShapeIcon kind={kind} />
      <div className="text-xs capitalize opacity-80">{kind}</div>
      <div className="text-lg font-semibold tabular-nums">{animated}</div>
    </div>
  );
}

export default function WinnerOverlay({
  visible,
  counts,
  winner,
  guess,
  selection,
  onPick,
  onStart,
  onReset,
}: {
  visible: boolean;
  counts: Counts | null;
  winner: ShapeKind | null;
  guess: ShapeKind | null;        // last round's pick, read-only
  selection: ShapeKind | null;    // next round selection, interactive
  onPick: (s: ShapeKind) => void;
  onStart: () => void;
  onReset: () => void;
}) {
  if (!visible) return null;
  const shapes: ShapeKind[] = ["circle", "square", "triangle", "star"];
  return (
    <div className="pointer-events-auto absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-neutral-900/70 p-6 shadow-xl">
        <h2 className="mb-2 text-xl font-semibold">Battle Results</h2>
        <div className="mb-3 text-sm opacity-80">Shapes</div>
        <div className="mb-4 grid grid-cols-4 gap-4">
          {shapes.map((s) => (
            <CountTile key={s} kind={s} value={counts?.[s] ?? 0} />
          ))}
        </div>
        {counts && (
          <div className="mb-6">
            <div className="mb-2 text-sm opacity-80">All-time winners</div>
            <div className="space-y-2">
              {shapes.map((s) => {
                const v = counts[s] ?? 0;
                const max = Math.max(...shapes.map((k) => counts[k] ?? 0), 1);
                const pct = Math.round((v / max) * 100);
                const color = s === "circle" ? "#9b87f5" : s === "square" ? "#60a5fa" : s === "triangle" ? "#34d399" : "#f59e0b";
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className="w-16 text-xs capitalize opacity-70">{s}</div>
                    <div className="h-2 flex-1 rounded bg-white/10">
                      <div className="h-full rounded" style={{ width: pct + '%', backgroundColor: color }} />
                    </div>
                    <div className="w-10 text-right text-xs tabular-nums">{v}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-4">
          <div className="text-sm opacity-80">Winner</div>
          <div className="mt-1 flex items-center gap-2 text-lg font-semibold capitalize">
            {winner ?? "None"}
          </div>
        </div>
        <div className="mb-6 text-sm">
          You guessed <span className="font-medium capitalize">{guess ?? "(no pick)"}</span> —
          {guess ? (guess === winner ? " congratulations!" : " better luck next time.") : " pick next time!"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm opacity-70">Try again? Pick and start:</span>
          {shapes.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={selection === s ? "accent" : "outline"}
              onClick={() => onPick(s)}
            >
              {s}
            </Button>
          ))}
          <Button className="ml-auto" size="sm" variant="accent" disabled={!selection} onClick={onStart}>
            Start Next Battle
          </Button>
          <Button size="sm" variant="outline" onClick={onReset}>Reset board</Button>
        </div>
      </div>
    </div>
  );
}
