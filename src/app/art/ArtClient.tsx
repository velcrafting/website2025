// src/app/art/ArtClient.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui";
import WinnerOverlay from "./components/WinnerOverlay";
import CountdownOverlay from "./components/CountdownOverlay";
import { drawBlackHole } from "./utils/blackHole";
import { step as physicsStep, stepParticles, explode } from "./utils/physics";
import { drawBody, hsl } from "./utils/render";
import { applyMouseInfluence } from "./utils/influence";

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
  frag?: boolean; // if true, it's a fragment piece
  depth?: number; // fragmentation depth (0 original)
  m?: number; // inertia/mass factor (bigger -> higher)
};
type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; hue: number; r: number;
};
type Asteroid = { x: number; y: number; vx: number; vy: number; size: number; rot: number; spin: number; trail: Array<{x:number;y:number}> };

const SHAPES: ShapeKind[] = ["circle", "square", "triangle", "star"];
const DEFAULT_FPS = 60;
const MIN_SHAPES = 3;
const MAX_SHAPES = 220;
const MOUSE_RADIUS = 180; // influence area
const ORBIT_STRENGTH = 0.8; // gentler tangential push
const MOUSE_GRAVITY = 0.42; // toned-down cursor gravity
// physics constants moved to utils/physics


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
    // Scatter across full canvas
    const x = r() * width; const y = r() * height;
    const speed = 0.9 + r() * 1.9; const vang = r() * Math.PI * 2;
    // inertia/mass factor: larger shapes move a bit slower to forces; add slight randomness
    const inertia = (1.0 + radius / 26) * (0.85 + r() * 0.3);
    out.push({ id: i, kind, x, y, vx: Math.cos(vang) * speed, vy: Math.sin(vang) * speed, r: radius, solid: r() > 0.45, hue: Math.floor(r() * 360), m: inertia });
  }
  return out;
}

function drawParticles(ctx: CanvasRenderingContext2D, parts: Particle[]) {
  for (const p of parts) {
    const alpha = Math.max(0, Math.min(1, p.life / 900));
    const fill = hsl(p.hue, 80, 60, 0.3 + 0.7 * alpha);
    const stroke = hsl((p.hue + 180) % 360, 70, 40, 0.5 * alpha);
    ctx.beginPath();
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
    ctx.arc(p.x, p.y, Math.max(1.5, p.r * alpha), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
}

export default function ArtClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pub, setPub] = useState<PublicState | null>(null);
  const mouse = useRef({ x: 0, y: 0, active: false });
  const [mode, setMode] = useState<"sandbox" | "battle">("sandbox");
  const [pick, setPick] = useState<ShapeKind | null>(null);
  const [battlePhase, setBattlePhase] = useState<"idle" | "countdown" | "running" | "finished">("idle");
  const [winner, setWinner] = useState<ShapeKind | null>(null);
  const [lastPick, setLastPick] = useState<ShapeKind | null>(null);
  const bodiesRef = useRef<Body[] | null>(null);
  const animRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[] | null>([]);
  const sessionMaxRef = useRef<number>(0);
  const respawnAccRef = useRef<number>(0);
  const countdownStartRef = useRef<number | null>(null);
  const battleStartRef = useRef<number | null>(null);
  const postedWinnerRef = useRef<boolean>(false);
  const [countdownNow, setCountdownNow] = useState(0);
  const [leader, setLeader] = useState<Record<string, number> | null>(null);
  const swirlSignRef = useRef<number>(1);
  const shuffleSegRef = useRef<number>(-1);
  const asteroidsRef = useRef<Asteroid[] | null>(null);

  const resetAll = useCallback(() => {
    bodiesRef.current = null;
    particlesRef.current = [];
    sessionMaxRef.current = 0;
    setBattlePhase("idle");
    setWinner(null);
    setLastPick(null);
    countdownStartRef.current = null;
    battleStartRef.current = null;
    postedWinnerRef.current = false;
    asteroidsRef.current = null;
  }, [setBattlePhase, setWinner, setLastPick]);

  const switchMode = useCallback((m: "sandbox" | "battle") => {
    setMode(m);
    setPick(null);
    resetAll();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent("art:modeUpdated", { detail: { mode: m } }));
    }
  }, [resetAll]);
