import type { Doc, Frontmatter } from "@/types/content";

const OWNER = process.env.NEXT_PUBLIC_MICROS_OWNER || "velcrafting";

type RegistryRow = {
  slug: string;
  title?: string;
  desc?: string;
  base?: string;   // pages base
  updated?: string;
  tags?: string[];
};

type GitHubRepo = { name?: string };
type LabJson = { title?: string; summary?: string; desc?: string; tags?: unknown };

async function tryFetch(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, cache: "force-cache", next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

export async function loadMicros(): Promise<Doc<Frontmatter>[]> {
  // 1) Try central registry if present
  const regUrl = `https://${OWNER}.github.io/registry.json`;
  const regRes = await tryFetch(regUrl, { headers: { Accept: "application/json" } });
  let rows: RegistryRow[] = [];
  if (regRes) {
    try { rows = await regRes.json(); } catch { rows = []; }
  }

  // 2) If no registry, fall back to GitHub repo listing heuristic
  if (!rows.length) {
    const reposRes = await tryFetch(`https://api.github.com/users/${OWNER}/repos?per_page=100`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (reposRes) {
      const reposUnknown = (await reposRes.json()) as unknown;
      if (Array.isArray(reposUnknown)) {
        rows = (reposUnknown as GitHubRepo[])
          .map((r) => (typeof r.name === "string" && r.name ? { slug: r.name } : null))
          .filter((x): x is RegistryRow => !!x);
      }
    }
  }

  // 3) Validate by checking for lab.json and read details
  const candidates = rows.filter((r) => r.slug && typeof r.slug === "string");
  const docs: Doc<Frontmatter>[] = [];
  await Promise.all(
    candidates.map(async ({ slug, title, desc, tags }) => {
      const base = `https://${OWNER}.github.io/${slug}`;
      const labRes = await tryFetch(`${base}/lab.json`, { headers: { Accept: "application/json" } });
      if (!labRes) return;
      let lab: LabJson = {};
      try {
        const parsed = (await labRes.json()) as unknown;
        if (parsed && typeof parsed === "object") lab = parsed as LabJson;
      } catch {}
      const fm: Frontmatter = {
        title: lab.title || title || slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (m: string) => m.toUpperCase()),
        summary: lab.summary || desc || lab.desc || undefined,
        hero: `/labs/${slug}/thumbnail.svg`,
        tags: Array.isArray(lab.tags)
          ? (lab.tags.filter((t): t is string => typeof t === "string"))
          : (Array.isArray(tags) ? tags : []),
      };
      docs.push({ slug, frontmatter: fm, content: "" });
    })
  );

  // Latest first by best effort (lab.json updated or default)
  return docs.sort((a, b) => (b.frontmatter.title || "").localeCompare(a.frontmatter.title || ""));
}
