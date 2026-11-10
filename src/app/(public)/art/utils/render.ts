// src/app/art/utils/render.ts
import type { Body } from "../utils/physics";

export function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h} ${s}% ${l}% / ${a})`;
}

export function drawBody(ctx: CanvasRenderingContext2D, b: Body) {
  ctx.save();
  ctx.translate(b.x, b.y);
  const fill = b.solid
    ? hsl(b.hue, 70, 60, 0.9)
    : (() => {
        const g = ctx.createRadialGradient(0, 0, b.r * 0.1, 0, 0, b.r);
        g.addColorStop(0, hsl((b.hue + 15) % 360, 90, 70, 0.95));
        g.addColorStop(1, hsl((b.hue + 300) % 360, 70, 40, 0.4));
        return g;
      })();
  ctx.fillStyle = fill as string | CanvasGradient | CanvasPattern;
  ctx.strokeStyle = hsl((b.hue + 190) % 360, 50, 40, 0.6);
  ctx.lineWidth = Math.max(1, b.r * 0.08);

  switch (b.kind) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "square":
      ctx.beginPath();
      ctx.rect(-b.r, -b.r, b.r * 2, b.r * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "triangle": {
      const r = b.r;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6));
      ctx.lineTo(r * Math.cos(Math.PI - Math.PI / 6), r * Math.sin(Math.PI - Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "star": {
      const spikes = 5,
        outer = b.r,
        inner = b.r * 0.5;
      let rot = (Math.PI / 2) * 3;
      let x = 0;
      let y = 0;
      ctx.beginPath();
      ctx.moveTo(0, -outer);
      for (let i = 0; i < spikes; i++) {
        x = Math.cos(rot) * outer;
        y = Math.sin(rot) * outer;
        ctx.lineTo(x, y);
        rot += Math.PI / 5;
        x = Math.cos(rot) * inner;
        y = Math.sin(rot) * inner;
        ctx.lineTo(x, y);
        rot += Math.PI / 5;
      }
      ctx.lineTo(0, -outer);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

