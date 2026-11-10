import Workspace from "@/components/layout/Workspace";
// The draft list: every draft with its revisions, and the form that starts a new one.
//
// Every mutation re-checks the admin session inside the action, before any side
// effect, rather than trusting the root middleware matcher alone.

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { isEditorError } from "@/editor/contracts/errors";
import { requireEditorSession } from "@/editor/admin-guard";
import { createDraft, listDraftItems } from "@/editor/revision/service";
import { currentHumanSubject, withEditorStore } from "@/editor/service";

export const dynamic = "force-dynamic";

async function createDraftAction(formData: FormData) {
  "use server";
  await requireAdmin();
  let target: string;
  try {
    const result = (await withEditorStore(async (store) =>
      (await createDraft(store, {
        slug: String(formData.get("slug") ?? "").trim(),
        title: String(formData.get("title") ?? "").trim(),
        summary: String(formData.get("summary") ?? "").trim() || null,
        byline: String(formData.get("byline") ?? "").trim() || null,
        blocks: [
          {
            markdown: String(formData.get("body") ?? ""),
            heading: String(formData.get("heading") ?? "").trim(),
            humanLocked: true,
            origin: "human",
          },
        ],
        createdBy: currentHumanSubject(),
        origin: "human",
      }, formData.get("type") === "issue" ? "issue" : "article")),
    ));
    target = `/admin/editor/${result.item.id}?status=created`;
  } catch (error) {
    const code = isEditorError(error) ? error.code : "INTERNAL";
    target = `/admin/editor?status=${encodeURIComponent(code)}`;
  }
  revalidatePath("/admin/editor");
  redirect(target);
}

const STATUS_MESSAGES: Record<string, string> = {
  created: "Draft created.",
  saved: "Revision saved.",
  approved: "Revision approved for this deployment target.",
  published: "Publication committed and the public URL was checked.",
  publish_failed: "Publication committed but HTTP verification failed — see the result below.",
  saved_approval_invalidated: "Revision saved. The earlier approval was invalidated.",
  preserved_locked: "Revision saved. A locked block was preserved exactly.",
};

export default async function AdminEditorIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireEditorSession();
  const { status } = await searchParams;
  const items = (await withEditorStore(async (store) => (await listDraftItems(store))));
  const message = status ? (STATUS_MESSAGES[status] ?? `Status: ${status}`) : null;

  return (
    <Workspace>
      <h1 className="text-3xl font-semibold">Drafts</h1>
      <p className="mt-2 text-sm text-muted">
        Your article and issue drafts. Issue publication requires a separate approval; article drafts stay private here.
      </p>

      {message ? (
        <p className="mt-4 rounded-[var(--radius-surface)] border border-[var(--warn-ink)]/35 bg-warn-fill px-3 py-2 text-sm text-warn-ink">
          {message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-6 text-muted">No drafts yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {items.map((item) => (
            <li key={item.id} className="py-3">
              <Link className="underline" href={`/admin/editor/${item.id}`}>
                {item.title}
              </Link>
              <span className="ml-2 text-sm text-muted">
                {item.type} · {item.slug} · {item.visibility}
                {item.publishedRevisionId ? " · published" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-12 text-2xl font-semibold">New draft</h2>
      <form action={createDraftAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm" htmlFor="type">Content type</label>
          <select id="type" name="type" className="mt-1 w-full rounded border border-rule px-2 py-1">
            <option value="article">Blog article</option>
            <option value="issue">Issue</option>
          </select>
        </div>
        <div>
          <label className="block text-sm" htmlFor="slug">
            Slug (lowercase words, single hyphens)
          </label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="mt-1 w-full rounded border border-rule px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
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
            className="mt-1 w-full rounded border border-rule px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm" htmlFor="heading">
            First section heading
          </label>
          <input
            id="heading"
            name="heading"
            className="mt-1 w-full rounded border border-rule px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm" htmlFor="body">
            Body (plain text; blank line separates paragraphs)
          </label>
          <textarea
            id="body"
            name="body"
            rows={10}
            required
            className="mt-1 w-full rounded border border-rule px-2 py-1 font-mono text-sm"
          />
        </div>
        <button className="btn-primary" type="submit">
          Create private draft
        </button>
      </form>
    </Workspace>
  );
}
