// Gate B / S05: save a new revision of an issue (compare-and-swap).
//
// Authorization is rechecked inside this handler before any side effect. A stale
// `expectedRevisionId` returns 409 with the submitted buffer echoed back so the
// editor can preserve it — the save itself writes nothing.

import { NextResponse } from "next/server";

import { denyUnlessAdmin, editorErrorResponse, readJsonBody } from "@/editor/api";
import { saveIssueRevision } from "@/editor/revision/service";
import { currentHumanSubject, withEditorStore } from "@/editor/service";
import type { BlockInput } from "@/editor/validation/revision";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const { id } = await context.params;
  let submitted: Record<string, unknown> = {};
  try {
    const body = (submitted = await readJsonBody(request));
    const result = (await withEditorStore(async (store) =>
      (await saveIssueRevision(store, {
        itemId: id,
        expectedRevisionId:
          body.expectedRevisionId === undefined || body.expectedRevisionId === null
            ? null
            : String(body.expectedRevisionId),
        title: String(body.title ?? ""),
        summary: body.summary === undefined ? null : String(body.summary),
        byline: body.byline === undefined ? null : String(body.byline),
        blocks: (body.blocks ?? []) as BlockInput[],
        sourceVersionIds: Array.isArray(body.sourceVersionIds)
          ? body.sourceVersionIds.map((value) => String(value))
          : undefined,
        createdBy: currentHumanSubject(),
        origin: "human",
        editorialState: body.editorialState === "in_review" ? "in_review" : "draft",
      })),
    ));
    return NextResponse.json({
      itemId: result.item.id,
      revisionId: result.revision.id,
      revisionNumber: result.revision.revisionNumber,
      revisionSha256: result.revision.contentSha256,
      manifestSha256: result.bundle.manifestSha256,
      invalidatedApprovals: result.invalidatedApprovals,
      preservedLockedBlocks: result.preservedLockedBlocks,
    });
  } catch (error) {
    const response = editorErrorResponse(error);
    if (response.status === 409) {
      // Echo the submitted buffer so the client can keep the user's work.
      return NextResponse.json(
        {
          error: "CONFLICT_STALE_REVISION",
          message: "This issue changed since you loaded it. Your text has been preserved.",
          submitted,
        },
        { status: 409 },
      );
    }
    return response;
  }
}
