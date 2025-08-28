import { notFound } from "next/navigation";
import { loadMDX } from "@/lib/mdx";
import { CaseStudyLayout } from "@/components/layout";
import MdxClient from "@/components/mdx/MdxClient";
import type { Frontmatter } from "@/types/content";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docs = await loadMDX<Frontmatter>("labs");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc || !doc.frontmatter?.title) return notFound();

  const tags = new Set((doc.frontmatter.tags ?? []).map((t) => t.toLowerCase()));
  const related = docs
    .filter((d) => d.slug !== slug)
    .map((d) => {
      const dt = d.frontmatter.date ? Date.parse(d.frontmatter.date) : 0;
      const t = new Set((d.frontmatter.tags ?? []).map((x) => x.toLowerCase()));
      const overlap = Array.from(tags).reduce((acc, tag) => acc + (t.has(tag) ? 1 : 0), 0);
      return { d, score: overlap * 1000000000 + dt };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ d }) => ({ slug: d.slug, title: d.frontmatter.title || d.slug, summary: d.frontmatter.summary, hero: d.frontmatter.hero }));

  return (
    <CaseStudyLayout frontmatter={doc.frontmatter} related={related} basePath="/labs">
      <MdxClient slug={slug} dir="labs" />
    </CaseStudyLayout>
  );
}
