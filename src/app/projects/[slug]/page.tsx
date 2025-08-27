import { notFound } from "next/navigation";
import { loadMDX } from "@/lib/mdx";
import { CaseStudyLayout } from "@/components/layout";
import MdxClient from "@/components/mdx/MdxClient";
import type { Frontmatter } from "@/types/content";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const docs = await loadMDX<Frontmatter>("projects");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc || !doc.frontmatter?.title) return notFound();

  return (
    <CaseStudyLayout frontmatter={doc.frontmatter}>
      <MdxClient slug={slug} />
    </CaseStudyLayout>
  );
}
