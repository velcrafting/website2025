// src/app/art/utils/physics.ts
export type ShapeKind = "circle" | "square" | "triangle" | "star";
export type Body = {
  id: number; kind: ShapeKind;
  x: number; y: number; vx: number; vy: number; r: number;
  solid: boolean; hue: number;
  frag?: boolean; depth?: number;
};

export type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; hue: number; r: number;
};

// Make collisions and walls feel bouncier/less lossy
export const COLLISION_RESTITUTION = 0.95;
export const WALL_DAMPING = 0.99;

export function explode(into: Particle[], b: Body, parts = 12) {
  for (let i = 0; i < parts; i++) {
    const ang = (i / parts) * Math.PI * 2 + Math.random() * 0.5;
    const speed = (0.8 + Math.random() * 1.6) * (0.65 + b.r / 32);
    into.push({
      x: b.x, y: b.y,
      vx: b.vx + Math.cos(ang) * speed,
      vy: b.vy + Math.sin(ang) * speed,
      life: 900 + Math.random() * 600,
      hue: (b.hue + Math.floor(Math.random() * 60) - 30 + 360) % 360,
      r: Math.max(2, b.r * 0.18 * (0.5 + Math.random()))
    });
  }
}

export function spawnFragments(from: Body, count?: number): Body[] {
  const n = count ?? (3 + Math.floor(Math.random() * 4));
  const out: Body[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.7;
    const speed = 1.0 + Math.random() * 2.0;
    const rr = Math.max(2.5, from.r * (0.28 + Math.random() * 0.22));
    out.push({
      id: (from.id << 5) + i,
      kind: from.kind,
      x: from.x + Math.cos(ang) * from.r * 0.2,
      y: from.y + Math.sin(ang) * from.r * 0.2,
      vx: from.vx + Math.cos(ang) * speed,
      vy: from.vy + Math.sin(ang) * speed,
      r: rr,
      solid: Math.random() > 0.4,
      hue: (from.hue + Math.floor(Math.random() * 80) - 40 + 360) % 360,
      frag: true,
      depth: (from.depth ?? 0) + 1,
    });
  }
  return out;
}

