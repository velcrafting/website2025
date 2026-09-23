// tests/editor/repository/approval-intents/approval-intents.test.mjs
//
// Gate B / S04b acceptance: bundles, approvals, intents, outbox leases and the
// published projection — against a real SQLite database and the real repository
// source.
//
// Evidence class: fixture/synthetic.

import { join } from "node:path";

import {
  assert,
  assertEqual,
  assertRejects,
  createModuleLoader,
  expectCode,
  finish,
  makeTempRoot,
  suite,
  test,
} from "../../_module-loader.mjs";

const loader = createModuleLoader();
const store = loader.load("src/editor/repository/store.ts");
const sources = loader.load("src/editor/repository/sources.ts");
const revisions = loader.load("src/editor/repository/revisions.ts");
const bundles = loader.load("src/editor/repository/bundles.ts");
const approvals = loader.load("src/editor/repository/approvals.ts");
const intents = loader.load("src/editor/repository/intents.ts");
const outbox = loader.load("src/editor/repository/outbox.ts");
const publicProjection = loader.load("src/editor/repository/public.ts");
const render = loader.load("src/editor/render/bundle.ts");

const MIGRATIONS_DIR = join(loader.repo, "db", "migrations");
const TARGET = "http://127.0.0.1:3410";
const SUBJECT = "editor_fixture";

function freshStore(prefix = "gateb-b2-") {
  const root = makeTempRoot(prefix);
  const opened = store.openEditorStore({
    dbPath: join(root, "editor.db"),
    migrationsDir: MIGRATIONS_DIR,
  });
  // Hand back the raw DatabaseSync so repository functions receive the
  // connection; DatabaseSync.close() is used for cleanup.
  return opened.db;
}

/** Create item + revision + bundle, returning the pieces. */
async function seedRevision(db, slug = "plumbing-issue") {
  return (await store.withTransaction(db, async () => {
    const item = (await revisions.createItem(db, { type: "issue", slug, title: "Plumbing Issue" }));
    const revision = (await revisions.insertRevision(db, {
      itemId: item.id,
      expectedRevisionId: null,
      title: "Plumbing Issue",
      summary: "Summary.",
      byline: "Fixture",
      blocks: [{ markdown: "First paragraph.\n\nSecond paragraph.", humanLocked: true }],
      createdBy: "fixture",
      origin: "fixture",
    }));
    const built = render.buildBundle(revision);
    const bundle = (await bundles.insertBundle(db, built));
    return { item, revision, bundle, built };
  }));
}

async function approve(db, revision, bundle, overrides = {}) {
  return (await store.withTransaction(db, async () =>
    (await approvals.createApproval(db, {
      humanSubjectId: SUBJECT,
      revisionId: revision.id,
      revisionSha256: revision.contentSha256,
      manifestSha256: bundle.manifestSha256,
      targetRef: TARGET,
      ...overrides,
    })),
  ));
}

suite("S04b: deterministic render bundles");

await test("the same revision renders byte-identical output twice", async () => {
  const db = freshStore();
  try {
    const { revision, built } = (await seedRevision(db));
    const again = render.buildBundle((await revisions.getRevision(db, revision.id)));
    assertEqual(again.manifestSha256, built.manifestSha256, "manifest hash is stable");
    assertEqual(again.outputs.web_html, built.outputs.web_html, "html output is stable");
    assertEqual(again.outputs.plain_text, built.outputs.plain_text, "text output is stable");
    assert(
      built.outputs.web_html.includes("<p>First paragraph.</p>"),
      "paragraphs are rendered",
    );
    assert(
      !built.outputs.web_html.includes("<script"),
      "no markup is emitted from content",
    );
  } finally {
    db.close();
  }
});

await test("bundle content is HTML-escaped, not evaluated", async () => {
  const db = freshStore();
  try {
    const { built } = (await store.withTransaction(db, async () => {
      const item = (await revisions.createItem(db, { type: "issue", slug: "escape-issue", title: "E" }));
      const revision = (await revisions.insertRevision(db, {
        itemId: item.id,
        expectedRevisionId: null,
        title: "E",
        blocks: [{ markdown: '<script>window.__gateBPayload=1</script>' }],
        createdBy: "fixture",
        origin: "fixture",
      }));
      return { built: render.buildBundle(revision) };
    }));
    assert(
      !built.outputs.web_html.includes("<script>"),
      "the payload is not emitted as markup",
    );
    assert(
      built.outputs.web_html.includes("&lt;script&gt;"),
      "the payload is escaped into text",
    );
  } finally {
    db.close();
  }
});

