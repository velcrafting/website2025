// Gate B / S05: approval service.
//
// Approval is a human act on an exact artifact. The route that calls this has
// already established the admin session; this layer refuses to run without an
// identified subject and makes the current-revision check explicit, so an
// approval can never be created for a revision that is no longer the item's
// current one.

import { EditorError } from "../contracts/errors";
import type { ApprovalRecord, Environment } from "../contracts/types";
import { createApproval } from "../repository/approvals";
import { getItemForUpdate, getRevision } from "../repository/revisions";
import type { EditorStore } from "../repository/store";
import { withTransaction } from "../repository/store";
import { currentEditorEnvironment } from "../validation/target";

export type ApproveInput = {
  itemId: string;
  revisionId: string;
  revisionSha256: string;
  manifestSha256: string;
  humanSubjectId: string;
  targetRef: string;
  environment?: Environment;
  ttlMs?: number;
};

export async function approveRevision(store: EditorStore, input: ApproveInput): Promise<ApprovalRecord> {
  return await withTransaction(store.db, async () => {
    const item = await getItemForUpdate(store.db, input.itemId);
    if (!item) {
      throw new EditorError("NOT_FOUND", "item not found", { itemId: input.itemId });
    }
    const revision = await getRevision(store.db, input.revisionId);
    if (!revision) {
      throw new EditorError("NOT_FOUND", "revision not found", { revisionId: input.revisionId });
    }
    if (item.currentRevisionId !== revision.id) {
      throw new EditorError(
        "APPROVAL_REVISION_MISMATCH",
        "Only the current revision of an issue can be approved",
        { revisionId: revision.id, currentRevisionId: item.currentRevisionId },
      );
    }
    return await createApproval(store.db, {
      humanSubjectId: input.humanSubjectId,
      revisionId: revision.id,
      revisionSha256: input.revisionSha256,
      manifestSha256: input.manifestSha256,
      targetRef: input.targetRef,
      environment: input.environment ?? currentEditorEnvironment(),
      ttlMs: input.ttlMs,
    });
  });
}
