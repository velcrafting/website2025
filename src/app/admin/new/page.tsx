import Workspace from "@/components/layout/Workspace";
// src/app/admin/new/page.tsx - CMS for creating blog articles with pillars
import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { isAdmin, requireAdmin } from "@/lib/admin";
import { isEditorError } from "@/editor/contracts/errors";
import { openEditorStore } from "@/editor/repository/store";
import { createIssue } from "@/editor/revision/service";
import { currentHumanSubject } from "@/editor/service";
import { assertSlug } from "@/editor/validation/revision";
import {
  assertSafeRawName,
  normalizeContentName,
  resolveSafeContentPath,
  filesystemContentWritesEnabled,
} from "@/lib/content-paths";

// Get existing pillars from blog folder
async function getPillars() {
  try {
    const blogDir = path.join(process.cwd(), "src", "content", "blog");
    const entries = await fs.readdir(blogDir);
    const pillars: string[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(blogDir, entry));
      if (stat.isDirectory()) {
        pillars.push(entry);
      }
    }
    return pillars;
  } catch {
    return [];
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; created?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { status, created } = await searchParams;
  const pillars = await getPillars();

  return (
    <Workspace measure="form">
      <h1 className="text-2xl font-semibold">Create Article</h1>
      <p className="meta mt-1">
        Only the writing is required. Anything you leave empty is generated or defaults.
      </p>

      {created ? (
        <p
          role="status"
          className="mt-4 rounded-[var(--radius-surface)] border border-[var(--accent)] bg-paper-raised p-3 text-sm text-ink"
        >
          Saved as a draft at <code>/blog/{created}</code>. Nothing was published.
        </p>
      ) : null}

      {status ? (
        <p
          role="status"
          className="mt-4 rounded-[var(--radius-surface)] border border-[var(--rule)] bg-paper-raised p-3 text-sm text-ink"
        >
          {CREATE_STATUS[status] ?? `Status: ${status}`}
        </p>
      ) : null}

      <form action={create} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="capture-title">
            Title (optional)
          </label>
          <input id="capture-title" name="title" placeholder="Untitled" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="capture-summary">
            Summary (optional)
          </label>
          <textarea id="capture-summary" name="summary" rows={2} placeholder="Brief description" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="capture-body">
            Writing
          </label>
          <textarea id="capture-body" name="body" rows={15} placeholder="Paste or write here. Markdown is fine; a blank line starts a new paragraph." className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2 font-mono text-sm" />
        </div>

        <div className="flex gap-4">
          <button type="submit" name="action" value="save" className="rounded-[var(--radius-surface)] bg-accent px-6 py-2 text-on-accent hover:bg-forest">
            Save draft — opens the editor
          </button>
        </div>

        {/*
          Everything below is the older file-based library: publication metadata and its own save
          action, kept working but out of the way. Capturing a draft needs none of it, and no field
          here should stand between an author and the writing.
        */}
        <details className="rounded-[var(--radius-surface)] border border-rule p-3">
          <summary className="cursor-pointer text-sm text-muted">
            Advanced — file library and publication metadata
          </summary>
          <p className="mt-2 text-xs text-muted">
            For the older file-based blog library. A draft saved with the button above ignores these
            fields; nothing here is needed to write.
          </p>

          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pillar</label>
                <select name="pillar" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2">
                  {pillars.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                  <option value="__new__">+ New Pillar</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Pillar Name</label>
                <input name="newPillar" placeholder="e.g., security" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug (file library)</label>
              <input name="slug" placeholder="generated from the title if you leave this empty" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
              <p className="text-xs text-muted mt-1">
                URL: /blog/[pillar]/[slug]. If that name is taken, a free one is chosen instead —
                an existing note is never overwritten.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tags</label>
              <input name="tags" placeholder="ai, security, framework (comma separated)" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Status (file library)</label>
                <select name="status" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2">
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Scheduled Date</label>
                <input type="datetime-local" name="scheduledAt" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Featured</label>
              <input type="checkbox" name="featured" value="true" className="mr-2" />
              <span className="text-sm text-muted">Show on homepage</span>
            </div>

            {filesystemContentWritesEnabled() ? (
              <button type="submit" name="action" value="preview" className="rounded-[var(--radius-surface)] border border-[var(--input)] px-6 py-2 hover:bg-paper-raised">
                Save to the file library (legacy) and preview
              </button>
            ) : (
              <p className="text-sm text-muted">The file-backed article path is disabled in hosted mode. Use the revision editor for database-backed drafts.</p>
            )}
          </div>
        </details>
      </form>
    </Workspace>
  );
}

// (Raw-name validation and normalization live in src/lib/content-paths.ts.)

/** Outcomes that need to be visible rather than a silent bounce. */
const CREATE_STATUS: Record<string, string> = {
  legacy_write_disabled: "The filesystem CMS is disabled in hosted mode. Create the draft in the editor instead.",
  unsafe_name:
    "That name was refused by the content-path guard, so nothing was written. Rename it and save again — your text is still in the form.",
  name_exhausted:
    "No free name could be found after 200 attempts, so nothing was written.",
  needs_text:
    "A draft needs some text before it can be saved. Your writing is still in the form — add a line and save again.",
};

async function create(formData: FormData) {
  "use server";
  // Recheck authorization immediately before any side effect.
  await requireAdmin();

  const action = formData.get("action")?.toString();
  if ((action === "file" || action === "preview") && !filesystemContentWritesEnabled()) {
    redirect("/admin/new?status=legacy_write_disabled");
  }

  let pillar = formData.get("pillar")?.toString();
  const newPillarRaw = formData.get("newPillar")?.toString();
  const rawSlug = (formData.get("slug")?.toString() ?? "").trim();
  const rawTitle = (formData.get("title")?.toString() ?? "").trim();
  const newPillarOriginal = newPillarRaw ?? "";
  const title = rawTitle || "Untitled";
  const summary = formData.get("summary")?.toString() || "";
  const tagsStr = formData.get("tags")?.toString() || "";
  const status = formData.get("status")?.toString() || "draft";
  const scheduledAt = formData.get("scheduledAt")?.toString();
  const featured = formData.get("featured")?.toString() === "true";
  const body = formData.get("body")?.toString() || "";

  // Untitled capture. A note must be capturable before it has a name, so the identity is
  // generated here rather than demanded from the author. An empty slug previously caused a
  // silent no-op: the writing was dropped with no message.
  //
  // A derived slug passes the same guard as a typed one. If a title contains syntax the
  // guard rejects, fall back to the generated identity instead of failing the capture —
  // the author's text is what matters and the filename is ours to choose. A slug the
  // author typed themselves is still refused outright.
  let slugSource = rawSlug || rawTitle;
  if (!slugSource) {
    slugSource = "untitled-note";
  } else {
    try {
      assertSafeRawName(slugSource, "slug");
    } catch {
      if (rawSlug) {
        redirect("/admin/new?status=unsafe_name");
      }
      slugSource = "untitled-note";
    }
  }
  let baseSlug: string;
  try {
    baseSlug = normalizeContentName(slugSource, "slug");
  } catch {
    if (rawSlug) {
      redirect("/admin/new?status=unsafe_name");
    }
    baseSlug = "untitled-note";
  }

  // Handle new pillar.
  if (pillar === "__new__") {
    if (!newPillarOriginal) {
      redirect("/admin");
    }
    try {
      assertSafeRawName(newPillarOriginal, "newPillar");
      pillar = normalizeContentName(newPillarOriginal, "newPillar");
    } catch {
      redirect("/admin");
    }
  } else if (pillar) {
    // Existing pillar selection. Validate the raw value first.
    try {
      assertSafeRawName(pillar, "pillar");
      pillar = normalizeContentName(pillar, "pillar");
    } catch {
      redirect("/admin");
    }
  }

  if (!pillar) {
    pillar = "general";
  }

  // Quick capture writes into the REVISION STORE, then opens the note in the editor.
  //
  // The store is the one place a draft lives: it carries revisions, the approval boundary and
  // the renderer the reader uses. Capturing into a content file instead (the legacy path
  // below, still reachable explicitly) meant the note the author had just written could not be
  // opened in the editor at all, so the two surfaces disagreed about what a draft was.
  // `preview` and `file` are the two legacy file-library actions, preserved as they were.
  const captureToStore = action !== "file" && action !== "preview";
  if (captureToStore) {
    if (!body.trim()) {
      // A revision needs at least one block with text. Nothing is created and the writing is
      // still in the form, so this is a correction, not a loss.
      redirect("/admin/new?status=needs_text");
    }

    let captureSlug: string;
    try {
      captureSlug = assertSlug(baseSlug, "slug");
    } catch {
      captureSlug = "untitled-note";
    }

    const store = (await openEditorStore());
    try {
      for (let attempt = 1; attempt <= 200; attempt += 1) {
        const candidate = attempt === 1 ? captureSlug : `${captureSlug}-${attempt}`;
        let created;
        try {
          created = (await createIssue(store, {
            slug: candidate,
            title,
            summary: summary || null,
            // The captured writing is the author's own, so it is locked from the start.
            blocks: [{ heading: "", markdown: body, origin: "human", humanLocked: true }],
            createdBy: currentHumanSubject(),
          }));
        } catch (error) {
          if (isEditorError(error) && error.code === "DUPLICATE_ITEM") {
            continue; // that name is taken by another draft; take the next free one
          }
          throw error;
        }
        // Straight into the editor for the note just captured, at its first revision.
        redirect(`/admin/editor/${created.item.id}`);
      }
      redirect("/admin/new?status=name_exhausted");
    } finally {
      (await store.close());
    }
  }

  // Resolve the validated destination path inside the content root, then make the name
  // unique. Writing used to overwrite whatever already sat at the path, so a repeated or
  // generated slug silently destroyed an existing note. Now a taken name is stepped past
  // and the final slug is reported back, so nothing is replaced and nothing is silent.
  const contentRoot = path.join(process.cwd(), "src", "content");
  const taken = async (candidate: string): Promise<string | null> => {
    try {
      return await resolveSafeContentPath(contentRoot, pillar, candidate, ".mdx");
    } catch {
      return null;
    }
  };
  let slug = baseSlug;
  let file = await taken(slug);
  if (!file) {
    redirect("/admin/new?status=unsafe_name");
  }
  for (let attempt = 2; attempt <= 200; attempt += 1) {
    try {
      await fs.access(file);
    } catch {
      break; // free
    }
    const next = `${baseSlug}-${attempt}`;
    const nextFile = await taken(next);
    if (!nextFile) {
      redirect("/admin/new?status=unsafe_name");
    }
    slug = next;
    file = nextFile;
  }
  try {
    await fs.access(file);
    redirect("/admin/new?status=name_exhausted");
  } catch {
    // free: proceed
  }

  // Create pillar directory if needed.
  const pillarDir = path.dirname(file);
  await fs.mkdir(pillarDir, { recursive: true });

  // Build frontmatter.
  const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);
  const frontmatter = [
    "---",
    `title: "${title}"`,
    summary ? `summary: "${summary}"` : null,
    status === "published" ? `date: "${new Date().toISOString().split("T")[0]}"` : null,
    scheduledAt ? `scheduledAt: "${scheduledAt}"` : null,
    `status: ${status}`,
    featured ? "featured: true" : null,
    tags.length ? `tags: [${tags.map(t => `"${t}"`).join(", ")}]` : null,
    "---",
    "",
  ].filter(Boolean).join("\n");

  const content = `${frontmatter}\n\n${body}`;
  // Title is in frontmatter - don't add # Title in body
  await fs.writeFile(file, content, "utf8");

  if (action === "preview") {
    // Preserve the original preview behavior: redirect to the public article
    // route. The article may not be public yet (the draft boundary belongs
    // to S03); this redirect only navigates.
    redirect(`/blog/${pillar}/${slug}`);
  }

  // Say what was created, including the final identity when a name was generated or
  // stepped past a taken one.
  redirect(`/admin/new?created=${encodeURIComponent(`${pillar}/${slug}`)}`);
}
