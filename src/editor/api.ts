// Gate B: shared API helpers for the editor routes.
//
// Authorization comes first, unconditionally. `/api/editor/*` is NOT covered by
// the repository's root middleware matcher (which lists `/admin/:path*`,
// `/api/newsletter/:path*` and `/labs/:path*` only), so each route must check the
// session itself — before opening the store, which has side effects.

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { EditorError, isEditorError, statusForCode } from "./contracts/errors";
import { editorStorageMode } from "./storage-mode";

/** Returns a 401 response when the session is not an authorized admin. */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json(
      { error: "SESSION_REQUIRED", message: "Administrator session required" },
      { status: 401 },
    );
  }
}

export function editorErrorResponse(error: unknown): NextResponse {
  if (isEditorError(error)) {
    return NextResponse.json(
      {
        error: (error as EditorError).code,
        message: (error as EditorError).message,
        details: (error as EditorError).details,
      },
      { status: statusForCode((error as EditorError).code) },
    );
  }
  const hosted = editorStorageMode() === "postgres";
  const message = hosted
    ? "Hosted editor storage request failed"
    : error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: "INTERNAL", message }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("body must be a JSON object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new EditorError("VALIDATION_FAILED", "Request body must be a JSON object");
  }
}
