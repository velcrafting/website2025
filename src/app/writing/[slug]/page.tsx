// src/app/writing/[slug]/page.tsx
import { notFound } from "next/navigation";
import { loadMDX } from "@/lib/mdx";
import { CaseStudyLayout } from "@/components/layout";
import MdxClient from "@/components/mdx/MdxClient";
import type { Frontmatter } from "@/types/content";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docs = await loadMDX<Frontmatter>("writing");
  const doc = docs.find(d => d.slug === slug);
  if (!doc) return {};
  const fm = doc.frontmatter;
  const og = fm.ogImage || fm.hero || undefined;
  return buildMetadata({ title: fm.title, description: fm.summary, ogImage: og });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docs = await loadMDX<Frontmatter>("writing");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc || !doc.frontmatter?.title) return notFound();

  return (
    <CaseStudyLayout frontmatter={doc.frontmatter}>
      <MdxClient slug={slug} dir="writing" />
    </CaseStudyLayout>
  );
}
