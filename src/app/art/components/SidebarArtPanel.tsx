// src/app/art/components/SidebarArtPanel.tsx
"use client";
import React from "react";
import { Card, Button } from "@/components/ui";

export default function SidebarArtPanel() {
  const [counts, setCounts] = React.useState<Record<string, number> | null>(null);
  const [mode, setModeState] = React.useState<"sandbox" | "battle">("sandbox");
  const [pick, setPick] = React.useState<"circle" | "square" | "triangle" | "star" | null>(null);
  const [scale, setScale] = React.useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(localStorage.getItem("art.mouseScale") ?? 1);
    return isFinite(v) && v > 0 ? v : 1;
  });
  const [asteroids, setAsteroids] = React.useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(localStorage.getItem("art.asteroidScale") ?? 1);
    return isFinite(v) && v >= 0 ? v : 1;
  });
  const [asteroidMouseBattle, setAsteroidMouseBattle] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = localStorage.getItem('art.asteroidMouseBattle');
    return v === '1' || v === 'true';
  });
  const [fpsCap, setFpsCap] = React.useState<number>(() => {
    if (typeof window === 'undefined') return 60;
    const v = Number(localStorage.getItem('art.fpsCap') ?? 60);
    return isFinite(v) && v >= 15 ? v : 60;
  });

  React.useEffect(() => {
    let t: number | null = null;
    const load = async () => {
      try {
        const r = await fetch("/api/art/winner", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        setCounts(j.counts as Record<string, number>);
      } catch {}
    };
    load();
    t = window.setInterval(load, 20000);
    return () => { if (t) window.clearInterval(t); };
  }, []);

  React.useEffect(() => {
    const onModeUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ mode: "sandbox" | "battle" }>;
      if (ce?.detail?.mode) setModeState(ce.detail.mode);
    };
    window.addEventListener("art:modeUpdated", onModeUpdated as EventListener);
    return () => window.removeEventListener("art:modeUpdated", onModeUpdated as EventListener);
  }, []);

  const setMode = (m: "sandbox" | "battle") => {
    setModeState(m);
    window.dispatchEvent(new CustomEvent("art:setMode", { detail: { mode: m } }));
  };
  const onScale = (v: number) => {
    setScale(v);
    localStorage.setItem("art.mouseScale", String(v));
    window.dispatchEvent(new CustomEvent("art:setMouseScale", { detail: { value: v } }));
  };
  const onAsteroids = (v: number) => {
    setAsteroids(v);
    localStorage.setItem("art.asteroidScale", String(v));
    window.dispatchEvent(new CustomEvent("art:setAsteroidScale", { detail: { value: v } }));
  };
  const onAsteroidMouseBattle = (v: boolean) => {
    setAsteroidMouseBattle(v);
    localStorage.setItem('art.asteroidMouseBattle', v ? '1' : '0');
    window.dispatchEvent(new CustomEvent('art:setAsteroidMouseBattle', { detail: { value: v } }));
  };
  const onFpsCap = (v: number) => {
    setFpsCap(v);
    localStorage.setItem('art.fpsCap', String(v));
    window.dispatchEvent(new CustomEvent('art:setFpsCap', { detail: { value: v } }));
  };

  const shapes: Array<{ k: string; color: string; label: string }> = [
    { k: "circle", color: "#9b87f5", label: "Circle" },
    { k: "square", color: "#60a5fa", label: "Square" },
    { k: "triangle", color: "#34d399", label: "Triangle" },
    { k: "star", color: "#f59e0b", label: "Star" },
  ];

  return (
    <Card>
      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide opacity-70">Art Mode</div>
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "sandbox" ? "accent" : "outline"} onClick={() => setMode("sandbox")}>Sandbox</Button>
            <Button size="sm" variant={mode === "battle" ? "accent" : "outline"} onClick={() => setMode("battle")}>Battle</Button>
          </div>
        </div>
        {mode === "battle" && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide opacity-70">Vote On A Shape</div>
            <div className="grid grid-cols-2 gap-2">
              {(["circle","square","triangle","star"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={pick === s ? "accent" : "outline"}
                  onClick={() => {
                    setPick(s);
                    window.dispatchEvent(new CustomEvent("art:setPick", { detail: { kind: s } }));
                  }}
                  title={s}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    {s === "circle" && (<circle cx="12" cy="12" r="8" fill="#9b87f5" />)}
                    {s === "square" && (<rect x="6" y="6" width="12" height="12" rx="2" fill="#60a5fa" />)}
                    {s === "triangle" && (<path d="M12 5 L19 19 L5 19 Z" fill="#34d399" />)}
                    {s === "star" && (<path d="M12 4 L14.9 9.5 L21 10.5 L16.5 14.6 L17.8 20.7 L12 17.8 L6.2 20.7 L7.5 14.6 L3 10.5 L9.1 9.5 Z" fill="#f59e0b" />)}
                  </svg>
                </Button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide opacity-70">Mouse Influence</div>
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.05}
            value={scale}
            onChange={(e) => onScale(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="mt-1 text-xs opacity-70">Scale: {scale.toFixed(2)}</div>
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide opacity-70">Asteroid Volume</div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={asteroids}
            onChange={(e) => onAsteroids(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="mt-1 text-xs opacity-70">Scale: {asteroids.toFixed(2)}</div>
        </div>
        <div className="flex items-center gap-2">
          <input id="astMouseBattle" type="checkbox" checked={asteroidMouseBattle} onChange={(e) => onAsteroidMouseBattle(e.target.checked)} />
          <label htmlFor="astMouseBattle" className="text-sm">Mouse affects asteroids in battle</label>
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide opacity-70">FPS Limit</div>
          <input
            type="range"
            min={15}
            max={60}
            step={15}
            value={fpsCap}
            onChange={(e) => onFpsCap(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="mt-1 text-xs opacity-70">FPS: {fpsCap}</div>
        </div>
        {counts && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide opacity-70">Winners</div>
            <div className="space-y-2">
              {shapes.map(({ k, color, label }) => {
                const v = counts?.[k] ?? 0;
                const max = Math.max(...shapes.map(s => counts?.[s.k] ?? 0), 1);
                const pct = Math.round((v / max) * 100);
                return (
                  <div key={k} className="flex items-center gap-2">
                    <div className="w-16 text-xs opacity-70">{label}</div>
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
        {mode === "battle" && (
          <div className="pt-2 flex justify-center">
            <Button size="sm" variant="accent" disabled={!pick} onClick={() => window.dispatchEvent(new CustomEvent("art:startBattle"))}>
              Start Battle
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
