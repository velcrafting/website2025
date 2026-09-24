import { notFound } from "next/navigation";
import { findPublicMdxDoc, loadMDX } from "@/lib/mdx";
import { CaseStudyLayout } from "@/components/layout";
import MdxServer from "@/components/mdx/MdxServer";
import type { Frontmatter } from "@/types/content";
import {
  AUTHOR_NAME,
  SITE_URL,
  articleSchemas,
  buildMetadata,
  escapeForScriptTag,
  personSchema,
} from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await findPublicMdxDoc<Frontmatter>("projects", slug);
  if (!doc) return {};
  const fm = doc.frontmatter;
  return buildMetadata({
    title: fm.title,
    description: fm.summary,
    canonicalPath: `/projects/${slug}`,
    article: {
      publishedTime: fm.date,
      authors: [AUTHOR_NAME],
      section: "Projects",
    },
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const doc = await findPublicMdxDoc<Frontmatter>("projects", slug);
  if (!doc || !doc.frontmatter?.title) return notFound();
  const fm = doc.frontmatter;
  const canonicalPath = `/projects/${slug}`;
  const schemas = articleSchemas({
    title: fm.title,
    description: fm.summary,
    canonicalPath,
    image: fm.ogImage || fm.hero,
    datePublished: fm.date,
    section: "Projects",
    tags: fm.tags,
  });

  const ldBlog = escapeForScriptTag(JSON.stringify(schemas.blogPosting));
  const ldTech = escapeForScriptTag(JSON.stringify(schemas.techArticle));
  const ldBread = escapeForScriptTag(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Projects", item: `${SITE_URL}/projects` },
        { "@type": "ListItem", position: 3, name: fm.title, item: `${SITE_URL}/projects/${slug}` },
      ],
    }),
  );
  const ldAuthor = escapeForScriptTag(JSON.stringify(personSchema()));

  // Related posts from the same kind, public only.
  const allProjects = await loadMDX<Frontmatter>("projects");
  const tags = new Set((fm.tags ?? []).map((t) => t.toLowerCase()));
  const related = allProjects
    .filter((d) => d.slug !== slug)
    .map((d) => {
      const dt = d.frontmatter.date ? Date.parse(d.frontmatter.date) : 0;
      const t = new Set((d.frontmatter.tags ?? []).map((x) => x.toLowerCase()));
      const overlap = Array.from(tags).reduce(
        (acc, tag) => acc + (t.has(tag) ? 1 : 0),
        0,
      );
      return { d, score: overlap * 1000000000 + dt };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ d }) => ({
      slug: d.slug,
      title: d.frontmatter.title || d.slug,
      summary: d.frontmatter.summary,
      hero: d.frontmatter.hero,
    }));

  return (
    <CaseStudyLayout frontmatter={fm} related={related} basePath="/projects">
      {/* Plain <script> elements, not next/script: structured data must be in
          the initial HTML payload, and next/script defers it out of the
          server-rendered document. */}
      <script
        id="ld-breadcrumb-projects"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldBread }}
      />
      <script
        id="ld-author-projects"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldAuthor }}
      />
      <script
        id="ld-blog-projects"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldBlog }}
      />
      <script
        id="ld-tech-projects"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldTech }}
      />
      <MdxServer source={doc.content} />
    </CaseStudyLayout>
  );
}
