// src/components/hero/HeroRipple.tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* =========================
   TWEAKABLE CONFIG
   ========================= */
const CFG = {
  // Baseline minimum height; container can grow beyond this
  HEIGHT_PX: 420,

  // Vertical background gradient (top→bottom)
  BG_STOPS: [
    { at: 0.0, color: "#0c0b1a" },
    { at: 0.35, color: "#1d1740" },
    { at: 0.70, color: "#2e1e63" },
    { at: 1.0, color: "#08121b" },
  ],

  // Ripple look
  MAX_RIPPLES: 12,
  RIPPLE_LIFE_MS: 1400,
  RADIUS_SCALE: 0.10,
  ADDITIVE_GLOW: 0.14,
  WAVE_JITTER: 0.05,

  // Interaction cadence
  INPUT_THROTTLE_MS: 35,
  TRAIL_SAMPLING_PX: 48,

  // Linger/settle behavior
  LINGER: true,
  DECAY_ALPHA: 0.10,

  // Perf
  SCANLINE_ALPHA: 0.02,
  DPR_MAX: 2,

  // Color mode: "bg-reactive" samples BG; "fixed" uses hue shifts; "accent" uses Spotify greens
  COLOR_MODE: "accent" as "fixed" | "bg-reactive" | "accent",

  // Fixed ripple stops (used when COLOR_MODE = "fixed")
  RIPPLE_STOPS_FIXED: [
    { at: 0.00, a: 0.28, hueShift: 0 },
    { at: 0.45, a: 0.20, hueShift: 20 },
    { at: 0.80, a: 0.10, hueShift: -30 },
    { at: 1.00, a: 0.00, hueShift: 0 },
  ],

  // Accent palette (Spotify greens)
  ACCENT_COLORS: ["#1DB954", "#1ed760", "#89f0b3"],
};



// Accent green gradients for hero (dark + light variants)
const ACCENT_BG_STOPS_DARK = [
  { at: 0.0, color: "#04171a" },
  { at: 0.35, color: "#083827" },
  { at: 0.70, color: "#0b5a33" },
  { at: 1.0, color: "#072b1a" },
];

const ACCENT_BG_STOPS_LIGHT = [
  { at: 0.0, color: "#f0fff6" },
  { at: 0.35, color: "#e6fff3" },
  { at: 0.70, color: "#dcffee" },
  { at: 1.0, color: "#f7fff7" },
];

/* ===== helpers ===== */
type RGB = { r: number; g: number; b: number };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToCss({ r, g, b }: RGB, a: number) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}
function shiftHue({ r, g, b }: RGB, deg: number): RGB {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    r: r * (0.213 + cos * 0.787 - sin * 0.213) + g * (0.715 - cos * 0.715 - sin * 0.715) + b * (0.072 - cos * 0.072 + sin * 0.928),
    g: r * (0.213 - cos * 0.213 + sin * 0.143) + g * (0.715 + cos * 0.285 + sin * 0.140) + b * (0.072 - cos * 0.072 - sin * 0.283),
    b: r * (0.213 - cos * 0.213 - sin * 0.787) + g * (0.715 - cos * 0.715 + sin * 0.715) + b * (0.072 + cos * 0.928 + sin * 0.072),
  };
}
/** sample BG gradient at yNorm [0..1] */
function sampleBg(yNorm: number): RGB {
  const stops = CFG.BG_STOPS;
  if (yNorm <= stops[0].at) return hexToRgb(stops[0].color);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (yNorm >= a.at && yNorm <= b.at) {
      const t = (yNorm - a.at) / (b.at - a.at);
      return mix(hexToRgb(a.color), hexToRgb(b.color), clamp01(t));
    }
  }
  return hexToRgb(stops[stops.length - 1].color);
}
/** tint toward white, shade toward black */
const tint = (c: RGB, t: number) => mix(c, { r: 255, g: 255, b: 255 }, clamp01(t));
const shade = (c: RGB, t: number) => mix(c, { r: 0, g: 0, b: 0 }, clamp01(t));

