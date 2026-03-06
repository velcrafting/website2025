// src/app/admin/edit/page.tsx - Edit existing article
import fs from "fs";
import path from "path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

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
  
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Edit Article</h1>
      
      <form action={save} className="space-y-4">
        <input type="hidden" name="pillar" value={pillar} />
        <input type="hidden" name="slug" value={slug} />
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Pillar</label>
            <select name="newPillar" defaultValue={pillar} className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700">
              {pillars.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input name="newSlug" defaultValue={slug} className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input name="title" defaultValue={article.frontmatter.title || ""} className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" required />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Summary</label>
          <textarea name="summary" rows={2} defaultValue={article.frontmatter.summary || ""} className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Tags</label>
          <input name="tags" defaultValue={article.frontmatter.tags?.replace(/[\[\]"]/g, "") || ""} placeholder="ai, security, framework" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" defaultValue={article.frontmatter.status || "draft"} className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700">
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
          <textarea name="body" rows={15} defaultValue={article.body} className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm dark:bg-neutral-800 dark:border-neutral-700" />
        </div>
        
        <div className="flex gap-4">
          <button type="submit" name="action" value="save" className="rounded bg-neutral-900 px-6 py-2 text-white hover:bg-neutral-800">
            Save Changes
          </button>
          <Link href="/admin/blog" className="rounded border border-neutral-300 px-6 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

async function save(formData: FormData) {
  "use server";
  const pillar = formData.get("pillar")?.toString();
  const slug = formData.get("slug")?.toString();
  const newPillar = formData.get("newPillar")?.toString() || pillar;
  const newSlug = formData.get("newSlug")?.toString()?.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const title = formData.get("title")?.toString() || "Untitled";
  const summary = formData.get("summary")?.toString() || "";
  const tagsStr = formData.get("tags")?.toString() || "";
  const status = formData.get("status")?.toString() || "draft";
  const featured = formData.get("featured")?.toString() === "true";
  const body = formData.get("body")?.toString() || "";
  
  if (!pillar || !slug || !newSlug) return;
  
  // Build frontmatter
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
  
  // Delete old file if pillar/slug changed
  if (newPillar !== pillar || newSlug !== slug) {
    const oldPath = path.join(process.cwd(), "src", "content", "blog", pillar, `${slug}.mdx`);
    await fs.unlink(oldPath).catch(() => {});
  }
  
  // Write new file
  const newPath = path.join(process.cwd(), "src", "content", "blog", (newPillar || pillar), `${newSlug || slug}.mdx`);
  await fs.mkdir(path.join(process.cwd(), "src", "content", "blog", newPillar || pillar), { recursive: true });
  await fs.writeFile(newPath, content, "utf8");
  
  redirect("/admin/blog");
}