await test("inserting the same revision twice is idempotent, a different manifest is refused", async () => {
  const db = freshStore();
  try {
    const { revision, bundle, built } = (await seedRevision(db));
    const again = (await store.withTransaction(db, async () => (await bundles.insertBundle(db, built))));
    assertEqual(again.id, bundle.id, "the existing bundle is reused");
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await bundles.insertBundle(db, { ...built, manifestSha256: "f".repeat(64) })),
        )),
      expectCode("INTERNAL"),
      "a conflicting manifest for one revision is refused",
    );
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM render_bundles").get()).n),
      1,
      "still one bundle",
    );
    assert((await revisions.getRevision(db, revision.id)), "revision untouched");
  } finally {
    db.close();
  }
});

suite("S04b: exact-artifact approvals");

await test("an approval records the stored hashes and starts approved", async () => {
  const db = freshStore();
  try {
    const { revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    assertEqual(approval.revisionSha256, revision.contentSha256, "revision hash bound");
    assertEqual(approval.manifestSha256, bundle.manifestSha256, "manifest hash bound");
    assertEqual(approval.state, "approved", "starts approved");
    assertEqual(approval.humanSubjectId, SUBJECT, "human subject recorded");
    assertEqual(approval.environment, "local_test", "environment recorded");
    assertEqual(approval.channels.join(","), "website", "website channel only");
  } finally {
    db.close();
  }
});

await test("a submitted hash that disagrees with storage is refused", async () => {
  const db = freshStore();
  try {
    const { revision, bundle } = (await seedRevision(db));
    await assertRejects(
      () => approve(db, revision, bundle, { revisionSha256: "0".repeat(64) }),
      expectCode("APPROVAL_REVISION_MISMATCH"),
      "wrong revision hash refused",
    );
    await assertRejects(
      () => approve(db, revision, bundle, { manifestSha256: "0".repeat(64) }),
      expectCode("APPROVAL_REVISION_MISMATCH"),
      "wrong manifest hash refused",
    );
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM approvals").get()).n),
      0,
      "no approvals written",
    );
  } finally {
    db.close();
  }
});

await test("a revision with no bundle cannot be approved", async () => {
  const db = freshStore();
  try {
    // A revision deliberately created WITHOUT a render bundle.
    const item = (await store.withTransaction(db, async () =>
      (await revisions.createItem(db, { type: "issue", slug: "unbundled-item", title: "Unbundled" })),
    ));
    const revision = (await store.withTransaction(db, async () =>
      (await revisions.insertRevision(db, {
        itemId: item.id,
        expectedRevisionId: null,
        title: "Unbundled",
        blocks: [{ markdown: "No bundle for this one." }],
        createdBy: "fixture",
        origin: "fixture",
      })),
    ));
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM render_bundles").get()).n),
      0,
      "no bundle exists for this revision",
    );
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await approvals.createApproval(db, {
            humanSubjectId: SUBJECT,
            revisionId: revision.id,
            revisionSha256: revision.contentSha256,
            manifestSha256: "0".repeat(64),
            targetRef: TARGET,
          })),
        )),
      expectCode("APPROVAL_INVALID"),
      "no bundle means no approval",
    );
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM approvals").get()).n),
      0,
      "no approval written",
    );
  } finally {
    db.close();
  }
});

await test("an approval without an identified human subject is refused", async () => {
  const db = freshStore();
  try {
    const { revision, bundle } = (await seedRevision(db));
    await assertRejects(
      () => approve(db, revision, bundle, { humanSubjectId: "   " }),
      expectCode("SESSION_REQUIRED"),
      "subject required",
    );
  } finally {
    db.close();
  }
});

await test("a non-loopback publication target is refused", async () => {
  const db = freshStore();
  try {
    const { revision, bundle } = (await seedRevision(db));
    for (const target of [
      "https://velcrafting.com",
      "http://example.com/publish",
      "http://192.168.1.10:3410",
      "not-a-url",
    ]) {
      await assertRejects(
        () => approve(db, revision, bundle, { targetRef: target }),
        expectCode("TARGET_NOT_ALLOWED"),
        `refuse target ${target}`,
      );
    }
  } finally {
    db.close();
  }
});

