// src/app/blog/[[...slug]]/page.tsx
import path from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";
import { findPublicMdxDoc, loadMDX } from "@/lib/mdx";
import { isPubliclyVisible } from "@/lib/content";
import type { Frontmatter } from "@/types/content";
import MdxServer from "@/components/mdx/MdxServer";
import CaseStudyLayout from "@/components/layout/CaseStudyLayout";
import ContentCard from "@/components/listing/ContentCard";
import {
  absoluteUrl,
  buildMetadata,
  escapeForScriptTag,
} from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;

  // Empty = /blog (root)
  if (!slug || slug.length === 0) {
    return buildMetadata({
      title: "Blog",
      description: "Notes and essays on communications, AI, and community systems.",
      canonicalPath: "/blog",
    });
  }

  // /blog/ai/post - individual post
  if (slug.length === 2) {
    const [pillar, articleSlug] = slug;
    const doc = await findPublicMdxDoc<Frontmatter>("blog", articleSlug, pillar);
    if (!doc) return {};
    return buildMetadata({
      title: doc.frontmatter.title,
      description: doc.frontmatter.summary,
      canonicalPath: `/blog/${pillar}/${articleSlug}`,
      article: {
        publishedTime: doc.frontmatter.date ?? doc.frontmatter.scheduledAt,
        authors: ["Steven Pajewski"],
        section: pillar.charAt(0).toUpperCase() + pillar.slice(1),
      },
    });
  }

  // /blog/ai - pillar page
  if (slug.length === 1) {
    const pillar = slug[0];
    return buildMetadata({
      title: pillar.charAt(0).toUpperCase() + pillar.slice(1),
      description: `Articles about ${pillar}`,
      canonicalPath: `/blog/${pillar}`,
    });
  }

  return {};
}

