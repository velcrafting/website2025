// Gate B / S05: the issue editor.
//
// The human checkpoint surface. Steven edits the text here and approves the
// exact artifact; every action re-checks the admin session before any side
// effect. Approval and publication are deliberately separate buttons, and the
// approval binds the revision hash actually displayed on this page.

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import BlockPicker from "@/components/editor/BlockPicker";
import BlockKindFields from "@/components/editor/BlockKindFields";
import UnsavedDraftGuard from "@/components/editor/UnsavedDraftGuard";
import UnsavedPreview from "@/components/editor/UnsavedPreview";
import PrepareAnotherDraft from "@/components/editor/PrepareAnotherDraft";
import { EditorError, isEditorError } from "@/editor/contracts/errors";
import { requireEditorSession } from "@/editor/admin-guard";
import { approveRevision } from "@/editor/approval/service";
import { commitWebsitePublication, verifyWebsitePublication } from "@/editor/publishing/website";
import { getIssueEditorView, saveIssueRevision, createIssue } from "@/editor/revision/service";
import { getItem, getRevision } from "@/editor/repository/revisions";
import { assertSlug } from "@/editor/validation/revision";
import { accessLevelLabel, listProvenanceForRevision } from "@/editor/repository/public";
import { openEditorStore } from "@/editor/repository/store";
import { currentHumanSubject, currentTestTarget, withEditorStore } from "@/editor/service";
import { blockKindOf } from "@/editor/contracts/types";
import { blocksFromForm } from "@/editor/forms/editor-form";
import { snapshotFromRevision } from "@/editor/forms/draft-baseline";

export const dynamic = "force-dynamic";

async function saveAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");
  const expectedRevisionId = String(formData.get("expectedRevisionId") ?? "");
  let target: string;
  try {
    const result = (await withEditorStore(async (store) =>
      (await saveIssueRevision(store, {
        itemId,
        expectedRevisionId: expectedRevisionId || null,
        title: String(formData.get("title") ?? "").trim(),
        summary: String(formData.get("summary") ?? "").trim() || null,
        byline: String(formData.get("byline") ?? "").trim() || null,
        blocks: blocksFromForm(formData, true),
        createdBy: currentHumanSubject(),
        origin: "human",
      })),
    ));
    const status =
      result.invalidatedApprovals > 0
        ? "saved_approval_invalidated"
        : result.preservedLockedBlocks > 0
          ? "preserved_locked"
          : "saved";
    target = `/admin/editor/${itemId}?status=${status}`;
  } catch (error) {
    const code = isEditorError(error) ? error.code : "INTERNAL";
    // The submitted text is NOT discarded: the form re-renders from storage and
    // the editor reports the conflict. Nothing was written.
    target = `/admin/editor/${itemId}?status=${encodeURIComponent(code)}`;
  }
  revalidatePath(`/admin/editor/${itemId}`);
  redirect(target);
}

async function prepareAnotherDraftAction(formData: FormData) {
  "use server";
  // Authority is re-checked inside the action, before any effect — same as every other mutation here.
  await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  let target: string;
  try {
    const created = (await withEditorStore(async (store) => {
      // The SAVED revision, read from the store. Deliberately NOT the submitted form values: the
      // control is labelled as copying the saved revision, and reading it here is what makes that
      // true rather than aspirational.
      const revision = (await getRevision(store.db, revisionId));
      if (!revision || revision.itemId !== itemId) {
        throw new EditorError("VALIDATION_FAILED", "That saved revision could not be found.");
      }
      const source = (await getItem(store.db, itemId));
      const base = source?.slug ?? "draft";

      for (let attempt = 2; attempt <= 51; attempt += 1) {
        const candidate = `${base}-draft-${attempt}`;
        try {
          assertSlug(candidate, "slug");
        } catch {
          continue;
        }
        try {
          return (await createIssue(store, {
            slug: candidate,
            // The author's own saved writing, copied exactly. No rewriting, no summarising, no
            // invented facts — this is reuse of existing work, which is the point.
            title: revision.title,
            summary: revision.summary,
            byline: revision.byline,
            blocks: revision.blocks.map((block) => ({
              ...block,
              // A block that already records where it came from KEEPS that link: deriving a draft
              // from a draft must not quietly erase an earlier provenance chain. Only a block with
              // no recorded origin is given this derivation.
              linkedArticleRevisionId: block.linkedArticleRevisionId ?? revision.id,
            })),
            sourceVersionIds: revision.sourceVersionIds,
            createdBy: currentHumanSubject(),
            origin: "human",
          }));
        } catch (error) {
          if (isEditorError(error) && error.code === "DUPLICATE_ITEM") {
            continue; // that name is taken; try the next
          }
          throw error;
        }
      }
      throw new EditorError("VALIDATION_FAILED", "No free name could be found for the new draft.");
    }));
    target = `/admin/editor/${created.item.id}?status=draft_prepared`;
  } catch (error) {
    const code = isEditorError(error) ? error.code : "INTERNAL";
    target = `/admin/editor/${itemId}?status=${encodeURIComponent(code)}`;
  }
  revalidatePath("/admin/editor");
  redirect(target);
}

