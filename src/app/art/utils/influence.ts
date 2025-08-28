// src/app/art/utils/influence.ts
import type { Body } from "./physics";

export function applyMouseInfluence(
  bodies: Body[],
  mx: number,
  my: number,
  opts: { radius: number; orbitStrength: number; gravity: number; scale: number }
) {
  const { radius, orbitStrength, gravity, scale } = opts;
  const R2 = radius * radius;
  for (const b of bodies) {
    const dx = mx - b.x,
      dy = my - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < R2) {
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d,
        ny = dy / d;
      const proximity = 1 + (radius - d) / radius; // 1..2
      // tangential push for orbit
      const t = orbitStrength * proximity * scale;
      b.vx += -ny * t;
      b.vy += nx * t;
      // softened gravity towards cursor
      const mass = 0.7 + 0.3 * Math.min(1, b.r / 30);
      const g = (gravity * scale * mass) / Math.max(60, d + 80);
      b.vx += nx * g;
      b.vy += ny * g;
      // slight damping near core
      const SINK_R = 36;
      if (d < SINK_R) {
        b.vx *= 0.97;
        b.vy *= 0.97;
      }
    }
  }
}