await test("a stale approval is refused: a new revision invalidates it (A4)", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    assertEqual(approval.state, "approved", "approved first");

    const next = (await store.withTransaction(db, async () => {
      const rev = (await revisions.insertRevision(db, {
        itemId: item.id,
        expectedRevisionId: revision.id,
        title: "Plumbing Issue",
        summary: "Summary.",
        byline: "Fixture",
        blocks: [
          { id: revision.blocks[0].id, markdown: "First paragraph.\n\nSecond paragraph.", humanLocked: true },
          { markdown: "A newly added paragraph." },
        ],
        createdBy: "fixture",
        origin: "fixture",
      }));
      (await approvals.invalidateApprovalsForItem(db, item.id, "revision-created"));
      return rev;
    }));

    assertEqual(
      (await approvals.getApproval(db, approval.id)).state,
      "invalidated",
      "the earlier approval is invalidated in the same transaction",
    );
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await approvals.assertApprovalUsable(db, {
            approvalId: approval.id,
            itemId: item.id,
            revisionId: revision.id,
            channel: "website",
            environment: "local_test",
            targetRef: TARGET,
          })),
        )),
      expectCode("APPROVAL_INVALIDATED"),
      "a stale approval cannot be used",
    );
    assertEqual(next.revisionNumber, 2, "the new revision exists");
  } finally {
    db.close();
  }
});

await test("an expired approval is refused", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await store.withTransaction(db, async () =>
      (await approvals.createApproval(db, {
        humanSubjectId: SUBJECT,
        revisionId: revision.id,
        revisionSha256: revision.contentSha256,
        manifestSha256: bundle.manifestSha256,
        targetRef: TARGET,
        ttlMs: 1000,
        now: "2026-01-01T00:00:00Z",
      })),
    ));
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await approvals.assertApprovalUsable(db, {
            approvalId: approval.id,
            itemId: item.id,
            revisionId: revision.id,
            channel: "website",
            environment: "local_test",
            targetRef: TARGET,
            now: "2026-01-02T00:00:00Z",
          })),
        )),
      expectCode("APPROVAL_EXPIRED"),
      "expired approval refused",
    );
  } finally {
    db.close();
  }
});

await test("an approval for a different target is refused", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await approvals.assertApprovalUsable(db, {
            approvalId: approval.id,
            itemId: item.id,
            revisionId: revision.id,
            channel: "website",
            environment: "local_test",
            targetRef: "http://127.0.0.1:9999",
          })),
        )),
      expectCode("TARGET_NOT_ALLOWED"),
      "different target refused",
    );
    assert(approval.id, "approval exists");
  } finally {
    db.close();
  }
});

suite("S04b: intents, outbox and the published projection");

await test("intent and outbox row are inserted atomically with one operation key", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    const operationKey = intents.websiteOperationKey(item.id, revision.id);
    const payloadSha256 = render.publicationPayloadHash({
      manifestSha256: bundle.manifestSha256,
      revisionSha256: revision.contentSha256,
      channel: "website",
      targetRef: TARGET,
      operationKey,
    });
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey,
        payloadSha256,
        targetRef: TARGET,
      })),
    ));
    assertEqual(intent.state, "intent_recorded", "intent recorded");
    assertEqual(intent.attemptCount, 0, "no attempts yet");
    assertEqual((await outbox.countOutboxJobs(db, intent.id)), 1, "exactly one outbox job");
    assertEqual(
      (await intents.findIntentByOperationKey(db, operationKey)).id,
      intent.id,
      "operation key resolves to the intent",
    );
  } finally {
    db.close();
  }
});

await test("A7: a repeated operation key is a duplicate and creates no second logical publication", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    const operationKey = intents.websiteOperationKey(item.id, revision.id);
    const payloadSha256 = "a".repeat(64);
    (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey,
        payloadSha256,
        targetRef: TARGET,
      })),
    ));
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await intents.insertIntentWithOutbox(db, {
            approvalId: approval.id,
            revisionId: revision.id,
            itemId: item.id,
            operationKey,
            payloadSha256,
            targetRef: TARGET,
          })),
        )),
      expectCode("DUPLICATE_OPERATION"),
      "duplicate operation key refused",
    );
    assertEqual(
      (await intents.countIntentsForRevision(db, revision.id)),
      1,
      "still one intent for the revision",
    );
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM outbox_jobs").get()).n),
      1,
      "still one outbox job",
    );
  } finally {
    db.close();
  }
});

