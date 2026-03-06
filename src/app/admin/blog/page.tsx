// src/app/admin/blog/page.tsx - Manage blog articles
import fs from "fs";
import path from "path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

async function getArticles() {
  const blogDir = path.join(process.cwd(), "src", "content", "blog");
  const articles: Array<{ pillar: string; slug: string; title: string; status: string; date: string }> = [];
  
  try {
    const pillars = await fsPromises.readdir(blogDir, { withFileTypes: true });
    for (const pillar of pillars) {
      const pillarPath = path.join(blogDir, pillar);
      const stat = await stat(pillarPath);
      if (!stat.isDirectory()) continue;
      
      const files = await fsPromises.readdir(pillarPath);
      for (const file of files) {
        if (!file.endsWith(".mdx")) continue;
        
        const slug = file.replace(".mdx", "");
        const filePath = path.join(pillarPath, file);
        const content = await readFile(filePath, "utf8");
        
        // Parse frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        let title = slug;
        let status = "draft";
        let date = "";
        
        if (match) {
          const fm = match[1];
          const titleMatch = fm.match(/title:\s*"([^"]+)"/);
          const statusMatch = fm.match(/status:\s*(\w+)/);
          const dateMatch = fm.match(/date:\s*"?([^"\n]+)"?/);
          
          if (titleMatch) title = titleMatch[1];
          if (statusMatch) status = statusMatch[1];
          if (dateMatch) date = dateMatch[1];
        }
        
        articles.push({ pillar, slug, title, status, date });
      }
    }
  } catch {}
  
  return articles;
}

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  
  const articles = await getArticles();
  
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Manage Blog</h1>
          <p className="text-neutral-600">Edit or delete articles</p>
        </div>
        <Link href="/admin/new" className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800">
          New Article
        </Link>
      </div>
      
      {/* Group by pillar */}
      {["ai", "systems", "communications", "about"].map(pillar => {
        const pillarArticles = articles.filter(a => a.pillar === pillar);
        if (pillarArticles.length === 0) return null;
        
        return (
          <div key={pillar} className="space-y-2">
            <h2 className="text-lg font-medium capitalize">{pillar}</h2>
            <div className="space-y-2">
              {pillarArticles.map(article => (
                <div key={`${article.pillar}-${article.slug}`} className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div>
                    <Link href={`/blog/${article.pillar}/${article.slug}`} className="font-medium hover:underline">
                      {article.title}
                    </Link>
                    <div className="flex gap-2 text-sm text-neutral-500">
                      <span className={`px-2 py-0.5 rounded-full ${
                        article.status === "published" ? "bg-emerald-100 text-emerald-700" :
                        article.status === "scheduled" ? "bg-amber-100 text-amber-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>{article.status}</span>
                      {article.date && <span>{article.date}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/edit?pillar=${article.pillar}&slug=${article.slug}`} className="text-sm text-blue-600 hover:underline">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      
      {articles.length === 0 && (
        <p className="text-neutral-500">No articles yet. Create your first one!</p>
      )}
    </div>
  );
}
