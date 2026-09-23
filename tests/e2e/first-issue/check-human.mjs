// tests/e2e/first-issue/check-human.mjs
//
// Gate B / S06: verifies the HUMAN checkpoint. It only ever READS.
//
// It asserts the *presence* of a human edit and approval and fails while they are
// missing. It never creates a revision or an approval, so an automated run cannot
// manufacture the human evidence.
//
// Honest limitation, stated here as well as in the result: `origin: "human"` and
// `human_subject_id` are recorded CLAIMS. This script cannot and does not prove
// that a person performed the action — that rests on the observed interaction
// with the editor. It reports what the database records, no more.
//
// Usage:
//   node check-human.mjs --db=<path> [--slug=<slug>]

import { createModuleLoader } from "../../editor/_module-loader.mjs";

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const DB_PATH = args.get("db");
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
const revisions = loader.load("src/editor/repository/revisions.ts");
const approvals = loader.load("src/editor/repository/approvals.ts");

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function note(message) {
  console.log(`  note ${message}`);
}

const handle = store.openEditorStore({ dbPath: DB_PATH });
try {
  const item = revisions.getItemBySlug(handle.db, "issue", SLUG);
  check(`the issue "${SLUG}" exists`, Boolean(item));
  if (!item) {
    console.log(`\ncheck-human: ${passed}/${passed + failures.length} passed (pending)`);
    process.exitCode = 1;
  } else {
    const revs = revisions.listRevisions(handle.db, item.id).sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    );
    const humanRevs = revs.filter((r) => r.origin === "human");
    const scaffolds = revs.filter((r) => r.origin !== "human");

    check(
      "at least one revision is recorded origin=human",
      humanRevs.length >= 1,
      `found ${humanRevs.length} of ${revs.length}`,
    );
    if (scaffolds.length) {
      note(`agent-prepared scaffold revision(s) present: ${scaffolds.map((r) => r.revisionNumber).join(", ")}`);
    } else {
      note("no agent scaffold revision for this item (created entirely in the editor)");
    }

    // A real edit means the current revision's text differs from the revision it
    // was built from — compared byte-for-byte, not by a length heuristic.
    if (humanRevs.length >= 1) {
      const current = item.currentRevisionId
        ? revs.find((r) => r.id === item.currentRevisionId)
        : null;
      check("the item has a current revision", Boolean(current));
      if (current) {
        const parent = current.parentRevisionId
          ? revs.find((r) => r.id === current.parentRevisionId)
          : null;
        if (!parent) {
          note(`current revision ${current.revisionNumber} is the first revision (no parent)`);
        } else {
          const before = JSON.stringify(parent.blocks.map((b) => [b.id, b.heading, b.markdown]));
          const after = JSON.stringify(current.blocks.map((b) => [b.id, b.heading, b.markdown]));
          check(
            `current revision ${current.revisionNumber} differs from revision ${parent.revisionNumber}`,
            before !== after,
            "the block text is identical to the parent revision",
          );
        }
        check(
          "the current revision has at least one non-empty block",
          current.blocks.some((b) => b.markdown.trim().length > 0),
        );
        check(
          "the current revision is recorded origin=human",
          current.origin === "human",
          `origin=${current.origin}`,
        );

        // Informational: a pinned source block should normally be left alone.
        const pinnedNow = current.blocks.find((b) => b.id === "blk_pinned_source");
        if (pinnedNow && parent) {
          const pinnedBefore = parent.blocks.find((b) => b.id === "blk_pinned_source");
          note(
            pinnedBefore && pinnedBefore.markdown === pinnedNow.markdown
              ? "pinned source block is unchanged (provenance intact)"
              : "pinned source block was CHANGED — check that the provenance edit was intended",
          );
        }

        // The approval must bind exactly the current revision.
        const live = approvals
          .listApprovalsForRevision(handle.db, current.id)
          .filter((a) => a.state === "approved");
        check(
          "a live approval exists for the CURRENT revision",
          live.length >= 1,
          `current revision ${current.id}`,
        );
        if (live.length) {
          const approval = live[0];
          check(
            "the approval binds the current revision's exact content hash",
            approval.revisionSha256 === current.contentSha256,
            `approval ${approval.revisionSha256.slice(0, 12)} vs revision ${current.contentSha256.slice(0, 12)}`,
          );
          console.log(
            `\n  approval id:            ${approval.id}\n` +
              `  human subject recorded: ${approval.humanSubjectId} (a claim, not proof)\n` +
              `  revision sha256:        ${approval.revisionSha256}\n` +
              `  manifest sha256:        ${approval.manifestSha256}\n` +
              `  target:                 ${approval.targetRef}\n` +
              `  expires at:             ${approval.expiresAt}`,
          );
        }

        // Publication must point at the approved revision, if published at all.
        if (item.publishedRevisionId) {
          check(
            "the published pointer names the approved current revision",
            item.publishedRevisionId === current.id,
            `published ${item.publishedRevisionId} vs current ${current.id}`,
          );
        } else {
          note("not published yet");
        }
      }
    }

    console.log(
      `\n  revisions: ${revs
        .map((r) => `${r.revisionNumber}:${r.origin}`)
        .join(", ")}\n  current: ${item.currentRevisionId}\n  published: ${
        item.publishedRevisionId !== null
      }`,
    );
  }
} finally {
  handle.close();
}

console.log(`\ncheck-human (${SLUG}): ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log("\npending:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
