// tests/e2e/first-issue/prepare-draft.mjs
//
// Gate B / S06: prepares ONE real public source and a draft issue for Steven to
// edit and approve.
//
// The draft scaffold this creates is AGENT-PREPARED, not Steven's writing, and is
// recorded with `origin: "model"` (the closest available value to "not written by
// the editor by hand") so it can never be mistaken for his edit. His edit creates
// a subsequent revision through the editor, which is recorded `origin: "human"`.
// The check mode in check-human.mjs distinguishes them.
//
// The only network read here is ONE bounded arXiv API query (the documented
// source), and it is labelled a plumbing fixture: it is not evidence that Steven
// chose or endorsed the paper.
//
// Usage:
//   node prepare-draft.mjs --db=<path> --report
//   node prepare-draft.mjs --db=<path> --prepare      (fetch + capture + draft)

import { createModuleLoader } from "../../editor/_module-loader.mjs";

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const DB_PATH = args.get("db");
const MODE = args.get("report") === "true" ? "report" : "prepare";
const SLUG = args.get("slug") ?? "first-source-plumbing-issue";

if (!DB_PATH) {
  console.error("--db=<path> is required");
  process.exit(2);
}

const loader = createModuleLoader({
  env: {
    EDITOR_DB_PATH: DB_PATH,
    EDITOR_MIGRATIONS_DIR: new URL("../../../db/migrations", import.meta.url).pathname,
    EDITOR_HUMAN_SUBJECT_ID: "steven",
  },
});

const store = loader.load("src/editor/repository/store.ts");
const sources = loader.load("src/editor/repository/sources.ts");
const revisions = loader.load("src/editor/repository/revisions.ts");
const approvals = loader.load("src/editor/repository/approvals.ts");
const { createIssue } = loader.load("src/editor/revision/service.ts");
const { fetchArxivLatestCsAI, captureManualSource } = loader.load(
  "src/editor/adapters/manual-source.ts",
);

