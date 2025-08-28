// src/app/api/art/winner/route.ts
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/storage";

export const runtime = "edge";

const allowed = new Set(["circle", "square", "triangle", "star", "none"]);

export async function POST(req: NextRequest) {
  try {
    const { kind } = (await req.json()) as { kind?: string };
    const k = (kind ?? "none").toLowerCase();
    if (!allowed.has(k)) return NextResponse.json({ ok: false }, { status: 400 });
    await store.hincrby("art:winners", k, 1);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET() {
  const keys = ["circle", "square", "triangle", "star", "none"] as const;
  const h = (await store.hgetall?.("art:winners")) ?? {};
  const counts: Record<string, number> = {};
  let total = 0;
  for (const k of keys) {
    const v = Number(h[k] ?? 0);
    counts[k] = v;
    total += v;
  }
  return NextResponse.json({ counts, total });
}