async function approveAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");
  let target: string;
  try {
    (await withEditorStore(async (store) =>
      (await approveRevision(store, {
        itemId,
        revisionId: String(formData.get("revisionId") ?? ""),
        revisionSha256: String(formData.get("revisionSha256") ?? ""),
        manifestSha256: String(formData.get("manifestSha256") ?? ""),
        humanSubjectId: currentHumanSubject(),
        targetRef: String(formData.get("targetRef") ?? currentTestTarget()),
      })),
    ));
    target = `/admin/editor/${itemId}?status=approved`;
  } catch (error) {
    const code = isEditorError(error) ? error.code : "INTERNAL";
    target = `/admin/editor/${itemId}?status=${encodeURIComponent(code)}`;
  }
  revalidatePath(`/admin/editor/${itemId}`);
  redirect(target);
}

async function publishAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");
  let target: string;
  // Opened directly (not via withEditorStore) because the HTTP verification is
  // asynchronous and must run while the connection is still open.
  const store = (await openEditorStore());
  try {
    const commit = (await commitWebsitePublication(store, {
      itemId,
      approvalId: String(formData.get("approvalId") ?? ""),
      revisionId: String(formData.get("revisionId") ?? ""),
      targetRef: String(formData.get("targetRef") ?? currentTestTarget()),
    }));
    const verification = await verifyWebsitePublication(store, {
      intentId: commit.intent.id,
      expectedRevisionSha256: commit.revisionSha256,
    });
    target = verification.verified
      ? `/admin/editor/${itemId}?status=published&url=${encodeURIComponent(commit.publicUrl)}`
      : `/admin/editor/${itemId}?status=publish_failed&url=${encodeURIComponent(commit.publicUrl)}`;
  } catch (error) {
    const code = isEditorError(error) ? error.code : "INTERNAL";
    target = `/admin/editor/${itemId}?status=${encodeURIComponent(code)}`;
  } finally {
    (await store.close());
  }
  revalidatePath(`/admin/editor/${itemId}`);
  revalidatePath("/issues");
  redirect(target);
}

const STATUS_MESSAGES: Record<string, string> = {
  saved: "Revision saved.",
  saved_approval_invalidated:
    "Revision saved. Any earlier approval was invalidated — approve again before publishing.",
  preserved_locked: "Revision saved; a locked block was preserved exactly as written.",
  draft_prepared:
    "New draft prepared from the saved revision. The original draft and its approval state are unchanged.",
  approved: "Approved. The exact revision hash below is now bound to this approval.",
  published: "Published and HTTP-verified.",
  publish_failed: "Publication was committed but HTTP verification failed. See the result.",
  CONFLICT_STALE_REVISION:
    "This draft changed since you loaded it. Nothing was saved — your writing has been put back in the form, so nothing needs copying.",
  DUPLICATE_REVISION: "That text is identical to the current revision; nothing to save.",
  APPROVAL_INVALIDATED: "That approval was invalidated by a later change. Approve again.",
  APPROVAL_EXPIRED: "That approval expired. Approve again.",
  APPROVAL_REVISION_MISMATCH: "That approval does not match the current revision.",
  TARGET_NOT_ALLOWED: "The target does not match this editor environment.",
  VALIDATION_FAILED:
    "The form was rejected by validation; nothing was saved. Your writing has been put back in the form — fix the problem it reported and save again.",
};