async function report(handle) {
  const items = (await revisions.listItems(handle.db, "issue"));
  const out = {
    issues: items.map(async (item) => {
      const revs = (await revisions.listRevisions(handle.db, item.id));
      const live = item.currentRevisionId
        ? (await approvals.listApprovalsForRevision(handle.db, item.currentRevisionId))
        : [];
      return {
        id: item.id,
        slug: item.slug,
        visibility: item.visibility,
        published: item.publishedRevisionId !== null,
        revisions: revs.map((r) => ({
          number: r.revisionNumber,
          origin: r.origin,
          hash: r.contentSha256.slice(0, 16),
          blocks: r.blocks.length,
          locked: r.blocks.filter((b) => b.humanLocked).length,
        })),
        liveApprovals: live.filter((a) => a.state === "approved").length,
      };
    }),
    sources: (await sources.listSources(handle.db)).map((s) => ({
      id: s.id,
      provider: s.provider,
      upstreamId: s.upstreamId,
      accessLevel: s.accessLevel,
      title: s.title,
      url: s.canonicalUrl,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
}

const handle = store.openEditorStore({ dbPath: DB_PATH });

/**
 * The packet's source register (PRIMARY_SOURCES.md) supplies real public sources
 * with URLs and access labels. Used as the fallback when the live read is
 * unavailable: the provenance below states plainly that THIS run did not retrieve
 * it, so it cannot be mistaken for a completed read.
 */
const SUPPLIED_SOURCE = {
  provider: "arxiv-docs",
  kind: "documentation",
  upstreamId: null,
  canonicalUrl: "https://info.arxiv.org/help/api/user-manual.html",
  title: "arXiv API User Manual (supplied by the packet source register, W14)",
  authors: null,
  publishedAt: null,
  updatedAt: null,
  accessLevel: "metadata_only",
  note:
    "Supplied by packet PRIMARY_SOURCES.md entry W14 (retrieved 2026-09-14 by that review). " +
    "NOT retrieved during this Gate B run: the live arXiv API query returned HTTP 429, " +
    "so only the source identity supplied by the register is recorded.",
};

async function obtainSource() {
  // One bounded live read, one delayed retry (the packet's bounded-retry policy
  // for transient reads), then the supplied-artifact fallback.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const fetched = await fetchArxivLatestCsAI();
      console.log(`fetched one public source (attempt ${attempt}): ${fetched.provider}:${fetched.upstreamId} — ${fetched.title}`);
      return { input: fetched, path: `live-arxiv-attempt-${attempt}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`live arxiv read attempt ${attempt} failed: ${message}`);
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  console.log("using the supplied-artifact fallback (source retrieval parked, recorded honestly)");
  return { input: SUPPLIED_SOURCE, path: "supplied-register-artifact" };
}

try {
  if (MODE === "report") {
    report(handle);
  } else {
    const existing = revisions.getItemBySlug(handle.db, "issue", SLUG);
    if (existing) {
      console.log(`draft already prepared for slug ${SLUG}; reporting state instead`);
      report(handle);
    } else {
      const { input: sourceInput, path: sourcePath } = await obtainSource();

      const captured = captureManualSource(handle, { ...sourceInput, origin: "fixture" });
      console.log(`captured source ${captured.sourceId} (access level ${captured.accessLevel}, path ${sourcePath})`);

      // Pin the captured version on the revision. Without this the revision
      // carries no structured source reference and the public page cannot show
      // reader-visible provenance (R10).
      const pinnedVersions = sources
        .listSourceVersions(handle.db, captured.sourceId)
        .map((version) => version.id);
      console.log(`pinning source version(s) on the revision: ${pinnedVersions.join(", ") || "(none)"}`);
      if (pinnedVersions.length === 0) {
        throw new Error("the capture recorded no source version to pin; refusing to draft an unsourced issue");
      }

      const shortTitle = String(sourceInput.title).replace(/\s+/g, " ").slice(0, 90);
      const result = createIssue(handle, {
        slug: SLUG,
        title: `First source: ${shortTitle}`,
        summary: `${captured.provider}${captured.upstreamId ? `:${captured.upstreamId}` : ""} — agent-prepared scaffolding, awaiting Steven's edit.`,
        byline: "Scaffold prepared by Hermes",
        sourceVersionIds: pinnedVersions,
        createdBy: "hermes-scaffold",
        // NOT Steven's writing: labelled so it cannot be mistaken for his edit.
        origin: "model",
        blocks: [
          {
            id: "blk_pinned_source",
            section: "source",
            heading: "Pinned source (locked)",
            markdown:
              `Source: ${sourceInput.title}\n\n` +
              `Provider: ${captured.provider}${captured.upstreamId ? ` / ${captured.upstreamId}` : ""}\n` +
              `Canonical URL: ${captured.canonicalUrl}\n` +
              `Access level: ${captured.accessLevel} — full text was NOT read\n` +
              `Provenance path: ${sourcePath}\n` +
              `Prepared: ${new Date().toISOString()}\n\n` +
              `${sourceInput.note ?? ""}\n\n` +
              `This block is LOCKED. It records provenance and cannot be rewritten by a later pass.`,
            humanLocked: true,
            origin: "model",
          },
          {
            id: "blk_digest_draft",
            section: "digest",
            heading: "Digest — replace this placeholder",
            markdown:
              "PLACEHOLDER: agent-prepared scaffold, not Steven's writing.\n\n" +
              "Write your own digest of the source here. Your text becomes a new revision " +
              "recorded with origin=human, which invalidates any earlier approval.",
            humanLocked: false,
            origin: "model",
          },
        ],
      });

      console.log(`created draft issue ${result.item.id} (slug ${result.item.slug})`);
      console.log(`revision ${result.revision.revisionNumber} hash ${result.revision.contentSha256}`);
      console.log(`revision origin: ${result.revision.origin} (agent scaffold, not human)`);
      report(handle);
    }
  }
} finally {
  handle.close();
}