export function step(
  bodies: Body[],
  w: number,
  h: number,
  particles: Particle[],
  outFragments: Body[],
  opts: {
    extraDamp?: number;
    speedCapScale?: number;
    collide?: boolean;
    bodyDrag?: number;
    circle?: { cx: number; cy: number; r: number };
    ellipse?: { cx: number; cy: number; rx: number; ry: number };
    shatterFactor?: number; // 1.0 default; <1 lowers threshold over time
  } = {}
) {
  const BODY_DRAG = opts.bodyDrag ?? 0.997;
  for (const b of bodies) {
    const damp = (opts.extraDamp ?? 1) * BODY_DRAG;
    b.vx *= damp; b.vy *= damp;
    let sp = Math.hypot(b.vx, b.vy);
    if (sp < 0.4) {
      const ang = Math.random() * Math.PI * 2;
      b.vx += Math.cos(ang) * 0.2;
      b.vy += Math.sin(ang) * 0.2;
      sp = Math.hypot(b.vx, b.vy);
    }
    const maxSpBase = 24 + b.r * 0.1;
    const maxSp = maxSpBase * (opts.speedCapScale ?? 1);
    if (sp > maxSp) { const s = maxSp / sp; b.vx *= s; b.vy *= s; }

    b.x += b.vx; b.y += b.vy;
    if (opts.ellipse) {
      const { cx, cy, rx, ry } = opts.ellipse;
      const dx0 = b.x - cx, dy0 = b.y - cy;
      const f = (dx0 * dx0) / (rx * rx) + (dy0 * dy0) / (ry * ry);
      if (f > 1) {
        const scale = 1 / Math.sqrt(f);
        const nx = dx0 / (rx * rx);
        const ny = dy0 / (ry * ry);
        const nlen = Math.hypot(nx, ny) || 1;
        const ux = nx / nlen, uy = ny / nlen; // outward normal
        // clamp to boundary slightly inside and reflect
        const px = cx + dx0 * scale;
        const py = cy + dy0 * scale;
        b.x = px - ux * Math.min(4, b.r * 0.5);
        b.y = py - uy * Math.min(4, b.r * 0.5);
        const vn = b.vx * ux + b.vy * uy;
        if (vn > 0) {
          b.vx -= (1 + WALL_DAMPING) * vn * ux;
          b.vy -= (1 + WALL_DAMPING) * vn * uy;
        }
        // stronger inward bias to keep bodies off the edge
        b.vx -= ux * 0.45;
        b.vy -= uy * 0.45;
        // damp tangential component to reduce skating along boundary
        const tx = -uy, ty = ux;
        const vt = b.vx * tx + b.vy * ty;
        b.vx -= tx * vt * 0.35;
        b.vy -= ty * vt * 0.35;
      }
    } else if (opts.circle) {
      const { cx, cy, r } = opts.circle;
      const dx = b.x - cx, dy = b.y - cy;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const limit = r - b.r;
      if (dist > limit) {
        const nx = dx / dist, ny = dy / dist;
        // clamp position to circle and reflect velocity across normal
        b.x = cx + nx * limit;
        b.y = cy + ny * limit;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) {
          b.vx -= (1 + WALL_DAMPING) * vn * nx;
          b.vy -= (1 + WALL_DAMPING) * vn * ny;
        }
        // stronger inward bias to keep motion flowing back into the arena
        b.vx -= nx * 0.24;
        b.vy -= ny * 0.24;
        // damp tangential component to reduce skating along boundary
        const tx = -ny, ty = nx;
        const vt = b.vx * tx + b.vy * ty;
        b.vx -= tx * vt * 0.25;
        b.vy -= ty * vt * 0.25;
      }
    } else {
      // Rectangular bounds: reflect with damping
      if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * WALL_DAMPING; }
      if (b.x + b.r > w) { b.x = w - b.r; b.vx = -b.vx * WALL_DAMPING; }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy * WALL_DAMPING; }
      if (b.y + b.r > h) { b.y = h - b.r; b.vy = -b.vy * WALL_DAMPING; }

      // Near-edge repulsion band: gently push bodies off the walls and reduce corner trapping.
      // Acts even when not yet colliding, to avoid stable grazing along boundaries.
      const margin = Math.max(6, b.r * 0.6);
      // Distances to each wall (inside = positive, outside = negative)
      const dl = (b.x - b.r) - 0;              // left gap
      const dr = (w - (b.x + b.r));            // right gap
      const dt = (b.y - b.r) - 0;              // top gap
      const db = (h - (b.y + b.r));            // bottom gap

      // Compute proximity 0..1 inside the margin
      const nl = dl < margin ? Math.max(0, 1 - dl / margin) : 0;
      const nr = dr < margin ? Math.max(0, 1 - dr / margin) : 0;
      const nt = dt < margin ? Math.max(0, 1 - dt / margin) : 0;
      const nb = db < margin ? Math.max(0, 1 - db / margin) : 0;

      if (nl > 0) { b.vx += (0.12 + 0.18 * (opts.extraDamp ? 0.5 : 1)) * nl; b.vy *= (1 - 0.08 * nl); }
      if (nr > 0) { b.vx -= (0.12 + 0.18 * (opts.extraDamp ? 0.5 : 1)) * nr; b.vy *= (1 - 0.08 * nr); }
      if (nt > 0) { b.vy += (0.12 + 0.18 * (opts.extraDamp ? 0.5 : 1)) * nt; b.vx *= (1 - 0.08 * nt); }
      if (nb > 0) { b.vy -= (0.12 + 0.18 * (opts.extraDamp ? 0.5 : 1)) * nb; b.vx *= (1 - 0.08 * nb); }

      // Extra nudge away from corners when within the band on both axes
      const inCorner = (nl + nr > 0) && (nt + nb > 0);
      if (inCorner) {
        const cx = w * 0.5, cy = h * 0.5;
        const dx = cx - b.x, dy = cy - b.y;
        const dlen = Math.hypot(dx, dy) || 1;
        const ux = dx / dlen, uy = dy / dlen;
        const strength = 0.15 + 0.15 * (opts.extraDamp ? 0.5 : 1);
        b.vx += ux * strength;
        b.vy += uy * strength;
      }
    }
  }
  const toRemove = new Set<number>();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (opts.collide === false) continue;
      const a = bodies[i], c = bodies[j];
      const dx = c.x - a.x, dy = c.y - a.y; const min = a.r + c.r; const d2 = dx*dx + dy*dy;
      if (d2 < min*min) {
        const d = Math.sqrt(d2) || 0.0001, nx = dx/d, ny = dy/d, overlap = min - d;
        a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
        c.x += nx * overlap * 0.5; c.y += ny * overlap * 0.5;
        const rvx = c.vx - a.vx, rvy = c.vy - a.vy, vn = rvx*nx + rvy*ny;
        if (vn < 0) {
          const imp = -(1 + COLLISION_RESTITUTION) * vn * 0.5;
          a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
          const relSpeed = Math.hypot(rvx, rvy);
          const sizeFactor = Math.min(a.r, c.r) / Math.max(a.r, c.r);
          const base = 2.0 * (0.75 + sizeFactor * 0.5);
          const sf = (opts as any).shatterFactor ?? 1.0;
          const shatterThreshold = Math.max(0.6, base * sf);
          if (relSpeed > shatterThreshold) {
            const removeJ = a.r <= c.r ? i : j;
            const b = bodies[removeJ];
            if (!toRemove.has(removeJ)) {
              explode(particles, b, 10 + Math.floor(Math.random() * 8));
              if (!b.frag) outFragments.push(...spawnFragments(b));
            }
            toRemove.add(removeJ);
          }
        }
      }
    }
  }
  if (toRemove.size) {
    const kept: Body[] = [];
    for (let k = 0; k < bodies.length; k++) {
      if (!toRemove.has(k)) kept.push(bodies[k]);
    }
    bodies.length = 0; bodies.push(...kept);
  }
}

export function stepParticles(parts: Particle[], w: number, h: number) {
  const drag = 0.995;
  for (const p of parts) {
    p.life -= 16;
    p.vx *= drag; p.vy = p.vy * drag + 0.02;
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > w) p.vx *= -0.8;
    if (p.y > h) { p.y = h; p.vy *= -0.6; }
  }
  let wptr = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.life > 0) parts[wptr++] = p;
  }
  parts.length = wptr;
}