const [mouseScale, setMouseScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const v = Number(localStorage.getItem('art.mouseScale') ?? 1);
    return isFinite(v) && v > 0 ? v : 1;
  });
  const [asteroidScale, setAsteroidScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const v = Number(localStorage.getItem('art.asteroidScale') ?? 1);
    return isFinite(v) && v > 0 ? v : 1;
  });
  const [asteroidMouseBattle, setAsteroidMouseBattle] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = localStorage.getItem('art.asteroidMouseBattle');
    return v === '1' || v === 'true';
  });
  const [fpsCap, setFpsCap] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_FPS;
    const v = Number(localStorage.getItem('art.fpsCap') ?? DEFAULT_FPS);
    return isFinite(v) && v >= 15 ? v : DEFAULT_FPS;
  });

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
    let timer: number | null = null;
    const load = async () => {
      try {
        const r = await fetch("/api/art/winner", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        setLeader(j.counts as Record<string, number>);
      } catch {}
    };
    load();
    timer = window.setInterval(load, 20000);
    return () => { if (timer) window.clearInterval(timer); };
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
    const onSetMode = (e: Event) => {
      const ce = e as CustomEvent<{ mode: "sandbox" | "battle" }>;
      if (ce?.detail?.mode) switchMode(ce.detail.mode);
    };
    const onSetScale = (e: Event) => {
      const ce = e as CustomEvent<{ value: number }>;
      const v = ce?.detail?.value;
      if (typeof v === 'number' && isFinite(v) && v > 0) setMouseScale(v);
    };
    const onSetAsteroids = (e: Event) => {
      const ce = e as CustomEvent<{ value: number }>;
      const v = ce?.detail?.value;
      if (typeof v === 'number' && isFinite(v) && v >= 0) setAsteroidScale(v);
    };
    const onSetAsteroidsMouseBattle = (e: Event) => {
      const ce = e as CustomEvent<{ value: boolean }>;
      const v = ce?.detail?.value;
      if (typeof v === 'boolean') setAsteroidMouseBattle(v);
    };
    const onSetFpsCap = (e: Event) => {
      const ce = e as CustomEvent<{ value: number }>;
      const v = ce?.detail?.value;
      if (typeof v === 'number' && isFinite(v) && v >= 15) setFpsCap(v);
    };
    window.addEventListener('art:setMode', onSetMode as EventListener);
    window.addEventListener('art:setMouseScale', onSetScale as EventListener);
    window.addEventListener('art:setAsteroidScale', onSetAsteroids as EventListener);
    window.addEventListener('art:setAsteroidMouseBattle', onSetAsteroidsMouseBattle as EventListener);
    window.addEventListener('art:setFpsCap', onSetFpsCap as EventListener);
    return () => {
      window.removeEventListener('art:setMode', onSetMode as EventListener);
      window.removeEventListener('art:setMouseScale', onSetScale as EventListener);
      window.removeEventListener('art:setAsteroidScale', onSetAsteroids as EventListener);
      window.removeEventListener('art:setAsteroidMouseBattle', onSetAsteroidsMouseBattle as EventListener);
      window.removeEventListener('art:setFpsCap', onSetFpsCap as EventListener);
    };
  }, [switchMode]);
  useEffect(() => {
    // keyboard: toggle sandbox/battle
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "b") {
        const nm = mode === "battle" ? "sandbox" : "battle";
        switchMode(nm);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, switchMode]);

  // Rebuild asteroid set when volume changes or mode switches
  useEffect(() => {
    asteroidsRef.current = null;
  }, [asteroidScale, mode]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;

    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      const tickMs = 1000 / Math.max(15, Math.min(240, fpsCap || DEFAULT_FPS));
      if (dt >= tickMs) {
        last = now;
        const width = c.width, height = c.height;
        ctx.fillStyle = "#0b0b0c"; ctx.fillRect(0, 0, width, height);

        const total = pub?.visits ?? 0;
        const scale = total >= 1000 ? 0.7 : total >= 500 ? 0.8 : total >= 100 ? 0.9 : 1.0;
        const target = Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, Math.floor(Math.log2(total + 2) * 10)));

        if (!bodiesRef.current) bodiesRef.current = [];
        // Growth/respawn policy depends on mode
        if (mode === "battle") {
          if (target > sessionMaxRef.current && battlePhase !== "finished") {
            const need = target - bodiesRef.current.length;
            if (need > 0) {
              const seed = hashTuple([total, target, pub?.year ?? 2000]);
              const extra = spawn(need, seed, width, height, scale);
              bodiesRef.current = [ ...bodiesRef.current, ...extra ];
            }
            sessionMaxRef.current = target;
          }
        } else {
          // sandbox: gradually respawn up to target
          const diff = target - bodiesRef.current.length;
          respawnAccRef.current += dt;
          if (diff > 0 && respawnAccRef.current > 800) {
            const add = Math.min(diff, 2);
            const seed = hashTuple([total, target, pub?.year ?? 2000, bodiesRef.current.length]);
            const extra = spawn(add, seed, width, height, scale);
            bodiesRef.current = [ ...bodiesRef.current, ...extra ];
            respawnAccRef.current = 0;
          }
        }
        const bodies = bodiesRef.current ?? [];

        if (mouse.current.active && mode === "sandbox") {
          applyMouseInfluence(bodies, mouse.current.x, mouse.current.y, {
            radius: MOUSE_RADIUS,
            orbitStrength: ORBIT_STRENGTH,
            gravity: MOUSE_GRAVITY,
            scale: mouseScale,
          });
        }

        // subtle grid
        ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = "#ffffff";
        const grid = 80 * scale;
        for (let x = 0; x < width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        for (let y = 0; y < height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
        ctx.restore();

        // Space background (stars + soft nebula) in all modes
        {
          const seed = hashTuple(["stars", width, height, pub?.year ?? 0]);
          const rr = randSeeded(seed);
          const count = Math.floor(100 + Math.min(width, height) * 0.2);
          ctx.save();
          for (let i = 0; i < count; i++) {
            const sx = rr() * width, sy = rr() * height;
            const base = 0.25 + rr() * 0.55; const size = 0.6 + rr() * 1.5;
            const phase = rr() * Math.PI * 2; const speed = 0.8 + rr() * 1.6;
            const tw = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.0015 * speed + phase));
            const alpha = base * tw;
            ctx.globalAlpha = alpha; ctx.fillStyle = "#cfd8ff";
            ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
          }
          // Ambient nebula blankets (soft drifting blobs that don't affect gameplay)
          {
            const t = now * 0.00008;
            const blobs = 3;
            for (let i = 0; i < blobs; i++) {
              const px = width * (0.2 + 0.6 * ((i * 0.3 + Math.sin(t + i) * 0.5 + 0.5)));
              const py = height * (0.2 + 0.6 * ((i * 0.27 + Math.cos(t * 1.2 + i * 0.6) * 0.5 + 0.5)));
              const rad = Math.min(width, height) * (0.35 + 0.12 * i);
              const gg = ctx.createRadialGradient(px, py, 0, px, py, rad);
              const baseA = 0.04 + 0.02 * i;
              gg.addColorStop(0, `rgba(${120 + i*20}, ${150 + i*10}, 255, ${baseA * 1.2})`);
              gg.addColorStop(1, `rgba(0,0,0,0)`);
              ctx.globalAlpha = 1;
              ctx.fillStyle = gg;
              ctx.fillRect(0, 0, width, height);
            }
          }
          ctx.restore();
        }

        // Ambient asteroids in sandbox (mild center drift), drawn under shapes
        if (mode !== "battle") {
          const cx = width / 2, cy = height / 2;
          // spawn once
          if (!asteroidsRef.current) {
            const seedA = hashTuple(["asteroids:sandbox", width, height, pub?.year ?? 0]);
            const rrA = randSeeded(seedA);
            const baseCount = 6 + Math.floor((width + height) / 420);
            const countA = Math.max(0, Math.floor(baseCount * asteroidScale));
            const arr: Asteroid[] = [];
            for (let i = 0; i < countA; i++) {
              const edge = Math.floor(rrA() * 4);
              let x = 0, y = 0;
              if (edge === 0) { x = -30; y = rrA() * height; }
              else if (edge === 1) { x = rrA() * width; y = -30; }
              else if (edge === 2) { x = width + 30; y = rrA() * height; }
              else { x = rrA() * width; y = height + 30; }
              const ang = Math.atan2(cy - y, cx - x) + (rrA() - 0.5) * 0.8;
              const s = 0.6 + rrA() * 1.2;
              arr.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, size: 6 + rrA() * 10, rot: rrA() * Math.PI * 2, spin: -0.02 + rrA() * 0.04, trail: [] });
            }
            asteroidsRef.current = arr;
          }
          // update + draw
          if (asteroidsRef.current) {
            ctx.save();
            ctx.globalAlpha = 0.85;
            for (let ai = 0; ai < asteroidsRef.current.length; ai++) {
              const a = asteroidsRef.current[ai];
              const dxA = cx - a.x, dyA = cy - a.y;
              const dA = Math.hypot(dxA, dyA) || 0.0001;
              const nxA = dxA / dA, nyA = dyA / dA;
              const gA = 0.06 * (1 / Math.max(40, dA + 80));
              const segA = Math.floor(now / 8000);
              const sgnA = ((segA + ai) % 2 === 0 ? 1 : -1) * swirlSignRef.current;
              const tA = 0.22 * (1 / Math.sqrt(Math.max(60, dA + 60)));
              a.vx += nxA * gA + (-nyA) * tA * sgnA;
              a.vy += nyA * gA + ( nxA) * tA * sgnA;
              // Cursor influence in sandbox
              if (mouse.current.active) {
                const dx = mouse.current.x - a.x;
                const dy = mouse.current.y - a.y;
                const d2 = dx*dx + dy*dy;
                const R = MOUSE_RADIUS;
                if (d2 < R*R) {
                  const d = Math.sqrt(d2) || 0.0001;
                  const nx = dx / d, ny = dy / d;
                  const proximity = 1 + (R - d) / R;
                  const t = ORBIT_STRENGTH * proximity * mouseScale * 0.8; // a bit lighter than shapes
                  a.vx += -ny * t; a.vy += nx * t;
                  const mass = 0.9 + 0.2 * Math.min(1, a.size / 18);
                  const g = (MOUSE_GRAVITY * mouseScale * mass) / Math.max(60, d + 80);
                  a.vx += nx * g; a.vy += ny * g;
                }
              }
              // occasional kick
              if (Math.random() < 0.008) {
                const ka = Math.random() * Math.PI * 2;
                const ks = 0.08 + Math.random() * 0.22;
                a.vx += Math.cos(ka) * ks;
                a.vy += Math.sin(ka) * ks;
              }
              const px = a.x, py = a.y;
              a.x += a.vx; a.y += a.vy; a.rot += a.spin;
              // wrap respawn
              let wrapped = false;
              if (a.x < -40 || a.x > width + 40 || a.y < -40 || a.y > height + 40) {
                const edge = Math.floor(Math.random() * 4);
                if (edge === 0) { a.x = -30; a.y = Math.random() * height; }
                else if (edge === 1) { a.x = Math.random() * width; a.y = -30; }
                else if (edge === 2) { a.x = width + 30; a.y = Math.random() * height; }
                else { a.x = Math.random() * width; a.y = height + 30; }
                const angN = Math.atan2(cy - a.y, cx - a.x) + (Math.random() - 0.5) * 0.8;
                const sN = 0.7 + Math.random() * 1.4;
                a.vx = Math.cos(angN) * sN;
                a.vy = Math.sin(angN) * sN;
                wrapped = true;
              }
              // simple trail
              const dxTrail = a.x - px, dyTrail = a.y - py;
              if (wrapped || Math.hypot(dxTrail, dyTrail) > Math.min(width, height) * 0.4) {
                a.trail.length = 0;
              }
              a.trail.push({ x: a.x, y: a.y });
              if (a.trail.length > 10) a.trail.shift();
              if (a.trail.length > 1) {
                ctx.strokeStyle = "rgba(204,220,255,0.3)";
                ctx.lineWidth = 1.1;
                ctx.beginPath();
                for (let i = 0; i < a.trail.length; i++) {
                  const t = a.trail[i];
                  if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y);
                }
                ctx.stroke();
              }
              ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot); ctx.fillStyle = "#9aa3b2";
              ctx.beginPath(); ctx.moveTo(a.size * 0.6, 0); ctx.lineTo(-a.size * 0.3, a.size * 0.4); ctx.lineTo(-a.size * 0.5, -a.size * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
              // momentum transfer with shapes in sandbox
              const mA = 3 + a.size * 0.25;
              for (const b of bodies) {
                const dx = b.x - a.x, dy = b.y - a.y;
                const d2 = dx*dx + dy*dy;
                const min = b.r + a.size * 0.6;
                if (d2 < min*min) {
                  const d = Math.sqrt(d2) || 0.0001;
                  const nx = dx / d, ny = dy / d;
                  const mB = 1 + b.r * 0.08;
                  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
                  const vn = rvx * nx + rvy * ny;
                  if (vn < 0) {
                    const e = 1.0;
                    const j = -((1 + e) * vn) / (1 / mA + 1 / mB);
                    const impX = j * nx, impY = j * ny;
                    b.vx += impX / mB; b.vy += impY / mB;
                    a.vx -= impX / mA; a.vy -= impY / mA;
                  }
                }
              }
            }
            ctx.restore();
          }
        }

        // Battle black hole: countdown and running phases, plus resolution
        
        if (mode === "battle") {
          // (moved) Asteroids now spawn after battle actually starts, and only outside the arena
          // advance countdown -> running
          if (battlePhase === "countdown" && countdownStartRef.current != null) {
            const elapsed = now - countdownStartRef.current;
            setCountdownNow(now);
            if (elapsed >= 3000) {
              setBattlePhase("running");
              battleStartRef.current = now;
              countdownStartRef.current = null;
              postedWinnerRef.current = false;
            }
          }
          // draw black hole during countdown (appears immediately and slowly forms; no gravity)
          if (battlePhase === "countdown" && countdownStartRef.current != null) {
            const cx = width / 2, cy = height / 2;
            const elapsed = Math.max(0, now - (countdownStartRef.current ?? now));
            const cdRatio = Math.min(1, elapsed / 3000);
            const minR = Math.max(8, Math.min(width, height) * 0.02);
            const r = minR + minR * 0.8 * cdRatio; // small growth over countdown
            drawBlackHole(ctx, cx, cy, r, 0, { swirl: false, spin: 0, horizonAlpha: 0.12 });
          }
          // apply black hole while running
          if (battlePhase === "running" && battleStartRef.current != null) {
            const cx = width / 2, cy = height / 2;
            const elapsed = now - battleStartRef.current;
            const ratio = Math.max(0, Math.min(1, elapsed / 60000));
            const maxR = Math.min(width, height) * 0.42; // cap radius
            // Slightly faster than before so more are consumed by 60s
            const slow = Math.pow(ratio, 1.4);
            const holeR = Math.max(12, maxR * slow);
            // Spawn asteroids only once battle is running, from screen edges
            if (!asteroidsRef.current) {
              const seedA = hashTuple(["asteroids", width, height, pub?.year ?? 0]);
              const rrA = randSeeded(seedA);
              const baseCount = 8 + Math.floor((width + height) / 360);
              const countA = Math.max(0, Math.floor(baseCount * asteroidScale));
              const arr: Asteroid[] = [];
              for (let i = 0; i < countA; i++) {
                // pick an edge: 0=left,1=top,2=right,3=bottom
                const edge = Math.floor(rrA() * 4);
                let x = 0, y = 0;
                if (edge === 0) { x = -30; y = rrA() * height; }
                else if (edge === 1) { x = rrA() * width; y = -30; }
                else if (edge === 2) { x = width + 30; y = rrA() * height; }
                else { x = rrA() * width; y = height + 30; }
                // aim roughly toward center with noise; slightly higher speed
                const ang = Math.atan2(cy - y, cx - x) + (rrA() - 0.5) * 0.8;
                const s = 0.8 + rrA() * 1.6;
                arr.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, size: 6 + rrA() * 10, rot: rrA() * Math.PI * 2, spin: -0.02 + rrA() * 0.04, trail: [] });
              }
              asteroidsRef.current = arr;
            }
            // draw visual black hole beneath shapes
            drawBlackHole(ctx, cx, cy, holeR, ratio, { swirl: true, spin: now * 0.0025, horizonAlpha: 0.2 });
            // update + draw asteroids now (above black hole, below shapes)
            if (asteroidsRef.current) {
              ctx.save();
              ctx.globalAlpha = 0.9;
              for (let ai = 0; ai < asteroidsRef.current.length; ai++) {
                const a = asteroidsRef.current[ai];
                // gravity + swirl toward center (weaker than shapes)
                const dxA = cx - a.x, dyA = cy - a.y;
                const dA = Math.hypot(dxA, dyA) || 0.0001;
                const nxA = dxA / dA, nyA = dyA / dA;
                const gA = (0.07 + ratio * 0.12) * (1 / Math.max(40, dA + 80));
                // alternate swirl direction over time and by index to avoid traffic bias
                const segA = Math.floor((now - (battleStartRef.current ?? now)) / 8000);
                const sgnA = ((segA + ai) % 2 === 0 ? 1 : -1) * swirlSignRef.current;
                const tA = (0.25 + ratio * 0.34) * (1 / Math.sqrt(Math.max(60, dA + 60)));
                a.vx += nxA * gA + (-nyA) * tA * sgnA;
                a.vy += nyA * gA + ( nxA) * tA * sgnA;
                // optional mouse influence in battle
                if (asteroidMouseBattle && mouse.current.active) {
                  const dx = mouse.current.x - a.x;
                  const dy = mouse.current.y - a.y;
                  const d2 = dx*dx + dy*dy;
                  const R = MOUSE_RADIUS;
                  if (d2 < R*R) {
                    const d = Math.sqrt(d2) || 0.0001;
                    const nx = dx / d, ny = dy / d;
                    const proximity = 1 + (R - d) / R;
                    const t = ORBIT_STRENGTH * proximity * mouseScale * 0.7;
                    a.vx += -ny * t; a.vy += nx * t;
                    const mass = 0.9 + 0.2 * Math.min(1, a.size / 18);
                    const g = (MOUSE_GRAVITY * mouseScale * mass) / Math.max(60, d + 80);
                    a.vx += nx * g; a.vy += ny * g;
                  }
                }
                // small occasional random kick to promote cross-traffic
                if (Math.random() < 0.01) {
                  const ka = Math.random() * Math.PI * 2;
                  const ks = 0.1 + Math.random() * 0.25;
                  a.vx += Math.cos(ka) * ks;
                  a.vy += Math.sin(ka) * ks;
                }

                // integrate
                const px = a.x, py = a.y; // previous
                a.x += a.vx; a.y += a.vy; a.rot += a.spin;
                // respawn on a random edge when leaving the screen to encourage cross-traffic
                let wrapped = false;
                if (a.x < -40 || a.x > width + 40 || a.y < -40 || a.y > height + 40) {
                  const edge = Math.floor(Math.random() * 4);
                  if (edge === 0) { a.x = -30; a.y = Math.random() * height; }
                  else if (edge === 1) { a.x = Math.random() * width; a.y = -30; }
                  else if (edge === 2) { a.x = width + 30; a.y = Math.random() * height; }
                  else { a.x = Math.random() * width; a.y = height + 30; }
                  const angN = Math.atan2(cy - a.y, cx - a.x) + (Math.random() - 0.5) * 0.8;
                  const sN = 0.8 + Math.random() * 1.6;
                  a.vx = Math.cos(angN) * sN;
                  a.vy = Math.sin(angN) * sN;
                  wrapped = true;
                }

                // momentum transfer with bodies anywhere on the board
                  const mA = 3 + a.size * 0.25;
                  for (const b of bodies) {
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const d2 = dx*dx + dy*dy;
                    const min = b.r + a.size * 0.6;
                    if (d2 < min*min) {
                      const d = Math.sqrt(d2) || 0.0001;
                      const nx = dx / d, ny = dy / d;
                      const mB = 1 + b.r * 0.08;
                      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
                      const vn = rvx * nx + rvy * ny;
                      if (vn < 0) {
                        const e = 1.05; // extra bouncy asteroid hits for big spikes of movement
                        const j = -((1 + e) * vn) / (1 / mA + 1 / mB);
                        const impX = j * nx, impY = j * ny;
                        b.vx += impX / mB; b.vy += impY / mB;
                        a.vx -= impX / mA; a.vy -= impY / mA;
                        // mild separation to avoid sticking
                        const sep = (min - d) * 0.4;
                        b.x += nx * sep * (mA / (mA + mB));
                        b.y += ny * sep * (mA / (mA + mB));
                        a.x -= nx * sep * (mB / (mA + mB));
                        a.y -= ny * sep * (mB / (mA + mB));
                        // visual feedback: small spark particles on impact
                        if (particlesRef.current) {
                          const sparks = 6 + Math.floor(Math.random() * 6);
                          for (let s = 0; s < sparks; s++) {
                            const ang = Math.random() * Math.PI * 2;
                            const spd = 1.0 + Math.random() * 2.0;
                            particlesRef.current.push({
                              x: a.x + nx * (a.size * 0.3),
                              y: a.y + ny * (a.size * 0.3),
                              vx: Math.cos(ang) * spd + a.vx * 0.2,
                              vy: Math.sin(ang) * spd + a.vy * 0.2,
                              life: 420 + Math.random() * 420,
                              hue: 210 + Math.floor(Math.random() * 40) - 20,
                              r: 1.2 + Math.random() * 1.8,
                            });
                          }
                        }
                      }
                  }
                }
                // trail
                const dxTrail = a.x - px, dyTrail = a.y - py;
                if (wrapped || Math.hypot(dxTrail, dyTrail) > Math.min(width, height) * 0.4) {
                  // reset trail on wrap or teleport to avoid screen-length streaks
                  a.trail.length = 0;
                }
                a.trail.push({ x: a.x, y: a.y });
                if (a.trail.length > 12) a.trail.shift();
                // draw streak then rock
                if (a.trail.length > 1) {
                  ctx.strokeStyle = "rgba(204,220,255,0.35)";
                  ctx.lineWidth = 1.2;
                  ctx.beginPath();
                  for (let i = 0; i < a.trail.length; i++) {
                    const t = a.trail[i];
                    if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y);
                  }
                  ctx.stroke();
                }
                ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot); ctx.fillStyle = "#9aa3b2";
                ctx.beginPath(); ctx.moveTo(a.size * 0.6, 0); ctx.lineTo(-a.size * 0.3, a.size * 0.4); ctx.lineTo(-a.size * 0.5, -a.size * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
              }
              ctx.restore();
            }
            // no boundary ring — free-field battle feel
            const seg = Math.floor(elapsed / 7000);
            const segParity = (seg % 2 === 1) ? -1 : 1;
            if (shuffleSegRef.current !== seg) {
              // On segment change, ensure slight inward nudge (no outward randomness)
              shuffleSegRef.current = seg;
              const bias = 0.06 + ratio * 0.1;
              for (const bb of bodies) {
                const dxb = cx - bb.x, dyb = cy - bb.y; const db = Math.hypot(dxb, dyb) || 1;
                const nxb = dxb / db, nyb = dyb / db;
                bb.vx += nxb * bias * 0.25;
                bb.vy += nyb * bias * 0.25;
              }
            }
            for (let i = bodies.length - 1; i >= 0; i--) {
              const b = bodies[i];
              const dx = cx - b.x, dy = cy - b.y; const d = Math.hypot(dx, dy) || 0.0001;
              const nx = dx / d, ny = dy / d;
              // Funnel orbit effect: stronger inward gravity and controlled swirl
              const inertia = (b.m ?? 1);
              // Marble-in-a-funnel: increase with hole growth; use ~1/d^1.1 for strong far-field capture
              const growth = 1.2 + 2.4 * (holeR / maxR);
              const g = (0.7 + 1.8 * ratio) * growth * (1 / Math.pow(Math.max(40, d), 1.1)) / inertia;
              // tangential swirl; scaled down far away, up near center as hole grows
              const frac = holeR / maxR;
              const t = (0.85 + 1.1 * ratio) * (0.55 + 1.35 * frac) * (1 / Math.sqrt(Math.max(72, d + 72))) / inertia;
              // additional capture force to prevent drifting outward when far
              const capture = (0.12 + 0.28 * ratio) * Math.min(1, d / (Math.max(width, height) * 0.7)) / inertia;
              // apply forces (no circular boundary)
              let sgn = swirlSignRef.current;
              if (elapsed >= 30000) sgn *= -1;
              sgn *= segParity;
              // constant inward floor so nothing stalls at edges
              const gFloor = (0.04 + 0.06 * ratio) / inertia;
              b.vx += nx * (g + capture + gFloor) + (-ny) * t * sgn;
              b.vy += ny * (g + capture + gFloor) + ( nx) * t * sgn;
              // guaranteed inward spiral: add a small constant inward drift
              // stronger as battle progresses and slightly stronger when far from horizon
              const norm = Math.max(0.001, maxR - holeR * 0.85);
              const far = Math.max(0, (d - holeR * 0.85) / norm); // 0 near horizon .. ~1 far
              const spiral = (0.12 + 0.28 * ratio) * (0.6 + 0.7 * far) / inertia;
              // Push inward (toward the center). Previous sign pushed outward.
              b.vx += nx * spiral; b.vy += ny * spiral;

              // Aggressively damp outward radial velocity so bodies spiral inward instead of drifting to corners
              const vr = b.vx * nx + b.vy * ny; // radial component
              if (vr > 0) { // moving outward
                const damp = 0.6; // remove 60% of outward radial instantly
                b.vx -= nx * vr * damp; b.vy -= ny * vr * damp;
              }
              // don't consume the very last remaining body; finish first
              if (d < holeR * 0.92 && bodies.length > 1) {
                explode(particlesRef.current!, b, 12 + Math.floor(Math.random() * 10));
                bodies.splice(i, 1);
              }
            }
            if (elapsed >= 60000 || bodies.length <= 1) {
              setBattlePhase("finished");
              let win: ShapeKind | null = null;
              if (bodies.length === 1) {
                win = bodies[0]?.kind ?? null;
              } else if (elapsed >= 60000 && bodies.length > 1) {
                // tie-break: closest to center at time limit
                let bestIdx = 0;
                let bestD2 = Infinity;
                for (let i = 0; i < bodies.length; i++) {
                  const dx = bodies[i].x - cx, dy = bodies[i].y - cy;
                  const d2 = dx*dx + dy*dy;
                  if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
                }
                win = bodies[bestIdx]?.kind ?? null;
              }
              setWinner(win);
              if (!postedWinnerRef.current) {
                fetch("/api/art/winner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: win ?? "none" }) }).catch(() => {});
                postedWinnerRef.current = true;
                // optimistic UI update
                if (win) setLeader((prev) => ({ ...(prev ?? {}), [win]: ((prev?.[win] ?? 0) + 1) }));
              }
            }
          }
        }

        const newFragments: Body[] = [];
        // Freeze collisions during countdown (gentle drift only); full physics on GO
        const isBattle = mode === "battle";
        const isRunning = isBattle && battlePhase === "running";
        const isCountdown = isBattle && battlePhase === "countdown";
        if (!isBattle || isRunning || isCountdown) {
          // Shrink the effective physics arena further so bodies don't touch the visible ring
          const circle = isBattle ? { cx: width/2, cy: height/2, r: Math.min(width,height)*0.44 } : undefined;
          const battleElapsed = isBattle && battleStartRef.current != null ? (now - battleStartRef.current) : 0;
          // As time runs down, lower shatter threshold more aggressively (down to ~20% of base at 60s)
          const shatterProgress = Math.max(0, Math.min(1, battleElapsed / 60000));
          const shatterFactorRunning = isBattle && isRunning ? (1 - 0.8 * shatterProgress) : 1;
          const speedCapScale = isRunning ? (0.6 + 0.4 * Math.min(1, battleElapsed / 30000)) : (isCountdown ? 0.3 : 1);
          physicsStep(
            bodies,
            width,
            height,
            particlesRef.current!,
            newFragments,
            isRunning
              // Remove hard circle collisions during running to avoid edge bouncing; rely on soft forces below
              ? { extraDamp: 0.975, speedCapScale, collide: true, shatterFactor: shatterFactorRunning }
              : isCountdown
              ? { extraDamp: 0.995, speedCapScale: 0.3, collide: false, circle, shatterFactor: 1 }
              : { collide: true, shatterFactor: 1 }
          );
          if (!isCountdown) stepParticles(particlesRef.current!, width, height);
        }
        if (newFragments.length) bodies.push(...newFragments);
        for (const b of bodies) drawBody(ctx, b);
        drawParticles(ctx, particlesRef.current!);

        // keep mouse influence invisible per request
      }
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [pub, mode, battlePhase, mouseScale, asteroidScale, asteroidMouseBattle, fpsCap]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const resize = () => {
      const w = Math.min(960, Math.floor(window.innerWidth - 32));
      const base = (w * 9) / 16;
      const h = Math.floor(base * (4 / 6)); // reduce height by 2/6 (4 squares tall)
      c.width = w; c.height = h;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const resetBoard = () => { resetAll(); };


  const startBattle = useCallback(() => {
    resetAll();
    setBattlePhase("countdown");
    setLastPick(pick); // lock current pick for this round's result display
    swirlSignRef.current = Math.random() < 0.5 ? 1 : -1; // random swirl direction per battle
    countdownStartRef.current = performance.now();
  }, [resetAll, pick]);

  // Listen to sidebar commands: pick and start battle
  useEffect(() => {
    const onPick = (e: Event) => {
      const ce = e as CustomEvent<{ kind: ShapeKind }>;
      if (ce?.detail?.kind) setPick(ce.detail.kind);
    };
    const onStart = () => {
      startBattle();
    };
    window.addEventListener("art:setPick", onPick as EventListener);
    window.addEventListener("art:startBattle", onStart as EventListener);
    return () => {
      window.removeEventListener("art:setPick", onPick as EventListener);
      window.removeEventListener("art:startBattle", onStart as EventListener);
    };
  }, [startBattle]);


  return (
    <Card className="mt-4">
      <div className="relative">
        {/* Top controls moved to sidebar; keeping canvas area clean */}
        <div className="relative">
          <canvas ref={canvasRef} className="w-full max-w-full rounded-xl border border-neutral-800 shadow" />
          <CountdownOverlay visible={mode === "battle" && battlePhase === "countdown"} t0={countdownStartRef.current} now={countdownNow} />
          {mode === "battle" && battlePhase === "running" && (
            <div className="pointer-events-none absolute inset-0">
              {/* simple overlay hint of black hole center */}
              {/* drawing handled in canvas; this preserves z-order and ensures visibility cue */}
            </div>
          )}
        </div>
        <WinnerOverlay
          visible={mode === "battle" && battlePhase === "finished"}
          counts={leader}
          winner={winner}
          guess={lastPick}
          selection={pick}
          onPick={(s) => setPick(s)}
          onStart={() => startBattle()}
          onReset={() => resetBoard()}
        />
        <div className="mt-3 text-sm opacity-70">
          <span>Hover to influence. Shapes orbit your cursor like a gravity well.</span>
        </div>
      </div>
    </Card>
  );
}
