// src/app/art/utils/blackHole.ts
export function drawBlackHole(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ratio: number,
  opts: { swirl?: boolean; spin?: number; horizonAlpha?: number } = {}
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(0,0,0,0.95)");
  g.addColorStop(0.6, "rgba(20,20,22,0.6)");
  g.addColorStop(1, "rgba(20,20,22,0.0)");
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (opts.swirl) {
    const arms = 6;
    ctx.lineWidth = Math.max(1, r * 0.015);
    for (let i = 0; i < arms; i++) {
      const rot = (i / arms) * Math.PI * 2 + (opts.spin ?? ratio * 4.0);
      ctx.beginPath();
      for (let t = 0; t <= 1.0; t += 0.08) {
        const cr = r * (0.2 + 0.8 * t);
        const ang = rot + t * 2.6;
        const x = cx + Math.cos(ang) * cr;
        const y = cy + Math.sin(ang) * cr;
        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(180,180,190,${0.06 + 0.06 * Math.sin(i + (opts.spin ?? ratio) * 5)})`;
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const rr = r * (1.05 + i * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    const alpha = 0.08 - i * 0.02;
    ctx.strokeStyle = `rgba(${180 - i * 20}, ${170 - i * 24}, 255, ${alpha})`;
    ctx.lineWidth = Math.max(1, r * 0.01);
    ctx.stroke();
  }
    // event horizon ring
  if (opts.horizonAlpha && opts.horizonAlpha > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${opts.horizonAlpha})`;
    ctx.lineWidth = Math.max(1.5, r * 0.015);
    ctx.stroke();
  }
  ctx.restore();
}
