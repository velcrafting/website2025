// src/app/api/state/route.ts
import { NextResponse } from "next/server";
import { store } from "@/lib/storage";

export const runtime = "edge";

export async function GET() {
  const [visits, clicks] = await Promise.all([
    store.getNumber("visits"),
    store.getNumber("clicks"),
  ]);
  const hourHistogram = await store.getHistogram("hourHistogram", 24);
  const dowHistogram = await store.getHistogram("dowHistogram", 7);
  return NextResponse.json({
    visits,
    clicks,
    hourHistogram,
    dowHistogram,
    year: new Date().getFullYear(),
  });
}
