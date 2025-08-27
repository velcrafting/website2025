import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Doc } from "@/types/content";

// Safe extractor for optional date without using `any`
function fmDate(fm: unknown): string {
  if (typeof fm === "object" && fm !== null && "date" in fm) {
    const d = (fm as { date?: unknown }).date;
    return typeof d === "string" ? d : "";
  }
  return "";
}

export async function loadMDX<T extends object = Record<string, unknown>>(
  dir: "projects" | "writing"
): Promise<Doc<T>[]> {
  const base = path.join(process.cwd(), "src", "content", dir);

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
  return docs.sort((a, b) => fmDate(b.frontmatter).localeCompare(fmDate(a.frontmatter)));
}