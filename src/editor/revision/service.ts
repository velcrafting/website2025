// Gate B / S05: revision-safe editing.
//
// `saveIssueRevision` is the one path a save may take. It stores the new
// revision and invalidates the item's live approvals in the SAME transaction, so
// "a changed artifact invalidates approval" is a property of the write rather
// than a step someone has to remember. A stale expected revision still fails the
// compare-and-swap first, leaving nothing behind.

import { EditorError } from "../contracts/errors";
import type {
  ApprovalRecord,
  Block,
  ContentItemRecord,
  ContentRevisionRecord,
  RenderBundleRecord,
} from "../contracts/types";
import { buildBundle } from "../render/bundle";
import { getBundleForRevision, insertBundle } from "../repository/bundles";
import { invalidateApprovalsForItem, listApprovalsForRevision } from "../repository/approvals";
import {
  createItem,
  getItem,
  getRevision,
  insertRevision,
  listItems,
  listRevisions,
} from "../repository/revisions";
import type { EditorStore } from "../repository/store";
import { withTransaction } from "../repository/store";
import { normaliseBlocks, type BlockInput } from "../validation/revision";

export type CreateIssueInput = {
  slug: string;
  title: string;
  summary?: string | null;
  byline?: string | null;
  blocks: BlockInput[];
  sourceVersionIds?: string[];
  createdBy: string;
  origin?: "human" | "model" | "fixture";
};

export type IssueWriteResult = {
  item: ContentItemRecord;
  revision: ContentRevisionRecord;
  bundle: RenderBundleRecord;
};

/** Create a private article or issue draft with its first revision and bundle. */
export async function createDraft(
  store: EditorStore,
  input: CreateIssueInput,
  type: "article" | "issue" = "issue",
): Promise<IssueWriteResult> {
  if (type !== "article" && type !== "issue") {
    throw new EditorError("VALIDATION_FAILED", "content type must be article or issue");
  }
  return await withTransaction(store.db, async () => {
    const item = await createItem(store.db, {
      type,
      slug: input.slug,
      title: input.title,
      visibility: "private",
    });
    const revision = await insertRevision(store.db, {
      itemId: item.id,
      expectedRevisionId: null,
      title: input.title,
      summary: input.summary ?? null,
      byline: input.byline ?? null,
      blocks: normaliseBlocks(input.blocks),
      sourceVersionIds: input.sourceVersionIds ?? [],
      origin: input.origin ?? "human",
      createdBy: input.createdBy,
      editorialState: "draft",
    });
    const bundle = await insertBundle(store.db, buildBundle(revision));
    return { item: await getItem(store.db, item.id) ?? item, revision, bundle };
  });
}

export function createIssue(store: EditorStore, input: CreateIssueInput): Promise<IssueWriteResult> {
  return createDraft(store, input, "issue");
}

export type SaveIssueInput = {
  itemId: string;
  expectedRevisionId: string | null;
  title: string;
  summary?: string | null;
  byline?: string | null;
  blocks: BlockInput[];
  sourceVersionIds?: string[];
  createdBy: string;
  origin?: "human" | "model" | "fixture";
  editorialState?: "draft" | "in_review";
};

export type SaveIssueResult = IssueWriteResult & {
  invalidatedApprovals: number;
  /** Locked blocks from the previous revision, carried over byte-for-byte. */
  preservedLockedBlocks: number;
};

/**
 * Save a new revision.
 *
 * Block locking protects human text from an AUTOMATED pass, not from the person
 * editing it. The distinction is the save's `origin`:
 *
 *   - a human save (the editor path) may change any block's text, and the
 *     submitted lock flag is honoured, so the editor can always edit its own
 *     work;
 *   - a non-human save (`model` / `fixture`, i.e. a regeneration proposal) cannot
 *     rewrite a block that was locked in the parent revision: the stored markdown
 *     and heading are restored verbatim and counted in `preservedLockedBlocks`.
 *
 * The earlier version of this function restored locked text for every save,
 * which made a locked block permanently uneditable through the editor — a
 * silent data-loss path, since the save appeared to succeed.
 */
