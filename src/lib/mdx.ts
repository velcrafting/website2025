import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Doc, Frontmatter } from "@/types/content";
import { isPubliclyVisible } from "@/lib/content";

// Safe extractor for optional date without using `any`.
// Duck-typed so a Date from another realm is still recognised.
function fmDate(fm: unknown): string {
  if (typeof fm === "object" && fm !== null && "date" in fm) {
    const d = (fm as { date?: unknown }).date;
    if (typeof d === "string") return d;
    if (d instanceof Date) return d.toISOString();
    if (
      typeof d === "object" &&
      d !== null &&
      typeof (d as { toISOString?: unknown }).toISOString === "function"
    ) {
      return (d as Date).toISOString();
    }
  }
  return "";
}

export async function loadMDX<T extends object = Record<string, unknown>>(
  dir: "projects" | "blog" | "labs",
  pillar?: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<Doc<T>[]> {
  let base = path.join(process.cwd(), "src", "content", dir);
  if (pillar) {
    base = path.join(base, pillar);
  }

  let files: string[] = [];
  try {
    files = await fs.readdir(base);
  } catch {
    return [];
  }

  const docs: Doc<T>[] = [];
  for (const f of files) {
    if (!f.endsWith(".mdx")) continue;
    const raw = await fs.readFile(path.join(base, f), "utf8");
    const { data, content } = matter(raw);
    docs.push({
      slug: f.replace(/\.mdx$/, ""),
      frontmatter: data as unknown as T,
      content,
    });
  }

  // Sort by frontmatter.date if present
  docs.sort((a, b) => fmDate(b.frontmatter).localeCompare(fmDate(a.frontmatter)));

  // Public content is the default. Every current consumer of loadMDX is a
  // public reader (blog/projects/tools lists and details, related links,
  // sitemap). Drafts, future-scheduled items and unknown-status content
  // are dropped unless a caller explicitly opts in with
  // `{ includeDrafts: true }` (reserved for a non-public editor surface).
  if (!opts.includeDrafts) {
    return docs.filter((d) =>
      isPubliclyVisible(d.frontmatter as unknown as Frontmatter),
    );
  }
  return docs;
}

// Single-doc visibility-aware lookup. Returns null when the file does
// not exist OR when it is not publicly visible.
export async function findPublicMdxDoc<T extends object = Frontmatter>(
  dir: "projects" | "blog" | "labs",
  slug: string,
  pillar?: string,
): Promise<Doc<T> | null> {
  let base = path.join(process.cwd(), "src", "content", dir);
  if (pillar) base = path.join(base, pillar);
  const file = path.join(base, `${slug}.mdx`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as unknown as Frontmatter;
  if (!isPubliclyVisible(fm)) return null;
  return { slug, frontmatter: data as unknown as T, content };
}