export default async function EditIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; url?: string }>;
}) {
  await requireEditorSession();
  const { id } = await params;
  const { status, url } = await searchParams;
  const view = (await withEditorStore(async (store) => (await getIssueEditorView(store, id))));
  if (!view) notFound();

  const revision = view.currentRevision;

  // The live preview shows the COMPLETE output, so it needs the stored source list — which is not
  // part of the form and is not the author's to retype. Read here, passed as a value, never
  // written; the preview route stays unable to persist anything.
  const previewSources = (await withEditorStore(async (store) =>
    revision
      ? (await listProvenanceForRevision(store.db, revision.id)).slice(0, 50).map((source) => ({
          title: source.sourceTitle,
          url: source.canonicalUrl,
          provider: source.provider,
          meta: [source.versionLabel, accessLevelLabel(source.accessLevel)]
            .filter(Boolean)
            .join(" · "),
        }))
      : [],
  ));
  const message = status ? (STATUS_MESSAGES[status] ?? `Status: ${status}`) : null;
  const blockCount = revision?.blocks.length ?? 0;

  return (
    <main className="mx-auto w-full max-w-[110rem] px-6 py-12">
      <p className="text-sm">
        <Link className="underline" href="/admin/editor">
          ← All drafts
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{view.item.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {view.item.type} · {view.item.slug} · {view.item.visibility}
        {view.item.publishedRevisionId ? " · published" : ""}
      </p>

      {message ? (
        <p className="mt-4 rounded-[var(--radius-surface)] border border-[var(--warn-ink)]/35 bg-warn-fill px-3 py-2 text-sm text-warn-ink">
          {message}
        </p>
      ) : null}
      {url ? (
        <p className="mt-2 text-sm">
          Public URL:{" "}
          <a className="underline" href={url}>
            {url}
          </a>
        </p>
      ) : null}

      {revision ? (
        <>
          {/*
            Revision identity, hashes and approval state live under Details: they are the exact
            facts an approval binds and must stay reachable, but they are not what an author is
            looking at while writing.
          */}
          <details className="mt-4 rounded-[var(--radius-surface)] border border-rule px-3 py-2">
            <summary className="cursor-pointer text-sm text-muted">Details</summary>
            <p className="mt-2 text-sm text-muted">
              Current revision {revision.revisionNumber} · {revision.editorialState}
              {view.liveApproval ? " · approved" : " · not approved"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Revision <code className="text-xs">{revision.id}</code>
            </p>
            <p className="mt-1 text-sm text-muted">
              Content hash <code className="text-xs">{revision.contentSha256}</code>
            </p>
            <p className="mt-1 text-sm text-muted">
              Bundle hash{" "}
              <code className="text-xs">{view.bundle?.manifestSha256 ?? "no bundle"}</code>
            </p>
          </details>

          {/*
            Writing beside the reader's view, using the width a desktop actually has. The preview
            column has a legible minimum (24rem) rather than being squeezed into a phone-width
            strip. On a narrow screen they stack, writing first.
          */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]">
          <form action={saveAction} data-unsaved-guard className="space-y-4">
            {/* Restores the submitted writing when a save attempt is rejected. */}
            <UnsavedDraftGuard itemId={id} status={status} />
            <input type="hidden" name="itemId" value={view.item.id} />
            <input type="hidden" name="documentType" value={view.item.type} />
            {/* The stored source list, so the live preview can show the sources the revision pins. */}
            <input type="hidden" name="previewSources" value={JSON.stringify(previewSources)} />
            <input type="hidden" name="expectedRevisionId" value={revision.id} />
            {/*
              The saved draft's canonical snapshot, computed by the server from the stored revision.
              The preview panel compares the live form against this to answer "unsaved changes?", and
              the recovery guard's restore is measured against it too — so restored writing reads as
              unsaved rather than as the saved state.
            */}
            <input
              type="hidden"
              name="__savedDraft"
              data-not-content="true"
              value={snapshotFromRevision({
                title: revision.title,
                summary: revision.summary,
                byline: revision.byline,
                blocks: revision.blocks,
              })}
            />
            <input type="hidden" name="blockCount" value={blockCount} />

            <div>
              <label className="block text-sm" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                name="title"
                defaultValue={revision.title}
                className="mt-1 w-full rounded border border-rule px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-sm" htmlFor="summary">
                Summary
              </label>
              <input
                id="summary"
                name="summary"
                defaultValue={revision.summary ?? ""}
                className="mt-1 w-full rounded border border-rule px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-sm" htmlFor="byline">
                Byline
              </label>
              <input
                id="byline"
                name="byline"
                defaultValue={revision.byline ?? ""}
                className="mt-1 w-full rounded border border-rule px-2 py-1"
              />
            </div>

            {revision.blocks.map((block, index) => (
              <fieldset key={block.id} className="rounded border border-rule p-3">
                <legend className="px-1 text-sm text-muted">
                  Section {index + 1}
                  {block.humanLocked ? " · kept exactly as written" : ""}
                </legend>
                <input type="hidden" name={`block.${index}.id`} value={block.id} />
                {/*
                  Kind and its fields are one client component: the fields follow the current
                  selection, so choosing Figure reveals the image and alt inputs it requires.
                */}
                <BlockKindFields
                  index={index}
                  initialKind={blockKindOf(block)}
                  initialData={block.data ?? {}}
                />

                <label className="mt-2 block text-sm" htmlFor={`block-${index}-heading`}>
                  Section heading
                </label>
                <input
                  id={`block-${index}-heading`}
                  name={`block.${index}.heading`}
                  defaultValue={block.heading}
                  className="mt-1 w-full rounded border border-rule px-2 py-1"
                />
                <label className="mt-2 block text-sm" htmlFor={`block-${index}-markdown`}>
                  Text
                </label>
                <textarea
                  id={`block-${index}-markdown`}
                  name={`block.${index}.markdown`}
                  defaultValue={block.markdown}
                  rows={10}
                  className="mt-1 w-full rounded border border-rule px-2 py-1 font-mono text-sm"
                />
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`block.${index}.locked`}
                    defaultChecked={block.humanLocked}
                  />
                  Keep this text exactly as written
                </label>
              </fieldset>
            ))}

            {/* Optional picker, opened on demand: authoring plain text must not present a
                component catalog as the first thing to decide. */}
            <details className="rounded-[var(--radius-surface)] border border-dashed border-rule p-3">
              <summary className="cursor-pointer text-sm text-muted">Insert a block</summary>
              <div className="mt-3">
                <BlockPicker />
              </div>
            </details>

            <button className="btn-primary" type="submit">
              Save draft
            </button>
          </form>

          <UnsavedPreview
            savedPreviewHref={revision ? `/admin/editor/preview/${revision.id}` : null}
          />
          </div>

          {view.item.type === "issue" ? (
            <>
          {/* Reuse the saved draft as the starting point for another one. */}
          <section className="mt-8" data-reuse-draft>
            <h2 className="text-xl font-semibold">Reuse this draft</h2>
            <PrepareAnotherDraft
              itemId={view.item.id}
              revisionId={revision.id}
              action={prepareAnotherDraftAction}
            />
          </section>

          <h2 className="mt-10 text-xl font-semibold">Approve exactly this revision</h2>
          <p className="mt-1 text-sm text-muted">
            Approval binds the displayed hashes. Editing afterwards invalidates it.
          </p>
          <form action={approveAction} className="mt-3 space-y-2">
            <input type="hidden" name="itemId" value={view.item.id} />
            <input type="hidden" name="revisionId" value={revision.id} />
            <input type="hidden" name="revisionSha256" value={revision.contentSha256} />
            <input
              type="hidden"
              name="manifestSha256"
              value={view.bundle?.manifestSha256 ?? ""}
            />
            <input type="hidden" name="targetRef" value={currentTestTarget()} />
            <button
              className="btn-primary"
              type="submit"
              disabled={!view.bundle || Boolean(view.liveApproval)}
            >
              Approve revision {revision.revisionNumber}
            </button>
          </form>

          <h2 className="mt-10 text-xl font-semibold">Publish to this deployment target</h2>
          {view.liveApproval ? (
            <form action={publishAction} className="mt-3 space-y-2">
              <input type="hidden" name="itemId" value={view.item.id} />
              <input type="hidden" name="approvalId" value={view.liveApproval.id} />
              <input type="hidden" name="revisionId" value={revision.id} />
              <input type="hidden" name="targetRef" value={currentTestTarget()} />
              <p className="text-sm text-muted">
                Approval {view.liveApproval.id.slice(0, 18)}… · target{" "}
                {view.liveApproval.targetRef}
              </p>
              <button className="btn-primary" type="submit">
                Commit and verify
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No live approval. Approve the current revision first.
            </p>
          )}
            </>
          ) : (
            <p className="mt-8 text-sm text-muted">
              Article drafts stay private here; publishing them to the public blog is not connected yet.
            </p>
          )}

          <h2 className="mt-10 text-xl font-semibold">History</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.revisions.map((entry) => (
              <li key={entry.id}>
                revision {entry.revisionNumber} · {entry.origin} ·{" "}
                {entry.createdAt} · <code className="text-xs">{entry.contentSha256.slice(0, 12)}…</code>{" "}
                <Link className="underline" href={`/admin/editor/preview/${entry.id}`}>
                  preview
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            <Link className="underline" href={`/admin/editor/preview/${revision.id}`}>
              Open the protected preview of the current revision
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-6 text-muted">This draft has no revision yet.</p>
      )}
    </main>
  );
}
