import { loadMDX } from "@/lib/mdx";
import type { Frontmatter } from "@/types/content";
import { ProjectCard } from "@/components/projects";

export default async function Page() {
  const docs = await loadMDX<Frontmatter>("projects");
  return (
    <div className="w-full py-10 grid gap-6 md:grid-cols-2">
      {docs.map((d) => (
        <ProjectCard key={d.slug} doc={d} />
      ))}
    </div>
  );
}