// Gate B / S06: website publication.
//
// Two steps, deliberately separate:
//
//   commitWebsitePublication  — synchronous, transactional. Validates the
//                              approval against stored bytes, creates (or reuses)
//                              exactly one intent+outbox row under a lease, and
//                              sets the published pointer. State: `stored`.
//   verifyWebsitePublication  — asynchronous. Reads the public URL over HTTP and
//                              only then records `verified`.
//
// "Stored" is not "verified public". A database write alone never reports
// verified publication.

import { EditorError, isEditorError } from "../contracts/errors";
import type { ContentItemRecord, ContentRevisionRecord, PublicationIntentRecord, RenderBundleRecord } from "../contracts/types";
import { publicationPayloadHash } from "../render/bundle";
import { assertApprovalUsable } from "../repository/approvals";
import { getBundleForRevision } from "../repository/bundles";
import {
  findIntentByOperationKey,
  insertIntentWithOutbox,
  recordPublicationResult,
  setPublishedPointer,
  updateIntentState,
  websiteOperationKey,
} from "../repository/intents";
import { claimLease } from "../repository/outbox";
import { getItem, getItemForUpdate, getRevision } from "../repository/revisions";
import type { EditorStore } from "../repository/store";
import { withTransaction } from "../repository/store";
import { assertApprovalTarget, currentEditorEnvironment } from "../validation/target";

export type PublishCommitInput = {
  itemId: string;
  approvalId: string;
  revisionId: string;
  targetRef: string;
  operationKey?: string;
};

export type PublishCommitResult = {
  intent: PublicationIntentRecord;
  outcome: "committed" | "reused_existing_intent";
  revisionSha256: string;
  manifestSha256: string;
  publicUrl: string;
  canonicalUrl: string;
};

export function publicIssueUrl(targetRef: string, slug: string): string {
  return `${targetRef.replace(/\/+$/, "")}/issues/${slug}`;
}

function reusedPublicationResult(
  existing: PublicationIntentRecord,
  item: ContentItemRecord,
  revision: ContentRevisionRecord,
  bundle: RenderBundleRecord,
  environment: ReturnType<typeof currentEditorEnvironment>,
  targetRef: string,
  operationKey: string,
  approvalId: string,
  payloadSha256: string,
): PublishCommitResult {
  if (
    existing.operationKey !== operationKey ||
    existing.itemId !== item.id ||
    existing.revisionId !== revision.id ||
    existing.approvalId !== approvalId ||
    existing.channel !== "website" ||
    existing.environment !== environment ||
    existing.targetRef !== targetRef ||
    existing.payloadSha256 !== payloadSha256
  ) {
    throw new EditorError("DUPLICATE_OPERATION", "That operation key is already bound to another publication");
  }
  const publicUrl = publicIssueUrl(targetRef, item.slug);
  return {
    intent: existing,
    outcome: "reused_existing_intent",
    revisionSha256: revision.contentSha256,
    manifestSha256: bundle.manifestSha256,
    publicUrl,
    canonicalUrl: publicUrl,
  };
}

export async function commitWebsitePublication(
  store: EditorStore,
  input: PublishCommitInput,
): Promise<PublishCommitResult> {
  const environment = currentEditorEnvironment();
  const targetRef = assertApprovalTarget(input.targetRef, environment);
  const operationKey = input.operationKey ?? websiteOperationKey(input.itemId, input.revisionId);
  try {
    return await withTransaction(store.db, async () => {
    const item = await getItemForUpdate(store.db, input.itemId);
    if (!item) {
      throw new EditorError("NOT_FOUND", "item not found", { itemId: input.itemId });
    }
    if (item.type !== "issue") {
      throw new EditorError("VALIDATION_FAILED", "Only issue drafts can be published through the issue route");
    }
    const revision = await getRevision(store.db, input.revisionId);
    if (!revision) {
      throw new EditorError("NOT_FOUND", "revision not found", { revisionId: input.revisionId });
    }

    // Deny-first: invalidated, expired, mismatched or wrong-target approvals
    // never reach the intent.
    const approval = await assertApprovalUsable(store.db, {
      approvalId: input.approvalId,
      itemId: item.id,
      revisionId: revision.id,
      channel: "website",
      environment,
      targetRef,
    });

    const bundle = await getBundleForRevision(store.db, revision.id);
    if (!bundle) {
      throw new EditorError("APPROVAL_INVALID", "the approved revision has no bundle", {
        revisionId: revision.id,
      });
    }
    if (bundle.id !== approval.bundleId || bundle.manifestSha256 !== approval.manifestSha256) {
      throw new EditorError(
        "APPROVAL_REVISION_MISMATCH",
        "the stored bundle no longer matches the approved manifest",
        { approvalBundleId: approval.bundleId, storedBundleId: bundle.id },
      );
    }

    const publicUrl = publicIssueUrl(targetRef, item.slug);
    const payloadSha256 = publicationPayloadHash({
      manifestSha256: bundle.manifestSha256,
      revisionSha256: revision.contentSha256,
      channel: "website",
      targetRef,
      operationKey,
    });

    // A retry of the same logical publication reuses the existing intent; it
    // does not create a second one.
    const existing = await findIntentByOperationKey(store.db, operationKey);
    if (existing) {
      return reusedPublicationResult(existing, item, revision, bundle, environment, targetRef, operationKey, input.approvalId, payloadSha256);
    }

    const intent = await insertIntentWithOutbox(store.db, {
      approvalId: approval.id,
      revisionId: revision.id,
      itemId: item.id,
      channel: "website",
      environment,
      operationKey,
      payloadSha256,
      targetRef,
    });

    const claim = await claimLease(store.db, intent.id, {
      leaseToken: `publish-${intent.id}`,
      state: "committing",
    });

    await setPublishedPointer(store.db, item.id, revision.id);

    const stored = await updateIntentState(store.db, intent.id, {
      state: "stored",
      leaseToken: claim.leaseToken,
      incrementAttempt: true,
    });
    await recordPublicationResult(store.db, {
      intentId: intent.id,
      state: "stored",
      canonicalUrl: publicUrl,
      notes: "pointer committed; awaiting HTTP verification",
    });

    return {
      intent: stored,
      outcome: "committed",
      revisionSha256: revision.contentSha256,
      manifestSha256: bundle.manifestSha256,
      publicUrl,
      canonicalUrl: publicUrl,
    };
    });
  } catch (error) {
    if (!isEditorError(error) || error.code !== "DUPLICATE_OPERATION") throw error;
    const [item, revision, bundle, existing] = await Promise.all([
      getItem(store.db, input.itemId),
      getRevision(store.db, input.revisionId),
      getBundleForRevision(store.db, input.revisionId),
      findIntentByOperationKey(store.db, operationKey),
    ]);
    if (!item || !revision || !bundle || !existing) throw error;
    const payloadSha256 = publicationPayloadHash({
      manifestSha256: bundle.manifestSha256,
      revisionSha256: revision.contentSha256,
      channel: "website",
      targetRef,
      operationKey,
    });
    return reusedPublicationResult(existing, item, revision, bundle, environment, targetRef, operationKey, input.approvalId, payloadSha256);
  }
}

