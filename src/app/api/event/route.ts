// src/app/api/event/route.ts
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/storage";
import { kv } from "@vercel/kv";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawler|spider|crawling/i.test(ua)) return NextResponse.json({ ok: true });

  // simple per-IP rate cap per hour
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rlKey = `rl:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const hits = await kv.incr(rlKey);
  if (hits === 1) await kv.expire(rlKey, 3600);
  if (hits > 600) return NextResponse.json({ ok: true });

  const { type } = await req.json();

  if (type === "click") await store.increment("clicks", 1);

  const now = new Date();
  await Promise.all([
    store.increment("visits", 1),
    store.hincrby("hourHistogram", String(now.getHours()), 1),
    store.hincrby("dowHistogram", String(now.getDay()), 1),
  ]);

  return NextResponse.json({ ok: true });
}
