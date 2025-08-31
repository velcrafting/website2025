import { notFound, redirect } from "next/navigation";
import { loadMDX } from "@/lib/mdx";
import { CaseStudyLayout } from "@/components/layout";
import MdxClient from "@/components/mdx/MdxClient";
import type { Frontmatter } from "@/types/content";
import { buildMetadata } from "@/lib/seo";
import Script from "next/script";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docs = await loadMDX<Frontmatter>("labs");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return {};
  const fm = doc.frontmatter;
  const og = fm.ogImage || fm.hero || undefined;
  return buildMetadata({ title: fm.title, description: fm.summary, ogImage: og, canonicalPath: `/labs/${slug}` });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docs = await loadMDX<Frontmatter>("labs");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc || !doc.frontmatter?.title) {
    // Fallback: if this slug corresponds to a micro hosted on GitHub Pages,
    // redirect to the internal proxy so client navigation works.
    const owner = process.env.NEXT_PUBLIC_MICROS_OWNER || "velcrafting";
    const base = `https://${owner}.github.io/${slug}`;
    try {
      const resLab = await fetch(`${base}/lab.json`, { method: "HEAD", cache: "no-store" });
      if (resLab.ok) return redirect(`/labs/micro/${slug}/`);
      const resIdx = await fetch(`${base}/index.html`, { method: "HEAD", cache: "no-store" });
      if (resIdx.ok) return redirect(`/labs/micro/${slug}/`);
    } catch {
      // ignore; fall through to notFound
    }
    return notFound();
  }

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
      <Script id="ld-breadcrumb-labs" type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" },
              { "@type": "ListItem", position: 2, name: "Labs", item: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/labs` },
              { "@type": "ListItem", position: 3, name: doc.frontmatter.title, item: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/labs/${slug}` },
            ],
          }),
        }}
      />
      <MdxClient slug={slug} dir="labs" />
    </CaseStudyLayout>
  );
}