await test("a failure after the intent insert rolls back intent and outbox together", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () => {
          (await intents.insertIntentWithOutbox(db, {
            approvalId: approval.id,
            revisionId: revision.id,
            itemId: item.id,
            operationKey: "rollback-key",
            payloadSha256: "b".repeat(64),
            targetRef: TARGET,
          }));
          throw new Error("simulated crash after intent insert");
        })),
      async (error) => (await /simulated crash/.test(error.message)),
      "transaction rethrows",
    );
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM publication_intents").get()).n),
      0,
      "no intent survived",
    );
    assertEqual(
      Number((await db.prepare("SELECT COUNT(*) AS n FROM outbox_jobs").get()).n),
      0,
      "no outbox job survived",
    );
  } finally {
    db.close();
  }
});

await test("outbox leases fence a stale worker out", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey: "lease-key",
        payloadSha256: "c".repeat(64),
        targetRef: TARGET,
      })),
    ));

    (await store.withTransaction(db, async () =>
      (await outbox.claimLease(db, intent.id, { leaseToken: "worker-1", ttlMs: 60_000 })),
    ));
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await outbox.claimLease(db, intent.id, { leaseToken: "worker-2", ttlMs: 60_000 })),
        )),
      expectCode("LEASE_HELD"),
      "a live lease cannot be stolen",
    );
    // A worker whose lease was superseded cannot write state any more.
    await assertRejects(
      async () =>
        (await store.withTransaction(db, async () =>
          (await intents.updateIntentState(db, intent.id, {
            state: "stored",
            leaseToken: "worker-2",
          })),
        )),
      expectCode("LEASE_HELD"),
      "a foreign lease token cannot write",
    );
    const job = (await outbox.getOutboxJobForIntent(db, intent.id));
    assertEqual(job.leaseToken, "worker-1", "lease still belongs to the first worker");
    assertEqual(job.attemptCount, 1, "one attempt recorded");
  } finally {
    db.close();
  }
});

await test("an expired lease can be claimed by a new worker", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db));
    const approval = (await approve(db, revision, bundle));
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey: "expire-key",
        payloadSha256: "d".repeat(64),
        targetRef: TARGET,
      })),
    ));
    (await store.withTransaction(db, async () =>
      (await outbox.claimLease(db, intent.id, {
        leaseToken: "worker-old",
        ttlMs: 1000,
        now: "2026-01-01T00:00:00Z",
      })),
    ));
    const claimed = (await store.withTransaction(db, async () =>
      (await outbox.claimLease(db, intent.id, {
        leaseToken: "worker-new",
        ttlMs: 1000,
        now: "2026-01-01T00:10:00Z",
      })),
    ));
    assertEqual(claimed.leaseToken, "worker-new", "expired lease is reclaimable");
    assertEqual(claimed.job.attemptCount, 2, "attempts accumulate across workers");
  } finally {
    db.close();
  }
});

await test("the published projection shows only an item with a committed intent", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db, "published-issue"));
    const approval = (await approve(db, revision, bundle));
    const operationKey = intents.websiteOperationKey(item.id, revision.id);
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey,
        payloadSha256: "e".repeat(64),
        targetRef: TARGET,
      })),
    ));

    // A pointer alone is not enough while the intent is not committed.
    (await store.withTransaction(db, async () => (await intents.setPublishedPointer(db, item.id, revision.id))));
    assertEqual(
      (await publicProjection.listPublicIssues(db)).length,
      0,
      "pointer without a committed intent is not public",
    );

    (await store.withTransaction(db, async () =>
      (await intents.updateIntentState(db, intent.id, { state: "stored" })),
    ));
    const listed = (await publicProjection.listPublicIssues(db));
    assertEqual(listed.length, 1, "committed intent becomes public");
    assertEqual(listed[0].slug, "published-issue", "correct item");
    assertEqual(listed[0].revisionSha256, revision.contentSha256, "projection carries the revision hash");
    assertEqual(
      (await publicProjection.listPublicIssues(db, "hosted_preview")).length,
      0,
      "a local_test publication is withheld from hosted preview",
    );
    assertEqual(
      await publicProjection.getPublicIssue(db, "published-issue", "hosted_preview"),
      null,
      "local_test content cannot be loaded by hosted preview slug",
    );
    const detail = (await publicProjection.getPublicIssue(db, "published-issue"));
    assert(detail, "detail projection resolves");
    assertEqual(detail.manifestSha256, bundle.manifestSha256, "manifest carried through");
  } finally {
    db.close();
  }
});

