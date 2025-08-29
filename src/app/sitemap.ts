// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { allProjects, allWriting, allLabs } from "@/lib/content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, priority: 1, changeFrequency: "weekly", lastModified: new Date() },
    { url: `${base}/about`, priority: 0.8, changeFrequency: "monthly", lastModified: new Date() },
    { url: `${base}/projects`, priority: 0.7, changeFrequency: "weekly", lastModified: new Date() },
    { url: `${base}/writing`, priority: 0.6, changeFrequency: "weekly", lastModified: new Date() },
    { url: `${base}/labs`, priority: 0.6, changeFrequency: "weekly", lastModified: new Date() },
    { url: `${base}/contact`, priority: 0.5, changeFrequency: "yearly", lastModified: new Date() },
    { url: `${base}/art`, priority: 0.4, changeFrequency: "monthly", lastModified: new Date() },
  ];

  const [projects, writing, labs] = await Promise.all([
    allProjects(),
    allWriting(),
    allLabs(),
  ]);

  const mapDocs = (docs: Awaited<ReturnType<typeof allProjects>>, prefix: string, priority = 0.6): MetadataRoute.Sitemap =>
    docs.map((d) => ({
      url: `${base}/${prefix}/${d.slug}`,
      priority,
      changeFrequency: "monthly",
      lastModified: d.frontmatter.date ? new Date(d.frontmatter.date) : new Date(),
    }));

  return [
    ...staticRoutes,
    ...mapDocs(projects, "projects", 0.7),
    ...mapDocs(writing, "writing", 0.5),
    ...mapDocs(labs, "labs", 0.5),
  ];
}