// Load all blog posts (publicly visible only — drafts and future items
// must never appear in list, detail, related, sitemap, or any other
// public surface).
async function loadAllBlogPosts() {
  const base = path.join(process.cwd(), "src", "content", "blog");
  let pillars: string[] = [];
  try {
    pillars = await fs_readdir(base);
  } catch {
    return [];
  }

  const allDocs: Array<{
    slug: string;
    pillar: string;
    frontmatter: Frontmatter;
    content: string;
  }> = [];

  for (const pillar of pillars) {
    const pillarPath = path.join(base, pillar);
    let isDir = false;
    try {
      const stat = await fs_stat(pillarPath);
      isDir = stat.isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const docs = await loadMDX<Frontmatter>("blog", pillar);
    for (const doc of docs) {
      allDocs.push({
        slug: doc.slug,
        pillar,
        frontmatter: doc.frontmatter,
        content: doc.content,
      });
    }
  }

  return allDocs;
}

// Light fs shims so this file remains ESM-friendly without top-level
// imports that confuse some bundlers.
async function fs_readdir(p: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  return readdir(p);
}
async function fs_stat(p: string): Promise<import("node:fs").Stats> {
  const { stat } = await import("node:fs/promises");
  return stat(p);
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;

  // Root /blog - show all posts (public only)
  if (!slug || slug.length === 0) {
    const allDocs = await loadAllBlogPosts();
    const allPillars = [...new Set(allDocs.map((d) => d.pillar))];
    allDocs.sort((a, b) => {
      const aDate = a.frontmatter.scheduledAt || a.frontmatter.date || "";
      const bDate = b.frontmatter.scheduledAt || b.frontmatter.date || "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    return (
      <div className="container-index py-[var(--space-7)]">
        <h1 className="measure-prose">Blog</h1>
        <p className="meta mt-[var(--space-2)] measure-prose">
          Notes and essays on communications, AI, and community systems.
        </p>

        <div className="mt-[var(--space-4)] flex flex-wrap gap-[var(--space-2)]">
          {allPillars.map((p) => (
            <Link
              key={p}
              href={`/blog/${p}`}
              className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 no-underline hover:border-ink"
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Link>
          ))}
        </div>

        <div className="mt-[var(--space-6)] grid gap-[var(--space-6)] sm:grid-cols-2 lg:grid-cols-3">
          {allDocs.map((d) => (
            <ContentCard
              key={`${d.pillar}-${d.slug}`}
              doc={{
                slug: `${d.pillar}/${d.slug}`,
                frontmatter: d.frontmatter,
                content: d.content,
              }}
              href={`/blog/${d.pillar}/${d.slug}`}
              tagBase="/blog"
            />
          ))}
        </div>
      </div>
    );
  }

  // /blog/ai/post - individual post. Drafts and unknown-status articles
  // are denied here as well as in metadata.
  if (slug.length === 2) {
    const [pillar, articleSlug] = slug;
    const doc = await findPublicMdxDoc<Frontmatter>("blog", articleSlug, pillar);
    if (!doc) notFound();

    const { frontmatter, content } = doc;
    const canonicalPath = `/blog/${pillar}/${articleSlug}`;
    if (!isPubliclyVisible(frontmatter)) notFound();

    // Related posts from same pillar, public only.
    const pillarDocs = await loadMDX<Frontmatter>("blog", pillar);
    const related = pillarDocs
      .filter((d) => d.slug !== articleSlug)
      .slice(0, 3)
      .map((d) => ({
        title: d.frontmatter.title,
        slug: `${pillar}/${d.slug}`,
        summary: d.frontmatter.summary,
        hero: d.frontmatter.hero,
      }));

    // JSON-LD structured data. Escaped for safe inclusion inside an
    // HTML <script> element.
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: frontmatter.title,
      description: frontmatter.summary,
      datePublished: frontmatter.date || frontmatter.scheduledAt,
      author: { "@type": "Person", name: "Steven Pajewski" },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": absoluteUrl(canonicalPath),
      },
      image: frontmatter.hero,
    };
    const jsonLdSafe = escapeForScriptTag(JSON.stringify(jsonLd));

    return (
      <article className="relative">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe }}
        />
        <CaseStudyLayout
          frontmatter={frontmatter}
          related={related}
          basePath="/blog"
        >
          {/* Server-rendered article body. Initial HTML payload contains
              the substantive content; no client-side fetch required. */}
          <MdxServer source={content} />
        </CaseStudyLayout>
      </article>
    );
  }

  // /blog/ai - pillar page (list of public posts in that pillar)
  if (slug.length === 1) {
    const pillar = slug[0];
    const allDocs = await loadAllBlogPosts();
    const pillarDocs = allDocs.filter(
      (d) =>
        d.pillar.toLowerCase() === pillar.toLowerCase() &&
        isPubliclyVisible(d.frontmatter),
    );
    const allPillars = [...new Set(allDocs.map((d) => d.pillar))];

    pillarDocs.sort((a, b) => {
      const aDate = a.frontmatter.scheduledAt || a.frontmatter.date || "";
      const bDate = b.frontmatter.scheduledAt || b.frontmatter.date || "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    return (
      <div className="container-index py-[var(--space-7)]">
        <h1 className="measure-prose">
          Blog · {pillar.charAt(0).toUpperCase() + pillar.slice(1)}
        </h1>
        <p className="meta mt-[var(--space-2)] measure-prose">
          Articles about {pillar}
        </p>

        <div className="mt-[var(--space-4)] flex flex-wrap gap-[var(--space-2)]">
          <Link
            href="/blog"
            className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 no-underline hover:border-ink"
          >
            All
          </Link>
          {allPillars.map((p) => (
            <Link
              key={p}
              href={`/blog/${p}`}
              className={`meta rounded-[var(--radius-chip)] border px-[var(--space-2)] py-0.5 no-underline ${
                p.toLowerCase() === pillar.toLowerCase()
                  ? "border-ink bg-accent text-on-accent"
                  : "border-rule hover:border-ink"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Link>
          ))}
        </div>

        <div className="mt-[var(--space-6)] grid gap-[var(--space-6)] sm:grid-cols-2 lg:grid-cols-3">
          {pillarDocs.map((d) => (
            <ContentCard
              key={`${d.pillar}-${d.slug}`}
              doc={{
                slug: `${d.pillar}/${d.slug}`,
                frontmatter: d.frontmatter,
                content: d.content,
              }}
              href={`/blog/${d.pillar}/${d.slug}`}
              tagBase="/blog"
            />
          ))}
        </div>
      </div>
    );
  }

  notFound();
}