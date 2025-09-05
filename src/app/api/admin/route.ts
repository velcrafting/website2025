// src/app/api/admin/route.ts
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  return NextResponse.json({ admin: await isAdmin() });
}