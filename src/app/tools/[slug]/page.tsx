import { redirect } from "next/navigation";
import { findPublicMdxDoc, loadMDX } from "@/lib/mdx";
import { CaseStudyLayout } from "@/components/layout";
import ToolLaunch from "@/components/listing/ToolLaunch";
import MdxServer from "@/components/mdx/MdxServer";
import { parseReadmeBlocks } from "@/lib/readme-blocks";
import { readToolReadme } from "@/lib/github/tool-readme";
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
  const doc = await findPublicMdxDoc<Frontmatter>("labs", slug);
  if (!doc) return {};
  const fm = doc.frontmatter;
  const og = fm.ogImage || fm.hero || undefined;
  return buildMetadata({
    title: fm.title,
    description: fm.summary,
    ogImage: og,
    canonicalPath: `/tools/${slug}`,
    article: {
      publishedTime: fm.date,
      authors: [AUTHOR_NAME],
      section: "Tools",
    },
  });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await findPublicMdxDoc<Frontmatter>("labs", slug);
  if (!doc || !doc.frontmatter?.title) {
    // Fallback: redirect to the GitHub Pages micro-site for any slug
    // that doesn't have a corresponding public MDX doc. This avoids
    // hitting the generic proxy route, which could lead to redirect
    // loops if the micro site navigates back to `/tools/${slug}`.
    const owner = process.env.NEXT_PUBLIC_MICROS_OWNER || "velcrafting";
    return redirect(`https://${owner}.github.io/${slug}/`);
  }
  const fm = doc.frontmatter;
  const canonicalPath = `/tools/${slug}`;
  const schemas = articleSchemas({
    title: fm.title,
    description: fm.summary,
    canonicalPath,
    image: fm.ogImage || fm.hero,
    datePublished: fm.date,
    section: "Tools",
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
        { "@type": "ListItem", position: 2, name: "Labs", item: `${SITE_URL}/tools` },
        { "@type": "ListItem", position: 3, name: fm.title, item: `${SITE_URL}/tools/${slug}` },
      ],
    }),
  );
  const ldAuthor = escapeForScriptTag(JSON.stringify(personSchema()));

  const allLabs = await loadMDX<Frontmatter>("labs");
  const tags = new Set((fm.tags ?? []).map((t) => t.toLowerCase()));
  const related = allLabs
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

  /*
    The tool's own README, rendered inline (docs/implementation_plan_Sep16.md §3).

    `readToolReadme` reuses the existing public-read path — no second fetcher — and applies the
    approved-owner boundary and a byte bound measured on the real body. Every non-ok status (read
    failed, over the bound, no approved repo, empty body) leaves `readme` empty, and `ToolLaunch`
    then renders the buttons and nothing else. The page therefore cannot be broken by an upstream
    that is down, and it never renders an empty reader in place of one. The read is not wrapped in
    a catch-all: `readToolReadme` is total, and swallowing a real throw here would hide a defect.
  */
  const readmeRead = fm.repo ? await readToolReadme(fm.repo, fetch) : null;
  const readmeOk = readmeRead && readmeRead.status === "ok" ? readmeRead : null;
  const readmeBlocks = readmeOk ? parseReadmeBlocks(readmeOk.text) : [];
  const readme = readmeBlocks.length ? readmeBlocks : null;

  return (
    <CaseStudyLayout frontmatter={fm} related={related} basePath="/tools" cover="hide" contentWidth="wide">
      {/* Plain <script> elements, not next/script: structured data must be in
          the initial HTML payload, and next/script defers it out of the
          server-rendered document. */}
      <script
        id="ld-breadcrumb-labs"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldBread }}
      />
      <script
        id="ld-author-tools"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldAuthor }}
      />
      <script
        id="ld-blog-tools"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldBlog }}
      />
      <script
        id="ld-tech-tools"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldTech }}
      />
      {/* The tool detail uses the wide shared tool measure; the body stays above the launch actions. */}
      <MdxServer source={doc.content} />

      <ToolLaunch
        title={fm.title}
        repo={fm.repo}
        liveUrl={fm.liveUrl}
        readme={readme}
        readmeSource={readmeOk?.url}
        readmeBytes={readmeOk?.bytes}
      />

    </CaseStudyLayout>
  );
}