type Props = {
  height?: number;
  className?: string;
  children?: React.ReactNode;
  contentAlign?: "start" | "center" | "end"; // vertical alignment
};
type Ripple = { x: number; y: number; t0: number };

export default function HeroRipple({ height = CFG.HEIGHT_PX, className = "", children, contentAlign = "center" }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const animRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const hadActivityRef = useRef(false);
  const [isLight, setIsLight] = useState(false);

  // size canvas to DPR
  const resize = useCallback(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dprRaw = window.devicePixelRatio || 1;
    const dpr = Number.isFinite(dprRaw) ? Math.min(Math.max(dprRaw, 1), CFG.DPR_MAX) : 1;
    const rect = wrap.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    // Use the actual container height (which may exceed the min height)
    const cssHeight = Math.max(height, Math.floor(rect.height));
    const w = Math.max(1, Math.floor(cssWidth * dpr));
    const h = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.width = w; canvas.height = h;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }, [height]);

  useEffect(() => {
    resize();
    const onResize = () => resize();
    const ro = new ResizeObserver(() => resize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [height, resize]);

  // watch <html> for theme class changes so the hero can adapt
  useEffect(() => {
    const doc = document.documentElement;
    const update = () => setIsLight(doc.classList.contains("light"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(doc, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // input → ripples
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;

    const push = (px: number, py: number) => {
      const t0 = performance.now();
      const arr = ripplesRef.current;
      if (arr.length >= CFG.MAX_RIPPLES) arr.shift();
      arr.push({ x: px, y: py, t0 });
      hadActivityRef.current = true;
    };

    const emit = (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastEmitRef.current < CFG.INPUT_THROTTLE_MS) return;
      lastEmitRef.current = now;

      const rect = wrap.getBoundingClientRect();
      const px = clientX - rect.left, py = clientY - rect.top;

      const prev = lastPosRef.current;
      if (prev) {
        const dx = px - prev.x, dy = py - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > CFG.TRAIL_SAMPLING_PX) {
          const steps = Math.min(5, Math.floor(dist / CFG.TRAIL_SAMPLING_PX));
          for (let i = 1; i <= steps; i++) push(prev.x + (dx * i) / (steps + 1), prev.y + (dy * i) / (steps + 1));
        }
      }
      push(px, py);
      lastPosRef.current = { x: px, y: py };
    };

    const onMove = (e: MouseEvent) => emit(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => { if (e.touches.length) emit(e.touches[0].clientX, e.touches[0].clientY); };
    const onLeave = () => { lastPosRef.current = null; };

    wrap.addEventListener("mousemove", onMove, { passive: true });
    wrap.addEventListener("touchmove", onTouch, { passive: true });
    wrap.addEventListener("mouseleave", onLeave, { passive: true });
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("touchmove", onTouch);
      wrap.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    const dprRaw = window.devicePixelRatio || 1;
    const dpr = Number.isFinite(dprRaw) ? Math.min(Math.max(dprRaw, 1), CFG.DPR_MAX) : 1;
    const LIFE = Math.max(16, Math.floor(CFG.RIPPLE_LIFE_MS));

    const drawBackground = () => {
      const w = canvas.width, h = canvas.height;
      // Use an accent green gradient for the hero; pick light/dark variant
      const stops = isLight ? ACCENT_BG_STOPS_LIGHT : ACCENT_BG_STOPS_DARK;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      for (const s of stops) bg.addColorStop(s.at, s.color);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (CFG.SCANLINE_ALPHA > 0) {
        ctx.globalAlpha = CFG.SCANLINE_ALPHA;
        ctx.fillStyle = "#000";
        const step = Math.max(2, Math.floor(2 * dpr));
        for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
        ctx.globalAlpha = 1;
      }
    };

    // draw once initially
    drawBackground();

    const draw = (now: number) => {
      const w = canvas.width, h = canvas.height;
      if (w === 0 || h === 0) { animRef.current = requestAnimationFrame(draw); return; }

      // settle/linger: optional slow decay toward bg
      if (CFG.DECAY_ALPHA > 0) {
        ctx.globalAlpha = CFG.DECAY_ALPHA;
        drawBackground();
        ctx.globalAlpha = 1;
      }

      // draw ripples
      const arr = ripplesRef.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const r = arr[i];
        const age = now - r.t0;
        if (age > LIFE) { arr.splice(i, 1); continue; }

        const t = clamp01(age / LIFE);
        const base = t * (2 - t);
        const wobble = 1 + Math.sin((t + i * 0.17) * Math.PI * 2) * CFG.WAVE_JITTER;
        const radius = Math.max(w, h) * CFG.RADIUS_SCALE * base * wobble;
        if (!Number.isFinite(radius) || radius <= 0) continue;

        const gx = Math.floor(r.x * dpr), gy = Math.floor(r.y * dpr);

        // choose color stops
        let stops: { at: number; color: string }[] = [];
        if (CFG.COLOR_MODE === "bg-reactive") {
          const baseRGB = sampleBg(gy / h);
          const mid = shiftHue(baseRGB, 25);
          const edge = shiftHue(baseRGB, -35);
          stops = [
            { at: 0.00, color: rgbToCss(baseRGB, 0.26) },
            { at: 0.45, color: rgbToCss(mid, 0.18) },
            { at: 0.80, color: rgbToCss(edge, 0.08) },
            { at: 1.00, color: rgbToCss(edge, 0.00) },
          ];
        } else if (CFG.COLOR_MODE === "accent") {
          // Spotify-green accent ripples, slightly tinted/tapered
          const accent = hexToRgb(CFG.ACCENT_COLORS[i % CFG.ACCENT_COLORS.length]);
          const mid = tint(accent, 0.18);
          const edge = shade(accent, 0.25);
          stops = [
            { at: 0.00, color: rgbToCss(accent, 0.24) },
            { at: 0.45, color: rgbToCss(mid, 0.16) },
            { at: 0.80, color: rgbToCss(edge, 0.06) },
            { at: 1.00, color: rgbToCss(edge, 0.00) },
          ];
        } else {
          const baseRGB = hexToRgb(CFG.BG_STOPS[0].color);
          stops = CFG.RIPPLE_STOPS_FIXED.map(s => {
            const col = shiftHue(baseRGB, s.hueShift);
            return { at: s.at, color: rgbToCss(col, s.a) };
          });
        }

        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
        for (const s of stops) grad.addColorStop(s.at, s.color);

        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = CFG.ADDITIVE_GLOW;
        ctx.fillStyle = grad as CanvasGradient;
        ctx.beginPath(); ctx.arc(gx, gy, radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }

      if (!CFG.LINGER && ripplesRef.current.length === 0 && hadActivityRef.current) {
        drawBackground();
        hadActivityRef.current = false;
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isLight]);

  return (
    <div
      ref={wrapRef}
      className={["relative w-full overflow-hidden rounded-2xl border shadow-2xl shadow-black/30 border-neutral-200 dark:border-neutral-800 touch-pan-y", className].join(" ")}
      style={{ minHeight: height }}
      aria-label="Ripple hero"
    >
      {/* top accent glow to match separators */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#1DB954] via-[#1ed760] to-[#1DB954] opacity-80" />
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
      <div
        className={[
          "relative z-10 flex h-full max-w-full flex-col items-start p-6 sm:p-8 text-neutral-900 dark:text-white text-pretty",
          contentAlign === "start" ? "justify-start" : contentAlign === "end" ? "justify-end" : "justify-center",
        ].join(" ")}
        style={{ color: 'var(--foreground)' }}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10 mix-blend-overlay"
        style={{ backgroundImage: "radial-gradient(transparent 0, rgba(0,0,0,0.18) 100%)" }}
      />
    </div>
  );
}
