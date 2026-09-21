// Gate B / S05: approve an exact revision artifact.
//
// Authorization is rechecked inside this handler before any side effect. The
// submitted hashes are verified against what is stored; the server never
// corrects them. A capture/scoped token cannot reach this route: it requires the
// admin session.

import { NextResponse } from "next/server";

import { denyUnlessAdmin, editorErrorResponse, readJsonBody } from "@/editor/api";
import { approveRevision } from "@/editor/approval/service";
import { currentHumanSubject, currentTestTarget, withEditorStore } from "@/editor/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    const body = await readJsonBody(request);
    const approval = (await withEditorStore(async (store) =>
      (await approveRevision(store, {
        itemId: String(body.itemId ?? ""),
        revisionId: String(body.revisionId ?? ""),
        revisionSha256: String(body.revisionSha256 ?? ""),
        manifestSha256: String(body.manifestSha256 ?? ""),
        humanSubjectId: currentHumanSubject(),
        targetRef: String(body.targetRef ?? currentTestTarget()),
      })),
    ));
    return NextResponse.json(
      {
        approvalId: approval.id,
        revisionId: approval.revisionId,
        revisionSha256: approval.revisionSha256,
        manifestSha256: approval.manifestSha256,
        environment: approval.environment,
        channels: approval.channels,
        targetRef: approval.targetRef,
        expiresAt: approval.expiresAt,
        state: approval.state,
      },
      { status: 201 },
    );
  } catch (error) {
    return editorErrorResponse(error);
  }
}
