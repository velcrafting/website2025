// src/app/art/ArtClient.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";

type PublicState = {
  visits: number;
  clicks: number;
  hourHistogram: number[];
  dowHistogram: number[];
  year: number;
};

type ShapeKind = "circle" | "square" | "triangle" | "star";
type Body = {
  id: number; kind: ShapeKind;
  x: number; y: number; vx: number; vy: number; r: number;
  solid: boolean; hue: number;
};

const SHAPES: ShapeKind[] = ["circle", "square", "triangle", "star"];
const TICK_MS = 1000 / 60;
const MIN_SHAPES = 3;
const MAX_SHAPES = 220;
const MOUSE_RADIUS = 120;
const ORBIT_STRENGTH = 0.28;
const REPEL_STRENGTH = 0.28;
const WALL_DAMPING = 0.96;
const COLLISION_RESTITUTION = 0.9;

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h} ${s}% ${l}% / ${a})`;
}
function randSeeded(seed: number) {
  let x = seed >>> 0 || 123456789;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1_000_000) / 1_000_000; };
}
function hashTuple(items: (number | string)[]) {
  const s = items.join("|"); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function spawn(count: number, seed: number, width: number, height: number, scale: number) {
  const r = randSeeded(seed); const out: Body[] = [];
  for (let i = 0; i < count; i++) {
    const kind = SHAPES[Math.floor(r() * SHAPES.length)];
    const radius = 8 + r() * 22 * scale;
    const x = r() * width, y = r() * height;
    const speed = 0.25 + r() * 0.6, ang = r() * Math.PI * 2;
    out.push({
      id: i, kind,
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: radius, solid: r() > 0.45, hue: Math.floor(r() * 360),
    });
  }
  return out;
}
function drawBody(ctx: CanvasRenderingContext2D, b: Body) {
  ctx.save(); ctx.translate(b.x, b.y);
  const fill = b.solid
    ? hsl(b.hue, 70, 60, 0.9)
    : (() => { const g = ctx.createRadialGradient(0, 0, b.r * 0.1, 0, 0, b.r);
               g.addColorStop(0, hsl((b.hue + 15) % 360, 90, 70, 0.95));
               g.addColorStop(1, hsl((b.hue + 300) % 360, 70, 40, 0.4)); return g; })();
  ctx.fillStyle = fill as string | CanvasGradient | CanvasPattern;
  ctx.strokeStyle = hsl((b.hue + 190) % 360, 50, 40, 0.6);
  ctx.lineWidth = Math.max(1, b.r * 0.08);

  switch (b.kind) {
    case "circle": ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case "square": ctx.beginPath(); ctx.rect(-b.r, -b.r, b.r * 2, b.r * 2); ctx.fill(); ctx.stroke(); break;
    case "triangle": {
      const r = b.r; ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6));
      ctx.lineTo(r * Math.cos(Math.PI - Math.PI / 6), r * Math.sin(Math.PI - Math.PI / 6));
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    }
    case "star": {
      const spikes = 5, outer = b.r, inner = b.r * 0.5;
      let rot = Math.PI / 2 * 3; let x = 0; let y = 0;
      ctx.beginPath(); ctx.moveTo(0, -outer);
      for (let i = 0; i < spikes; i++) {
        x = Math.cos(rot) * outer; y = Math.sin(rot) * outer; ctx.lineTo(x, y); rot += Math.PI / 5;
        x = Math.cos(rot) * inner; y = Math.sin(rot) * inner; ctx.lineTo(x, y); rot += Math.PI / 5;
      }
      ctx.lineTo(0, -outer); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    }
  }
  ctx.restore();
}
function step(bodies: Body[], w: number, h: number) {
  for (const b of bodies) {
    b.x += b.vx; b.y += b.vy;
    if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * WALL_DAMPING; }
    if (b.x + b.r > w) { b.x = w - b.r; b.vx = -b.vx * WALL_DAMPING; }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy * WALL_DAMPING; }
    if (b.y + b.r > h) { b.y = h - b.r; b.vy = -b.vy * WALL_DAMPING; }
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], c = bodies[j];
      const dx = c.x - a.x, dy = c.y - a.y; const min = a.r + c.r; const d2 = dx*dx + dy*dy;
      if (d2 < min*min) {
        const d = Math.sqrt(d2) || 0.0001, nx = dx/d, ny = dy/d, overlap = min - d;
        a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
        c.x += nx * overlap * 0.5; c.y += ny * overlap * 0.5;
        const rvx = c.vx - a.vx, rvy = c.vy - a.vy, vn = rvx*nx + rvy*ny;
        if (vn < 0) { const imp = -(1 + COLLISION_RESTITUTION) * vn * 0.5;
          a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny; }
      }
    }
  }
}

export default function ArtClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pub, setPub] = useState<PublicState | null>(null);
  const mouse = useRef({ x: 0, y: 0, active: false, orbit: true });
  const bodiesRef = useRef<Body[] | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        if (!r.ok) return;
        const s: PublicState = await r.json();
        if (!stop) setPub(s);
      } catch {}
    };
    load();
    const id = setInterval(load, 12000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const move = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      mouse.current.x = e.clientX - r.left; mouse.current.y = e.clientY - r.top; mouse.current.active = true;
    };
    const leave = () => { mouse.current.active = false; };
    c.addEventListener("mousemove", move);
    c.addEventListener("mouseleave", leave);
    return () => { c.removeEventListener("mousemove", move); c.removeEventListener("mouseleave", leave); };
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;

    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      if (dt >= TICK_MS) {
        last = now;
        const width = c.width, height = c.height;
        ctx.fillStyle = "#0b0b0c"; ctx.fillRect(0, 0, width, height);

        const total = pub?.visits ?? 0;
        const scale = total >= 1000 ? 0.7 : total >= 500 ? 0.8 : total >= 100 ? 0.9 : 1.0;
        const target = Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, Math.floor(Math.log2(total + 2) * 10)));

        if (!bodiesRef.current || bodiesRef.current.length < target) {
          const need = target - (bodiesRef.current?.length ?? 0);
          const seed = hashTuple([total, target, pub?.year ?? 2000]);
          const extra = spawn(need, seed, width, height, scale);
          bodiesRef.current = [ ...(bodiesRef.current ?? []), ...extra ];
        }
        const bodies = bodiesRef.current ?? [];

        if (mouse.current.active) {
          const mx = mouse.current.x, my = mouse.current.y;
          for (const b of bodies) {
            const dx = mx - b.x, dy = my - b.y; const d2 = dx*dx + dy*dy;
            if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
              const d = Math.sqrt(d2) || 0.0001, nx = dx/d, ny = dy/d;
              if (mouse.current.orbit) {
                b.vx += -ny * ORBIT_STRENGTH * (1 + (MOUSE_RADIUS - d) / MOUSE_RADIUS);
                b.vy +=  nx * ORBIT_STRENGTH * (1 + (MOUSE_RADIUS - d) / MOUSE_RADIUS);
              } else {
                b.vx -= nx * REPEL_STRENGTH * (1 + (MOUSE_RADIUS - d) / MOUSE_RADIUS);
                b.vy -= ny * REPEL_STRENGTH * (1 + (MOUSE_RADIUS - d) / MOUSE_RADIUS);
              }
            }
          }
        }

        // subtle grid
        ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = "#ffffff";
        const grid = 80 * scale;
        for (let x = 0; x < width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        for (let y = 0; y < height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
        ctx.restore();

        step(bodies, width, height);
        for (const b of bodies) drawBody(ctx, b);
      }
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [pub]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const resize = () => {
      const w = Math.min(960, Math.floor(window.innerWidth - 32));
      const h = Math.floor((w * 9) / 16);
      c.width = w; c.height = h;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <Card className="mt-4">
    <div>
      <canvas ref={canvasRef} className="w-full max-w-full rounded-xl border border-neutral-800 shadow" />
      <div className="mt-3 text-sm opacity-70">
        <span>Hover to influence. Toggle mode: </span>
        <button className="underline" onClick={() => { mouse.current.orbit = !mouse.current.orbit; }}>
          {`mouse ${mouse.current.orbit ? "orbit" : "repel"}`}
        </button>
      </div>
    </div>
    </Card>
  );
}
