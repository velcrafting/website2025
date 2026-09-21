// Gate B / S04a: content items and immutable, compare-and-swap revisions.
//
// Mutating functions require an open transaction. `insertRevision` performs the
// compare-and-swap against the item's current revision: a stale expected parent
// fails with CONFLICT_STALE_REVISION and writes nothing.

import type { EditorDatabase } from "./store";

import { EditorError } from "../contracts/errors";
import type {
  Block,
  ContentItemRecord,
  ContentRevisionRecord,
  EditorialState,
  ItemType,
  Origin,
  Visibility,
} from "../contracts/types";
import { ITEM_TYPES, VISIBILITIES } from "../contracts/types";
import {
  assertEditorialState,
  assertSlug,
  assertTitle,
  normaliseBlocks,
  revisionContentHash,
} from "../validation/revision";
import { ID_PREFIXES, assertInTransaction, newId, nowIso, parseJsonColumn } from "./store";
import { PostgresEditorDatabase } from "./postgres";

type ItemRow = {
  id: string;
  type: string;
  slug: string;
  title: string;
  visibility: string;
  current_revision_id: string | null;
  published_revision_id: string | null;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  id: string;
  item_id: string;
  parent_revision_id: string | null;
  revision_number: number;
  origin: string;
  created_by: string;
  created_at: string;
  title: string;
  summary: string | null;
  byline: string | null;
  blocks: string;
  source_version_ids: string;
  asset_ids: string;
  content_sha256: string;
  editorial_state: string;
  unresolved_questions: string;
};

