// Gate B / S06: capture a source.
//
// Authorization is rechecked inside this handler before any side effect. This
// route has draft-only capture rights: it cannot approve and cannot publish.

import { NextResponse } from "next/server";

import { denyUnlessAdmin, editorErrorResponse, readJsonBody } from "@/editor/api";
import { captureManualSource } from "@/editor/adapters/manual-source";
import { withEditorStore } from "@/editor/service";
import type { AccessLevel } from "@/editor/contracts/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    const body = await readJsonBody(request);
    const captured = (await withEditorStore(async (store) =>
      (await captureManualSource(store, {
        canonicalUrl: String(body.canonicalUrl ?? body.url ?? ""),
        title: String(body.title ?? ""),
        provider: body.provider === undefined ? undefined : String(body.provider),
        kind: body.kind === undefined ? undefined : String(body.kind),
        upstreamId: body.upstreamId === undefined ? null : String(body.upstreamId),
        authors: Array.isArray(body.authors) ? body.authors.map((a) => String(a)) : null,
        publishedAt: body.publishedAt === undefined ? null : String(body.publishedAt),
        updatedAt: body.updatedAt === undefined ? null : String(body.updatedAt),
        accessLevel: (body.accessLevel ?? "metadata_only") as AccessLevel,
        note: body.note === undefined ? null : String(body.note),
        referringUrl: body.referringUrl === undefined ? null : String(body.referringUrl),
        origin: "human",
      })),
    ));
    return NextResponse.json(captured, { status: 201 });
  } catch (error) {
    return editorErrorResponse(error);
  }
}