export async function saveIssueRevision(store: EditorStore, input: SaveIssueInput): Promise<SaveIssueResult> {
  return await withTransaction(store.db, async () => {
    const item = await getItem(store.db, input.itemId);
    if (!item) {
      throw new EditorError("NOT_FOUND", "item not found", { itemId: input.itemId });
    }
    if ((item.currentRevisionId ?? null) !== (input.expectedRevisionId ?? null)) {
      throw new EditorError(
        "CONFLICT_STALE_REVISION",
        "This issue changed since you loaded it; reload before saving",
        {
          expectedRevisionId: input.expectedRevisionId ?? null,
          currentRevisionId: item.currentRevisionId,
        },
      );
    }

    const previous = input.expectedRevisionId
      ? await getRevision(store.db, input.expectedRevisionId)
      : null;
    const humanSave = (input.origin ?? "human") === "human";
    const lockedById = new Map(
      (previous?.blocks ?? [])
        .filter((block) => block.humanLocked)
        .map((block) => [block.id, block] as const),
    );

    const submitted = normaliseBlocks(input.blocks);
    let preservedLockedBlocks = 0;
    const blocks: Block[] = humanSave
      ? submitted
      : submitted.map((block) => {
          const original = lockedById.get(block.id);
          if (!original) return block;
          preservedLockedBlocks += 1;
          return {
            ...block,
            markdown: original.markdown,
            heading: original.heading,
            humanLocked: true,
          };
        });

    // Fields the editor form does not carry must SURVIVE an edit instead of silently resetting.
    // A block is matched to the saved revision by its own identity, and the values come from the
    // server's stored revision — never from the request, so provenance cannot be claimed by a
    // client, only inherited by the block that already had it.
    const persistedById = new Map(
      (previous?.blocks ?? []).map((block) => [block.id, block] as const),
    );
    const blocksWithPersistedMetadata: Block[] = blocks.map((block) => {
      const existing = persistedById.get(block.id);
      if (!existing) return block;
      return {
        ...block,
        linkedArticleRevisionId: block.linkedArticleRevisionId ?? existing.linkedArticleRevisionId,
        claims: block.claims.length > 0 ? block.claims : existing.claims,
        publicPermissionRecordIds:
          block.publicPermissionRecordIds.length > 0
            ? block.publicPermissionRecordIds
            : existing.publicPermissionRecordIds,
        section: block.section !== "none" ? block.section : existing.section,
      };
    });

    const revision = await insertRevision(store.db, {
      itemId: item.id,
      expectedRevisionId: input.expectedRevisionId,
      title: input.title,
      summary: input.summary ?? null,
      byline: input.byline ?? null,
      blocks: blocksWithPersistedMetadata,
      sourceVersionIds: input.sourceVersionIds ?? previous?.sourceVersionIds ?? [],
      origin: input.origin ?? "human",
      createdBy: input.createdBy,
      editorialState: input.editorialState ?? "draft",
    });

    const invalidatedApprovals = await invalidateApprovalsForItem(
      store.db,
      item.id,
      "revision-created",
    );
    const bundle = await insertBundle(store.db, buildBundle(revision));

    return {
      item: await getItem(store.db, item.id) ?? item,
      revision,
      bundle,
      invalidatedApprovals,
      preservedLockedBlocks,
    };
  });
}

export type IssueEditorView = {
  item: ContentItemRecord;
  currentRevision: ContentRevisionRecord | null;
  revisions: ContentRevisionRecord[];
  bundle: RenderBundleRecord | null;
  approvals: ApprovalRecord[];
  liveApproval: ApprovalRecord | null;
};

export async function getIssueEditorView(store: EditorStore, itemId: string): Promise<IssueEditorView | null> {
  const item = await getItem(store.db, itemId);
  if (!item) return null;
  const currentRevision = item.currentRevisionId
    ? await getRevision(store.db, item.currentRevisionId)
    : null;
  const bundle = currentRevision ? await getBundleForRevision(store.db, currentRevision.id) : null;
  const approvals = currentRevision ? await listApprovalsForRevision(store.db, currentRevision.id) : [];

  return {
    item,
    currentRevision,
    revisions: await listRevisions(store.db, item.id),
    bundle,
    approvals,
    liveApproval: approvals.find((approval) => approval.state === "approved") ?? null,
  };
}

export async function listIssueItems(store: EditorStore): Promise<ContentItemRecord[]> {
  return await listItems(store.db, "issue");
}

export async function listDraftItems(store: EditorStore): Promise<ContentItemRecord[]> {
  const [articles, issues] = await Promise.all([
    listItems(store.db, "article"),
    listItems(store.db, "issue"),
  ]);
  return [...articles, ...issues].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
