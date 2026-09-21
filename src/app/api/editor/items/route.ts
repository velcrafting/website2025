// Gate B / S05: create an issue.
//
// Authorization is rechecked inside this handler before any side effect.

import { NextResponse } from "next/server";

import { denyUnlessAdmin, editorErrorResponse, readJsonBody } from "@/editor/api";
import { createDraft } from "@/editor/revision/service";
import { currentHumanSubject, withEditorStore } from "@/editor/service";
import type { BlockInput } from "@/editor/validation/revision";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    const body = await readJsonBody(request);
    const type = body.type === undefined ? "issue" : body.type;
    if (type !== "article" && type !== "issue") {
      return NextResponse.json({ error: "type must be article or issue" }, { status: 400 });
    }
    const result = (await withEditorStore(async (store) =>
      (await createDraft(store, {
        slug: String(body.slug ?? ""),
        title: String(body.title ?? ""),
        summary: body.summary === undefined ? null : String(body.summary),
        byline: body.byline === undefined ? null : String(body.byline),
        blocks: (body.blocks ?? []) as BlockInput[],
        sourceVersionIds: Array.isArray(body.sourceVersionIds)
          ? body.sourceVersionIds.map((id) => String(id))
          : [],
        createdBy: currentHumanSubject(),
        origin: "human",
      }, type)),
    ));
    return NextResponse.json(
      {
        itemId: result.item.id,
        slug: result.item.slug,
        revisionId: result.revision.id,
        revisionSha256: result.revision.contentSha256,
        manifestSha256: result.bundle.manifestSha256,
      },
      { status: 201 },
    );
  } catch (error) {
    return editorErrorResponse(error);
  }
}
