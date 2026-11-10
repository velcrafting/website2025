import Workspace from "@/components/layout/Workspace";
// src/app/admin/edit/page.tsx - Edit existing article
import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin, requireAdmin } from "@/lib/admin";
import {
  assertSafeRawName,
  normalizeContentName,
  resolveSafeContentPath,
  resolveSafeExistingContentPath,
  filesystemContentWritesEnabled,
} from "@/lib/content-paths";

// Get pillars
async function getPillars() {
  try {
    const blogDir = path.join(process.cwd(), "src", "content", "blog");
    const entries = await fs.readdir(blogDir);
    const pillars: string[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(blogDir, entry));
      if (stat.isDirectory()) pillars.push(entry);
    }
    return pillars;
  } catch {
    return [];
  }
}

// Get article content
async function getArticle(pillar: string, slug: string) {
  const filePath = path.join(process.cwd(), "src", "content", "blog", pillar, `${slug}.mdx`);
  try {
    const content = await fs.readFile(filePath, "utf8");
    // Parse frontmatter and body
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
      const fmStr = match[1];
      const body = match[2];
      const fm: Record<string, string> = {};

      fmStr.split("\n").forEach(line => {
        const [key, ...vals] = line.split(":");
        if (key && vals.length) {
          fm[key.trim()] = vals.join(":").trim().replace(/^"|"$/g, "");
        }
      });

      return { frontmatter: fm, body };
    }
    return { frontmatter: {}, body: content };
  } catch {
    return null;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ pillar?: string; slug?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");

  const params = await searchParams;
  const pillar = params.pillar || "";
  const slug = params.slug || "";

  if (!pillar || !slug) {
    redirect("/admin/blog");
  }

  const pillars = await getPillars();
  const article = await getArticle(pillar, slug);

  if (!article) {
    redirect("/admin/blog");
  }

  if (!filesystemContentWritesEnabled()) {
    return (
      <Workspace measure="form">
        <h1 className="text-2xl font-semibold">File-backed article is read-only</h1>
        <p className="mt-3 text-sm text-muted">Hosted mode preserves this filesystem source and disables edits here. Create and edit database-backed drafts in the revision editor.</p>
        <p className="mt-4"><Link className="underline" href="/admin/editor">Open the revision editor</Link></p>
        <h2 className="mt-8 text-xl font-semibold">Current source</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded border border-rule p-3 text-sm">{article.body}</pre>
      </Workspace>
    );
  }

  return (
    <Workspace measure="form">
      <h1 className="text-2xl font-semibold">Edit Article</h1>

      <form action={save} className="space-y-4">
        <input type="hidden" name="pillar" value={pillar} />
        <input type="hidden" name="slug" value={slug} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Pillar</label>
            <select name="newPillar" defaultValue={pillar} className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2">
              {pillars.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input name="newSlug" defaultValue={slug} className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input name="title" defaultValue={article.frontmatter.title || ""} className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Summary</label>
          <textarea name="summary" rows={2} defaultValue={article.frontmatter.summary || ""} className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tags</label>
          <input name="tags" defaultValue={article.frontmatter.tags?.replace(/[\[\]"]/g, "") || ""} placeholder="ai, security, framework" className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" defaultValue={article.frontmatter.status || "draft"} className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2">
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Featured</label>
            <input type="checkbox" name="featured" value="true" defaultChecked={article.frontmatter.featured === "true"} className="mr-2" />
            <span className="text-sm">Show on homepage</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Body (Markdown)</label>
          <textarea name="body" rows={15} defaultValue={article.body} className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-3 py-2 font-mono text-sm" />
        </div>

        <div className="flex gap-4">
          <button type="submit" name="action" value="save" className="rounded-[var(--radius-surface)] bg-accent px-6 py-2 text-on-accent hover:bg-forest">
            Save Changes
          </button>
          <Link href="/admin/blog" className="rounded-[var(--radius-surface)] border border-[var(--input)] px-6 py-2 hover:bg-paper-raised">
            Cancel
          </Link>
        </div>
      </form>
    </Workspace>
  );
}

// (Raw-name validation and normalization live in src/lib/content-paths.ts.)

async function save(formData: FormData) {
  "use server";
  // Recheck authorization immediately before any side effect.
  await requireAdmin();
  if (!filesystemContentWritesEnabled()) redirect("/admin/new?status=legacy_write_disabled");

  const pillarRaw = formData.get("pillar")?.toString() || "";
  const slugRaw = formData.get("slug")?.toString() || "";
  const newPillarRaw = formData.get("newPillar")?.toString() || pillarRaw;
  const newSlugRaw = formData.get("newSlug")?.toString() || "";
  const title = formData.get("title")?.toString() || "Untitled";
  const summary = formData.get("summary")?.toString() || "";
  const tagsStr = formData.get("tags")?.toString() || "";
  const status = formData.get("status")?.toString() || "draft";
  const featured = formData.get("featured")?.toString() === "true";
  const body = formData.get("body")?.toString() || "";

  if (!pillarRaw || !slugRaw || !newSlugRaw) {
    redirect("/admin/blog");
  }

  // Validate dangerous syntax on every raw name, then normalize. Reject
  // separators / traversal / NUL / encoded forms before rewrite so
  // dangerous inputs cannot be laundered into safe-looking names.
  try {
    assertSafeRawName(pillarRaw, "pillar");
    assertSafeRawName(slugRaw, "slug");
    assertSafeRawName(newPillarRaw, "newPillar");
    assertSafeRawName(newSlugRaw, "newSlug");
  } catch {
    redirect("/admin/blog");
  }

  let pillar: string;
  let slug: string;
  let newPillar: string;
  let newSlug: string;
  try {
    pillar = normalizeContentName(pillarRaw, "pillar");
    slug = normalizeContentName(slugRaw, "slug");
    newPillar = normalizeContentName(newPillarRaw, "newPillar");
    newSlug = normalizeContentName(newSlugRaw, "newSlug");
  } catch {
    redirect("/admin/blog");
  }

  // Validate the *original* (existing) path before any unlink.
  let oldRealFile: string | null = null;
  try {
    oldRealFile = await resolveSafeExistingContentPath(
      path.join(process.cwd(), "src", "content"),
      pillar,
      slug,
      ".mdx",
    );
  } catch {
    redirect("/admin/blog");
  }

  // Validate the *target* path before any write or unlink.
  let newFile: string;
  try {
    newFile = await resolveSafeContentPath(
      path.join(process.cwd(), "src", "content"),
      newPillar,
      newSlug,
      ".mdx",
    );
  } catch {
    redirect("/admin/blog");
  }

  // Build frontmatter.
  const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);
  const frontmatter = [
    "---",
    `title: "${title}"`,
    summary ? `summary: "${summary}"` : null,
    status === "published" ? `date: "${new Date().toISOString().split("T")[0]}"` : null,
    `status: ${status}`,
    featured ? "featured: true" : null,
    tags.length ? `tags: [${tags.map(t => `"${t}"`).join(", ")}]` : null,
    "---",
    "",
  ].filter(Boolean).join("\n");

  const content = `${frontmatter}\n\n${body}`;

  // Delete old file only after the new path is validated and only when the
  // rename actually changes the path on disk.
  const oldIntended = path.join(process.cwd(), "src", "content", "blog", pillar, `${slug}.mdx`);
  const rename = oldIntended !== newFile;
  if (rename && oldRealFile) {
    await fs.unlink(oldRealFile).catch(() => {});
  }

  // Write new file.
  const pillarDir = path.dirname(newFile);
  await fs.mkdir(pillarDir, { recursive: true });
  await fs.writeFile(newFile, content, "utf8");

  redirect("/admin/blog");
}
