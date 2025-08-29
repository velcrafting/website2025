import { loadMDX } from "@/lib/mdx";
import type { Frontmatter } from "@/types/content";
import ContentCard from "@/components/listing/ContentCard";
import FilterBar from "@/components/listing/FilterBar";
import FeaturedStrip from "@/components/listing/FeaturedStrip";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Labs",
    description: "Experimental prototypes and WIP tools.",
    canonicalPath: "/labs",
  });

export default async function Page({ searchParams }: { searchParams?: Promise<{ tag?: string; q?: string; sort?: string; view?: string }> }) {
  const params = (await searchParams) ?? {};
  const tag = params.tag?.toLowerCase();
  const docs = await loadMDX<Frontmatter>("labs");

  if (!docs.length) {
    return (
      <div className="w-full py-10">
        <h1 className="text-2xl font-semibold">Labs</h1>
        <p className="mt-2 text-neutral-500">Experimental prototypes and WIP tools. No entries yet.</p>
      </div>
    );
  }

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
      <h1 className="text-2xl font-semibold">Labs{tag ? ` · #${tag}` : ""}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Experimental prototypes and WIP tools.</p>
      <FilterBar allTags={allTags} placeholder="Search labs..." />
      <FeaturedStrip items={featured} base="/labs" />
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <ContentCard key={d.slug} doc={d} href={`/labs/${d.slug}`} tagBase="/labs" variant={view === "compact" ? "compact" : "default"} />
        ))}
      </div>
    </div>
  );
}
