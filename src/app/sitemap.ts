// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { allProjects, allWriting, allLabs } from "@/lib/content";
import { loadMicros } from "@/lib/micros";
import { SITE_URL } from "@/lib/seo";

function safeDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function latestDate(values: Array<{ frontmatter: { date?: string } }>, fallback: Date): Date {
  const dates = values
    .map((doc) => safeDate(doc.frontmatter.date))
    .filter((date): date is Date => !!date)
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0] ?? fallback;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const now = new Date();

  const [projects, writing, labs, micros] = await Promise.all([
    allProjects(),
    allWriting(),
    allLabs(),
    loadMicros(),
  ]);

  const toolsBySlug = new Map([...labs, ...micros].map((doc) => [doc.slug, doc]));
  const tools = Array.from(toolsBySlug.values());

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, priority: 1, changeFrequency: "weekly", lastModified: now },
    { url: `${base}/about`, priority: 0.8, changeFrequency: "monthly", lastModified: now },
    { url: `${base}/projects`, priority: 0.7, changeFrequency: "weekly", lastModified: latestDate(projects, now) },
    { url: `${base}/blog`, priority: 0.6, changeFrequency: "weekly", lastModified: latestDate(writing, now) },
    { url: `${base}/tools`, priority: 0.6, changeFrequency: "weekly", lastModified: latestDate(tools, now) },
    { url: `${base}/contact`, priority: 0.5, changeFrequency: "yearly", lastModified: now },
    { url: `${base}/art`, priority: 0.4, changeFrequency: "monthly", lastModified: now },
  ];

  const mapDocs = (
    docs: Array<{ slug: string; frontmatter: { date?: string } }>,
    prefix: string,
    priority = 0.6,
    changeFrequency: "daily" | "weekly" | "monthly" | "yearly" = "monthly"
  ): MetadataRoute.Sitemap =>
    docs.map((d) => ({
      url: `${base}/${prefix}/${d.slug}`,
      priority,
      changeFrequency,
      lastModified: safeDate(d.frontmatter.date) ?? now,
    }));

  return [
    ...staticRoutes,
    ...mapDocs(projects, "projects", 0.7, "monthly"),
    ...mapDocs(writing, "blog", 0.6, "monthly"),
    ...mapDocs(tools, "tools", 0.5, "monthly"),
  ];
}
