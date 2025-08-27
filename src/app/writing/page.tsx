import { loadMDX } from "@/lib/mdx";
import type { Frontmatter } from "@/types/content";
import { WritingCard } from "@/components/writing";

export default async function Page() {
  const docs = await loadMDX<Frontmatter>("writing");
  return (
    <div className="w-full py-10 grid gap-6 md:grid-cols-2">
      {docs.map((d) => (
        <WritingCard key={d.slug} doc={d} />
      ))}
    </div>
  );
}