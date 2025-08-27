// src/lib/content.ts
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Doc, Frontmatter } from "@/types/content";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");
const EXTS = new Set([".md", ".mdx"]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function toSlug(fullPath: string, kind: "projects" | "writing" | "labs"): string {
  const rel = path.relative(path.join(CONTENT_ROOT, kind), fullPath);
  const noExt = rel.replace(path.extname(rel), "");
  return noExt.split(path.sep).join("/");
}

function coerceFrontmatter(data: unknown): Frontmatter {
  // Minimal safe coercion without using any
  const d = (data ?? {}) as Record<string, unknown>;
  const fm: Frontmatter = {
    title: typeof d.title === "string" ? d.title : "",
    summary: typeof d.summary === "string" ? d.summary : undefined,
    date: typeof d.date === "string" ? d.date : undefined,
    hero: typeof d.hero === "string" ? d.hero : undefined,
    ogImage: typeof d.ogImage === "string" ? d.ogImage : undefined,
    tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : undefined,
    // kpi is optional and typed
    kpi: Array.isArray(d.kpi) ? (d.kpi as Frontmatter["kpi"]) : undefined,
  };
  return fm;
}

async function loadKind(kind: "projects" | "writing" | "labs"): Promise<Doc<Frontmatter>[]> {
  const base = path.join(CONTENT_ROOT, kind);
  let files: string[] = [];
  try {
    files = await walk(base);
  } catch {
    return [];
  }

  const docs: Doc<Frontmatter>[] = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const { data, content } = matter(raw);            // ← grab content here
    const frontmatter = coerceFrontmatter(data);
    if (!frontmatter.title) continue;

    docs.push({
      slug: toSlug(file, kind),
      frontmatter,
      content,                                       // ← include content to satisfy Doc
    });
  }
  return docs;
}

export async function allProjects() { return loadKind("projects"); }
export async function allWriting()  { return loadKind("writing"); }
export async function allLabs()     { return loadKind("labs"); }