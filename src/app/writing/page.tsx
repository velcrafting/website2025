// src/app/writing/page.tsx
import { loadMDX } from "@/lib/mdx";
import type { Frontmatter } from "@/types/content";
import ContentCard from "@/components/listing/ContentCard";
import FilterBar from "@/components/listing/FilterBar";
import FeaturedStrip from "@/components/listing/FeaturedStrip";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Writing",
    description: "Notes and essays on communications, AI, and community systems.",
    canonicalPath: "/writing",
  });

export default async function Page({ searchParams }: { searchParams?: Promise<{ tag?: string; q?: string; sort?: string; view?: string }> }) {
  const params = (await searchParams) ?? {};
  const tag = params.tag?.toLowerCase();
  const docs = await loadMDX<Frontmatter>("writing");
  const filtered = docs.filter((d) => {
    const okTag = tag ? (d.frontmatter.tags ?? []).map((t) => t.toLowerCase()).includes(tag) : true;
    const q = params.q?.toLowerCase()?.trim();
    const okQ = q
      ? [d.frontmatter.title, d.frontmatter.summary, (d.frontmatter.tags ?? []).join(" ")]
          .filter(Boolean)
          .join("\n")
          .toLowerCase()
          .includes(q)
      : true;
    return okTag && okQ;
  });
  const allTags = docs.flatMap((d) => d.frontmatter.tags ?? []);
  const sort = params.sort || "new";
  const view = params.view || "grid";
  filtered.sort((a, b) => {
    if (sort === "alpha") return (a.frontmatter.title || a.slug).localeCompare(b.frontmatter.title || b.slug);
    if (sort === "tags") return (b.frontmatter.tags?.length || 0) - (a.frontmatter.tags?.length || 0);
    const ad = a.frontmatter.date ? Date.parse(a.frontmatter.date) : 0;
    const bd = b.frontmatter.date ? Date.parse(b.frontmatter.date) : 0;
    return bd - ad;
  });
  const featured = docs.filter((d) => d.frontmatter.featured === true);

  return (
    <div className="w-full py-10">
      <h1 className="text-2xl font-semibold">Writing{tag ? ` · #${tag}` : ""}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Notes and essays on communications, AI, and community systems.</p>
      <FilterBar allTags={allTags} placeholder="Search writing..." />
      <FeaturedStrip items={featured} base="/writing" />
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <ContentCard key={d.slug} doc={d} href={`/writing/${d.slug}`} tagBase="/writing" variant={view === "compact" ? "compact" : "default"} />
        ))}
      </div>
    </div>
  );
}
