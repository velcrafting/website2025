// tests/e2e/first-issue/prepare-linked-candidate.mjs
//
// Prepares the smallest corrected SOURCE-LINKED candidate for Steven's review,
// without overwriting his approved revision.
//
// Why this exists: first-source-plumbing-issue revision 2 is human-approved and
// published-state-ready, but its source_version_ids is empty, and a revision's
// content hash covers its pinned sources — so the structured link cannot be added
// to it without invalidating the approval that binds it. The corrected path is a
// NEW item that pins the captured source from the start.
//
// Design decisions, stated so they can be reviewed:
//   - ADDITIVE ONLY. The existing item, its revisions, its approval and every
//     other row are never modified. This script refuses to run if the candidate
//     slug already exists rather than overwriting anything.
//   - AGENT-PREPARED, labelled as such. The revision is recorded origin="model"
//     and created_by="hermes-candidate". It is NOT presented as a human edit.
//   - NO RETYPING. Steven's existing digest text is carried over verbatim from his
//     own revision, quoted and attributed, so completing the source-linked path
//     needs only an approval and a publish — not repeating work already evidenced.
//
// Usage:
//   node prepare-linked-candidate.mjs --db=<path> --report
//   node prepare-linked-candidate.mjs --db=<path> --prepare

import { createModuleLoader } from "../../editor/_module-loader.mjs";

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const DB_PATH = args.get("db");
const SLUG = args.get("slug") ?? "first-source-linked-candidate";
const SOURCE_ITEM_SLUG = args.get("from") ?? "first-source-plumbing-issue";
const MODE = args.get("report") === "true" ? "report" : "prepare";
// The intended source and version must be named explicitly. Selecting sources[0]
// was not robust: with more than one captured source the helper could pin the
// wrong provenance and still report success.
const SOURCE_ID = args.get("source-id");
const VERSION_ID = args.get("version-id");

if (!DB_PATH) {
  console.error("--db=<path> is required");
  process.exit(2);
}
if (MODE !== "report" && (!SOURCE_ID || !VERSION_ID)) {
  console.error(
    "--source-id=<id> and --version-id=<id> are required when preparing. Name the intended source and version explicitly; do not rely on ordering.",
  );
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
const bundles = loader.load("src/editor/repository/bundles.ts");
const { createIssue } = loader.load("src/editor/revision/service.ts");

async function report(handle) {
  const items = (await revisions.listItems(handle.db, "issue"));
  console.log(
    JSON.stringify(
      items.map(async (item) => {
        const revs = (await revisions.listRevisions(handle.db, item.id));
        const current = item.currentRevisionId
          ? revs.find((r) => r.id === item.currentRevisionId)
          : null;
        const live = current
          ? (await approvals.listApprovalsForRevision(handle.db, current.id)).filter((a) => a.state === "approved")
          : [];
        return {
          slug: item.slug,
          visibility: item.visibility,
          published: item.publishedRevisionId !== null,
          currentRevision: current
            ? {
                number: current.revisionNumber,
                origin: current.origin,
                hash: current.contentSha256.slice(0, 16),
                pinnedSources: current.sourceVersionIds.length,
              }
            : null,
          liveApprovals: live.length,
          bundlePresent: current ? Boolean((await bundles.getBundleForRevision(handle.db, current.id))) : false,
        };
      }),
      null,
      2,
    ),
  );
}

const handle = store.openEditorStore({ dbPath: DB_PATH });

try {
  if (MODE === "report") {
    report(handle);
  } else {
    // --- guards -------------------------------------------------------------
    if (revisions.getItemBySlug(handle.db, "issue", SLUG)) {
      console.error(
        `Refusing to run: an item with slug "${SLUG}" already exists. This script never overwrites an existing item.`,
      );
      process.exit(1);
    }

    const sourceItem = revisions.getItemBySlug(handle.db, "issue", SOURCE_ITEM_SLUG);
    if (!sourceItem) {
      console.error(`Source item "${SOURCE_ITEM_SLUG}" was not found; nothing to carry over.`);
      process.exit(1);
    }
    const sourceRevisions = revisions.listRevisions(handle.db, sourceItem.id).sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    );
    const humanRevision = sourceRevisions.filter((r) => r.origin === "human").pop();
    if (!humanRevision) {
      console.error(`"${SOURCE_ITEM_SLUG}" has no human revision to carry over.`);
      process.exit(1);
    }

    // The intended source and version, resolved explicitly and validated.
    const source = sources.getSource(handle.db, SOURCE_ID);
    if (!source) {
      console.error(`Refusing to run: source ${SOURCE_ID} was not found in this database.`);
      process.exit(1);
    }
    const versions = sources.listSourceVersions(handle.db, source.id);
    const intendedVersion = versions.find((v) => v.id === VERSION_ID);
    if (!intendedVersion) {
      console.error(
        `Refusing to run: version ${VERSION_ID} does not belong to source ${SOURCE_ID} (found ${versions.length} version(s) for that source).`,
      );
      process.exit(1);
    }
    const pinnedVersions = [intendedVersion.id];

    const carriedDigest = humanRevision.blocks.find((b) => b.id === "blk_digest_draft") ?? null;
    const carriedText = carriedDigest ? carriedDigest.markdown : "(no digest block found)";

    console.log(`pinning source version(s): ${pinnedVersions.join(", ")}`);
    console.log(`carrying over text from ${SOURCE_ITEM_SLUG} revision ${humanRevision.revisionNumber} (${humanRevision.id})`);

    const result = createIssue(handle, {
      slug: SLUG,
      title: "Source-linked candidate: arXiv API User Manual",
      summary:
        "Agent-prepared candidate that pins its source. Approval and publication are Steven's to give; the digest text is carried over from his own revision.",
      byline: "Agent-prepared candidate (not a human edit)",
      sourceVersionIds: pinnedVersions,
      createdBy: "hermes-candidate",
      // Recorded as agent-prepared so it can never be mistaken for Steven's edit.
      origin: "model",
      blocks: [
        {
          id: "blk_pinned_source",
          section: "source",
          heading: "Pinned source (locked)",
          markdown:
            `Source: ${source.title}\n\n` +
            `Provider: ${source.provider}${source.upstreamId ? ` / ${source.upstreamId}` : ""}\n` +
            `Canonical URL: ${source.canonicalUrl}\n` +
            `Access level: ${source.accessLevel} — full text was NOT read\n` +
            `Pinned source version: ${pinnedVersions.join(", ")}\n\n` +
            `This block is LOCKED and records structured provenance, so the public page can show a\n` +
            `machine-readable source link (not only prose in the body).`,
          humanLocked: true,
          origin: "model",
        },
        {
          id: "blk_digest_carried",
          section: "digest",
          heading: "Digest (carried over from Steven's own revision, unchanged)",
          markdown:
            `${carriedText}\n\n` +
            `— carried over verbatim from "${SOURCE_ITEM_SLUG}" revision ${humanRevision.revisionNumber}. ` +
            `Nothing here needs retyping.`,
          humanLocked: false,
          origin: "model",
        },
      ],
    });

    console.log(`created candidate ${result.item.id} (slug ${result.item.slug})`);
    console.log(`revision ${result.revision.revisionNumber} origin=${result.revision.origin}`);
    console.log(`revision hash ${result.revision.contentSha256}`);
    console.log(`pinned source versions on the revision: ${result.revision.sourceVersionIds.length}`);
    console.log(`bundle present: ${Boolean(result.bundle)}`);
    report(handle);
  }
} finally {
  handle.close();
}