await test("an intent that never reached commit is not visible through the projection", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db, "draft-only-issue"));
    const approval = (await approve(db, revision, bundle));
    const operationKey = intents.websiteOperationKey(item.id, revision.id);
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey,
        payloadSha256: "f".repeat(64),
        targetRef: TARGET,
      })),
    ));
    // Pointer set but the intent is still pre-commit (`intent_recorded`).
    (await store.withTransaction(db, async () => (await intents.setPublishedPointer(db, item.id, revision.id))));
    assertEqual(
      (await publicProjection.listPublicIssues(db)).length,
      0,
      "a pre-commit intent cannot publish",
    );
    assertEqual(
      (await publicProjection.getPublicIssue(db, "draft-only-issue")),
      null,
      "direct slug access is refused by the projection",
    );

    // Once the intent commits, the same pointer becomes public.
    (await store.withTransaction(db, async () =>
      (await intents.updateIntentState(db, intent.id, { state: "stored" })),
    ));
    assertEqual(
      (await publicProjection.listPublicIssues(db)).length,
      1,
      "the commit is what publishes the pointer",
    );
  } finally {
    db.close();
  }
});

await test("a failed verification does not retract a committed publication", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db, "failed-verification-issue"));
    const approval = (await approve(db, revision, bundle));
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey: "failed-verification-key",
        payloadSha256: "2".repeat(64),
        targetRef: TARGET,
      })),
    ));
    (await store.withTransaction(db, async () => {
      (await intents.setPublishedPointer(db, item.id, revision.id));
      (await intents.updateIntentState(db, intent.id, {
        state: "failed",
        errorCode: "HTTP_VERIFICATION_FAILED",
      }));
    }));
    const listed = (await publicProjection.listPublicIssues(db));
    assertEqual(listed.length, 1, "the committed pointer still serves the issue");
    assertEqual(listed[0].intentState, "failed", "the operator can see verification failed");
  } finally {
    db.close();
  }
});

await test("publication results are recorded for verification evidence", async () => {
  const db = freshStore();
  try {
    const { item, revision, bundle } = (await seedRevision(db, "result-issue"));
    const approval = (await approve(db, revision, bundle));
    const intent = (await store.withTransaction(db, async () =>
      (await intents.insertIntentWithOutbox(db, {
        approvalId: approval.id,
        revisionId: revision.id,
        itemId: item.id,
        operationKey: "result-key",
        payloadSha256: "1".repeat(64),
        targetRef: TARGET,
      })),
    ));
    (await store.withTransaction(db, async () =>
      (await intents.recordPublicationResult(db, {
        intentId: intent.id,
        state: "verified",
        httpStatus: 200,
        revisionMarker: revision.contentSha256,
        canonicalUrl: `${TARGET}/issues/result-issue`,
      })),
    ));
    const results = (await intents.listPublicationResults(db, intent.id));
    assertEqual(results.length, 1, "one result recorded");
    assertEqual(results[0].httpStatus, 200, "status recorded");
    assertEqual(results[0].revisionMarker, revision.contentSha256, "marker recorded");
  } finally {
    db.close();
  }
});

await test("source and revision records still work alongside the B2 tables", async () => {
  const db = freshStore();
  try {
    const { source } = (await store.withTransaction(db, async () =>
      (await sources.createSourceWithCapture(db, {
        provider: "arxiv",
        upstreamId: "2401.00002v1",
        canonicalUrl: "https://arxiv.org/abs/2401.00002v1",
        title: "B2 Fixture Source",
        accessLevel: "abstract_only",
      })),
    ));
    assertEqual(source.provider, "arxiv", "source written");
    assertEqual((await sources.countCaptureEvents(db, source.id)), 1, "capture recorded");
  } finally {
    db.close();
  }
});

finish("S04b approval-intent store");