export type VerifyResult = {
  verified: boolean;
  state: string;
  httpStatus: number | null;
  revisionMarker: string | null;
  canonicalUrl: string | null;
  bodySha256: string | null;
  notes: string | null;
};

/**
 * Verify the published revision over unauthenticated HTTP. Runs outside any
 * transaction; the observed result is recorded in a new transaction afterwards.
 */
export async function verifyWebsitePublication(
  store: EditorStore,
  input: { intentId: string; expectedRevisionSha256: string; timeoutMs?: number },
): Promise<VerifyResult> {
  const intentRow = await store.db
    .prepare(`SELECT * FROM publication_intents WHERE id = ?`)
    .get(input.intentId) as Record<string, unknown> | undefined;
  if (!intentRow) {
    throw new EditorError("NOT_FOUND", "intent not found", { intentId: input.intentId });
  }
  const targetRef = String(intentRow.target_ref);
  const itemId = String(intentRow.item_id);
  const item = await getItem(store.db, itemId);
  if (!item) {
    throw new EditorError("NOT_FOUND", "item not found", { itemId });
  }
  const url = publicIssueUrl(targetRef, item.slug);

  let status: number | null = null;
  let body = "";
  let notes: string | null = null;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
    });
    status = response.status;
    body = await response.text();
  } catch (error) {
    notes = `request failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const { createHash } = await import("node:crypto");
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  // Attribute-order tolerant: Next may emit name/content in either order.
  const markerMatch = /<meta[^>]*name="x-content-revision"[^>]*content="([0-9a-f]{64})"/.exec(body);
  const canonicalMatch = /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(body);
  const revisionMarker = markerMatch ? markerMatch[1] : null;
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : null;

  const verified =
    status === 200 &&
    revisionMarker === input.expectedRevisionSha256 &&
    canonicalUrl !== null;

  if (!verified && notes === null) {
    notes =
      status !== 200
        ? `unexpected HTTP status ${status}`
        : revisionMarker === null
          ? "response carried no revision marker"
          : revisionMarker !== input.expectedRevisionSha256
            ? "response revision marker does not match the approved revision"
            : "response carried no canonical URL";
  }

  const state = verified ? "verified" : "failed";
  await withTransaction(store.db, async () => {
    await recordPublicationResult(store.db, {
      intentId: input.intentId,
      state,
      httpStatus: status,
      responseSha256: bodySha256,
      revisionMarker,
      canonicalUrl,
      notes,
    });
    const current = await store.db
      .prepare(`SELECT state FROM publication_intents WHERE id = ?`)
      .get(input.intentId) as { state: string } | undefined;
    // A verified result never regresses an already-verified intent.
    if (verified || current?.state !== "verified") {
      await updateIntentState(store.db, input.intentId, {
        state: state as "verified" | "failed",
        errorCode: verified ? null : "HTTP_VERIFICATION_FAILED",
        verifiedAt: verified ? new Date().toISOString() : null,
      });
    }
  });

  return {
    verified,
    state,
    httpStatus: status,
    revisionMarker,
    canonicalUrl,
    bodySha256,
    notes,
  };
}
