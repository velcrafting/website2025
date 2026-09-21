// Gate B / S06: publish an approved revision to the isolated test target.
//
// Authorization is rechecked inside this handler before any side effect. The
// commit is transactional; the HTTP verification happens after it and is what
// decides whether the intent is reported `verified`. A failed or ambiguous
// verification leaves the intent stored/failed — it never triggers a second
// logical publication.
//
// This route opens the store directly rather than through `withEditorStore`
// because the verification step is asynchronous and must run outside the
// synchronous transaction helper.

import { NextResponse } from "next/server";

import { denyUnlessAdmin, editorErrorResponse, readJsonBody } from "@/editor/api";
import {
  commitWebsitePublication,
  verifyWebsitePublication,
} from "@/editor/publishing/website";
import { openEditorStore } from "@/editor/repository/store";
import { currentTestTarget } from "@/editor/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    const body = await readJsonBody(request);
    const targetRef = String(body.targetRef ?? currentTestTarget());
    const shouldVerify = body.verify !== false;

    const store = (await openEditorStore());
    try {
      const commit = (await commitWebsitePublication(store, {
        itemId: String(body.itemId ?? ""),
        approvalId: String(body.approvalId ?? ""),
        revisionId: String(body.revisionId ?? ""),
        targetRef,
      }));

      const verification = shouldVerify
        ? await verifyWebsitePublication(store, {
            intentId: commit.intent.id,
            expectedRevisionSha256: commit.revisionSha256,
          })
        : null;

      return NextResponse.json(
        {
          intentId: commit.intent.id,
          outcome: commit.outcome,
          state: verification ? verification.state : commit.intent.state,
          revisionId: commit.intent.revisionId,
          revisionSha256: commit.revisionSha256,
          manifestSha256: commit.manifestSha256,
          publicUrl: commit.publicUrl,
          canonicalUrl: commit.canonicalUrl,
          verification,
        },
        { status: 201 },
      );
    } finally {
      (await store.close());
    }
  } catch (error) {
    return editorErrorResponse(error);
  }
}