function mapItem(row: ItemRow): ContentItemRecord {
  return {
    id: String(row.id),
    type: String(row.type) as ItemType,
    slug: String(row.slug),
    title: String(row.title),
    visibility: String(row.visibility) as Visibility,
    currentRevisionId: row.current_revision_id === null ? null : String(row.current_revision_id),
    publishedRevisionId:
      row.published_revision_id === null ? null : String(row.published_revision_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRevision(row: RevisionRow): ContentRevisionRecord {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    parentRevisionId:
      row.parent_revision_id === null ? null : String(row.parent_revision_id),
    revisionNumber: Number(row.revision_number),
    origin: String(row.origin) as Origin,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    title: String(row.title),
    summary: row.summary === null ? null : String(row.summary),
    byline: row.byline === null ? null : String(row.byline),
    blocks: parseJsonColumn<Block[]>(row.blocks, []),
    sourceVersionIds: parseJsonColumn<string[]>(row.source_version_ids, []),
    assetIds: parseJsonColumn<string[]>(row.asset_ids, []),
    contentSha256: String(row.content_sha256),
    editorialState: String(row.editorial_state) as EditorialState,
    unresolvedQuestionIds: parseJsonColumn<string[]>(row.unresolved_questions, []),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

export type CreateItemInput = {
  type: ItemType;
  slug: string;
  title: string;
  visibility?: Visibility;
};

export async function createItem(db: EditorDatabase, input: CreateItemInput): Promise<ContentItemRecord> {
  assertInTransaction(db, "createItem");
  if (!ITEM_TYPES.includes(input.type)) {
    throw new EditorError("VALIDATION_FAILED", "unknown item type", { type: input.type });
  }
  const visibility = (input.visibility ?? "private") as Visibility;
  if (!VISIBILITIES.includes(visibility)) {
    throw new EditorError("VALIDATION_FAILED", "unknown visibility", { visibility });
  }
  const slug = assertSlug(input.slug);
  const title = assertTitle(input.title);
  const now = nowIso();
  const id = newId(ID_PREFIXES.item);
  try {
    await db.prepare(
      `INSERT INTO content_items (
         id, type, slug, title, visibility, current_revision_id, published_revision_id,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    ).run(id, input.type, slug, title, visibility, now, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EditorError("DUPLICATE_ITEM", "An item already uses that type and slug", {
        type: input.type,
        slug,
      });
    }
    throw error;
  }
  const item = await getItem(db, id);
  if (!item) {
    throw new EditorError("INTERNAL", "item vanished immediately after insert");
  }
  return item;
}

export type InsertRevisionInput = {
  itemId: string;
  /** The revision the editor believes is current. null means "no revision yet". */
  expectedRevisionId: string | null;
  title: string;
  summary?: string | null;
  byline?: string | null;
  blocks: unknown;
  sourceVersionIds?: string[];
  assetIds?: string[];
  origin?: Origin;
  createdBy: string;
  editorialState?: EditorialState;
  now?: string;
};

/**
 * Compare-and-swap revision creation.
 *
 *  - a stale `expectedRevisionId` is a conflict, never a silent overwrite;
 *  - identical content for the same item is a duplicate, not a new revision;
 *  - the item's pointer only moves inside the same transaction as the insert.
 */
export async function insertRevision(
  db: EditorDatabase,
  input: InsertRevisionInput,
): Promise<ContentRevisionRecord> {
  assertInTransaction(db, "insertRevision");

  const item = await getItemForUpdate(db, input.itemId);
  if (!item) {
    throw new EditorError("NOT_FOUND", "item not found", { itemId: input.itemId });
  }
  if ((item.currentRevisionId ?? null) !== (input.expectedRevisionId ?? null)) {
    throw new EditorError(
      "CONFLICT_STALE_REVISION",
      "This item changed since you loaded it; reload before saving",
      {
        itemId: item.id,
        expectedRevisionId: input.expectedRevisionId ?? null,
        currentRevisionId: item.currentRevisionId,
      },
    );
  }

  const blocks = normaliseBlocks(input.blocks);
  const title = assertTitle(input.title);
  const summary = input.summary === undefined || input.summary === null
    ? null
    : String(input.summary).trim() || null;
  const byline = input.byline === undefined || input.byline === null
    ? null
    : String(input.byline).trim() || null;
  const sourceVersionIds = input.sourceVersionIds ?? [];
  const assetIds = input.assetIds ?? [];
  const contentSha256 = revisionContentHash({
    title,
    summary,
    byline,
    blocks,
    sourceVersionIds,
    assetIds,
  });
  const origin = input.origin ?? "human";
  const editorialState = assertEditorialState(input.editorialState, "draft");
  const now = input.now ?? nowIso();

  const numberRow = await db
    .prepare(`SELECT MAX(revision_number) AS n FROM content_revisions WHERE item_id = ?`)
    .get(item.id) as { n: number | null } | undefined;
  const revisionNumber = Number(numberRow?.n ?? 0) + 1;

  const id = newId(ID_PREFIXES.revision);
  try {
    await db.prepare(
      `INSERT INTO content_revisions (
         id, item_id, parent_revision_id, revision_number, origin, created_by, created_at,
         title, summary, byline, blocks, source_version_ids, asset_ids, content_sha256,
         editorial_state, unresolved_questions
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
    ).run(
      id,
      item.id,
      input.expectedRevisionId ?? null,
      revisionNumber,
      origin,
      input.createdBy,
      now,
      title,
      summary,
      byline,
      JSON.stringify(blocks),
      JSON.stringify(sourceVersionIds),
      JSON.stringify(assetIds),
      contentSha256,
      editorialState,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EditorError("DUPLICATE_REVISION", "That revision content already exists", {
        itemId: item.id,
        contentSha256,
      });
    }
    throw error;
  }

  await db.prepare(
    `UPDATE content_items SET current_revision_id = ?, title = ?, updated_at = ? WHERE id = ?`,
  ).run(id, title, now, item.id);

  const revision = await getRevision(db, id);
  if (!revision) {
    throw new EditorError("INTERNAL", "revision vanished immediately after insert");
  }
  return revision;
}

export async function getItem(db: EditorDatabase, id: string): Promise<ContentItemRecord | null> {
  const row = await db.prepare(`SELECT * FROM content_items WHERE id = ?`).get(id) as
    | ItemRow
    | undefined;
  return row ? mapItem(row) : null;
}

export async function getItemForUpdate(
  db: EditorDatabase,
  id: string,
): Promise<ContentItemRecord | null> {
  if (!(db instanceof PostgresEditorDatabase)) return getItem(db, id);
  const row = await db.prepare(`SELECT * FROM content_items WHERE id = ? FOR UPDATE`).get(id) as
    | ItemRow
    | undefined;
  return row ? mapItem(row) : null;
}

export async function getItemBySlug(
  db: EditorDatabase,
  type: ItemType,
  slug: string,
): Promise<ContentItemRecord | null> {
  const row = await db
    .prepare(`SELECT * FROM content_items WHERE type = ? AND slug = ?`)
    .get(type, slug) as ItemRow | undefined;
  return row ? mapItem(row) : null;
}

export async function getRevision(db: EditorDatabase, id: string): Promise<ContentRevisionRecord | null> {
  const row = await db.prepare(`SELECT * FROM content_revisions WHERE id = ?`).get(id) as
    | RevisionRow
    | undefined;
  return row ? mapRevision(row) : null;
}

export async function listRevisions(db: EditorDatabase, itemId: string): Promise<ContentRevisionRecord[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM content_revisions WHERE item_id = ? ORDER BY revision_number DESC, id`,
    )
    .all(itemId) as unknown as RevisionRow[];
  return rows.map(mapRevision);
}

export async function listItems(db: EditorDatabase, type?: ItemType): Promise<ContentItemRecord[]> {
  const rows = (
    type
      ? await db
          .prepare(`SELECT * FROM content_items WHERE type = ? ORDER BY updated_at DESC, id`)
          .all(type)
      : await db.prepare(`SELECT * FROM content_items ORDER BY updated_at DESC, id`).all()
  ) as unknown as ItemRow[];
  return rows.map(mapItem);
}
