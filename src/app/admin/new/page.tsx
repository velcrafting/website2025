// src/app/admin/new/page.tsx - CMS for creating blog articles with pillars
import fs from "fs";
import path from "path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

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

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  
  const pillars = await getPillars();
  
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Create Article</h1>
      
      <form action={create} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Pillar</label>
            <select name="pillar" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" required>
              {pillars.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
              <option value="__new__">+ New Pillar</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New Pillar Name</label>
            <input name="newPillar" placeholder="e.g., security" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Slug</label>
          <input name="slug" placeholder="article-slug" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" required />
          <p className="text-xs text-neutral-500 mt-1">URL: /blog/[pillar]/[slug]</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input name="title" placeholder="Article title" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" required />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Summary</label>
          <textarea name="summary" rows={2} placeholder="Brief description" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Tags</label>
          <input name="tags" placeholder="ai, security, framework (comma separated)" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700">
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Date</label>
            <input type="datetime-local" name="scheduledAt" className="w-full rounded border border-neutral-300 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700" />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Featured</label>
          <input type="checkbox" name="featured" value="true" className="mr-2" />
          <span className="text-sm text-neutral-600">Show on homepage</span>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Body (Markdown/MDX)</label>
          <textarea name="body" rows={15} placeholder="Write your article in Markdown..." className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm dark:bg-neutral-800 dark:border-neutral-700" />
        </div>
        
        <div className="flex gap-4">
          <button type="submit" name="action" value="save" className="rounded bg-neutral-900 px-6 py-2 text-white hover:bg-neutral-800">
            Save Article
          </button>
          <button type="submit" name="action" value="preview" className="rounded border border-neutral-300 px-6 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Preview
          </button>
        </div>
      </form>
    </div>
  );
}

async function create(formData: FormData) {
  "use server";
  const action = formData.get("action")?.toString();
  
  let pillar = formData.get("pillar")?.toString();
  const newPillar = formData.get("newPillar")?.toString()?.toLowerCase();
  const slug = formData.get("slug")?.toString()?.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const title = formData.get("title")?.toString() || "Untitled";
  const summary = formData.get("summary")?.toString() || "";
  const tagsStr = formData.get("tags")?.toString() || "";
  const status = formData.get("status")?.toString() || "draft";
  const scheduledAt = formData.get("scheduledAt")?.toString();
  const featured = formData.get("featured")?.toString() === "true";
  const body = formData.get("body")?.toString() || "";
  
  if (!slug) return;
  
  // Handle new pillar
  if (pillar === "__new__" && newPillar) {
    pillar = newPillar;
  }
  
  if (!pillar) pillar = "general";
  
  // Create pillar directory if needed
  const pillarDir = path.join(process.cwd(), "src", "content", "blog", pillar);
  await fs.mkdir(pillarDir, { recursive: true });
  
  // Build frontmatter
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
  const file = path.join(pillarDir, `${slug}.mdx`);
  await fs.writeFile(file, content, "utf8");
  
  if (action === "preview") {
    // Would redirect to preview - for now just go to article
    redirect(`/blog/${pillar}/${slug}`);
  }
  
  redirect("/admin");
}
