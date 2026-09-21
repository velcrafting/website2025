// Gate B / S04b: render-bundle records.

import type { EditorDatabase } from "./store";

import { EditorError } from "../contracts/errors";
import type { RenderBundleRecord } from "../contracts/types";
import type { BuiltBundle } from "../render/bundle";
import { ID_PREFIXES, assertInTransaction, newId, nowIso, parseJsonColumn } from "./store";

type BundleRow = {
  id: string;
  revision_id: string;
  revision_sha256: string;
  renderer_version: string;
  manifest_sha256: string;
  outputs: string;
  asset_sha256s: string;
  validation: string;
  created_at: string;
};

function mapBundle(row: BundleRow): RenderBundleRecord {
  return {
    id: String(row.id),
    revisionId: String(row.revision_id),
    revisionSha256: String(row.revision_sha256),
    rendererVersion: String(row.renderer_version),
    manifestSha256: String(row.manifest_sha256),
    outputs: parseJsonColumn<Record<string, string>>(row.outputs, {}),
    assetSha256s: parseJsonColumn<string[]>(row.asset_sha256s, []),
    validation: parseJsonColumn<Record<string, unknown>>(row.validation, {}),
    createdAt: String(row.created_at),
  };
}

/**
 * Persist a bundle. Rendering is deterministic, so an existing bundle for the
 * same revision is returned as-is after confirming the manifest matches; a
 * differing manifest for the same revision is a contradiction, not an update.
 */
export async function insertBundle(db: EditorDatabase, built: BuiltBundle): Promise<RenderBundleRecord> {
  assertInTransaction(db, "insertBundle");
  const existing = await getBundleForRevision(db, built.revisionId);
  if (existing) {
    if (existing.manifestSha256 !== built.manifestSha256) {
      throw new EditorError(
        "INTERNAL",
        "A different bundle already exists for this revision",
        { revisionId: built.revisionId },
      );
    }
    return existing;
  }

  const id = newId(ID_PREFIXES.bundle);
  const now = nowIso();
  await db.prepare(
    `INSERT INTO render_bundles (
       id, revision_id, revision_sha256, renderer_version, manifest_sha256, outputs,
       asset_sha256s, validation, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    built.revisionId,
    built.revisionSha256,
    built.rendererVersion,
    built.manifestSha256,
    JSON.stringify(built.outputs),
    JSON.stringify(built.assetSha256s),
    JSON.stringify(built.validation),
    now,
  );

  const stored = await getBundle(db, id);
  if (!stored) {
    throw new EditorError("INTERNAL", "bundle vanished immediately after insert");
  }
  return stored;
}

export async function getBundle(db: EditorDatabase, id: string): Promise<RenderBundleRecord | null> {
  const row = await db.prepare(`SELECT * FROM render_bundles WHERE id = ?`).get(id) as
    | BundleRow
    | undefined;
  return row ? mapBundle(row) : null;
}

export async function getBundleForRevision(
  db: EditorDatabase,
  revisionId: string,
): Promise<RenderBundleRecord | null> {
  const row = await db.prepare(`SELECT * FROM render_bundles WHERE revision_id = ?`).get(revisionId) as
    | BundleRow
    | undefined;
  return row ? mapBundle(row) : null;
}
