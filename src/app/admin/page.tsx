// src/app/admin/page.tsx - Admin dashboard
import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

async function getStats() {
  const contentDir = path.join(process.cwd(), "src", "content");
  const stats = {
    blog: { pillars: 0, articles: 0 },
    projects: 0,
    labs: 0,
  };
  
  // Blog stats
  try {
    const blogDir = path.join(contentDir, "blog");
    const pillars = await fs.readdir(blogDir);
    stats.blog.pillars = pillars.length;
    for (const pillar of pillars) {
      const pillarPath = path.join(blogDir, pillar);
      const stat = await fs.stat(pillarPath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(pillarPath);
        stats.blog.articles += files.filter(f => f.endsWith(".mdx")).length;
      }
    }
  } catch {}
  
  // Projects
  try {
    const projectsDir = path.join(contentDir, "projects");
    const files = await fs.readdir(projectsDir);
    stats.projects = files.filter(f => f.endsWith(".mdx")).length;
  } catch {}
  
  // Labs
  try {
    const labsDir = path.join(contentDir, "labs");
    const files = await fs.readdir(labsDir);
    stats.labs = files.filter(f => f.endsWith(".mdx")).length;
  } catch {}
  
  return stats;
}

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  
  const stats = await getStats();
  
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Manage your content</p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-3xl font-bold">{stats.blog.articles}</div>
          <div className="text-sm text-neutral-600">Blog Articles</div>
          <div className="text-xs text-neutral-500">{stats.blog.pillars} pillars</div>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-3xl font-bold">{stats.projects}</div>
          <div className="text-sm text-neutral-600">Projects</div>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-3xl font-bold">{stats.labs}</div>
          <div className="text-sm text-neutral-600">Lab Tools</div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Content</h2>
        <div className="grid grid-cols-2 gap-4">
          <Link href="/admin/new" className="rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
            <div className="font-medium">New Article</div>
            <div className="text-sm text-neutral-600">Create a new blog post</div>
          </Link>
          <Link href="/admin/blog" className="rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
            <div className="font-medium">Manage Blog</div>
            <div className="text-sm text-neutral-600">Edit or delete existing posts</div>
          </Link>
        </div>
      </div>
      
      {/* Recent articles could go here */}
    </div>
  );
}
