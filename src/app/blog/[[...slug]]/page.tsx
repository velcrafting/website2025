// src/app/blog/[[...slug]]/page.tsx
import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadMDX } from "@/lib/mdx";
import type { Frontmatter } from "@/types/content";
import MdxClient from "@/components/mdx/MdxClient";
import CaseStudyLayout from "@/components/layout/CaseStudyLayout";
import ContentCard from "@/components/listing/ContentCard";
import { buildMetadata } from "@/lib/seo";

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
    const docs = await loadMDX<Frontmatter>("blog", pillar);
    const doc = docs.find((d) => d.slug === articleSlug);
    if (!doc) return {};
    return buildMetadata({
      title: doc.frontmatter.title,
      description: doc.frontmatter.summary,
      canonicalPath: `/blog/${pillar}/${articleSlug}`,
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

function getStatus(frontmatter: Frontmatter): "draft" | "scheduled" | "published" {
  if (frontmatter.status) return frontmatter.status;
  if (frontmatter.scheduledAt) {
    const scheduled = new Date(frontmatter.scheduledAt);
    const now = new Date();
    return scheduled <= now ? "published" : "scheduled";
  }
  if (frontmatter.date) return "published";
  return "draft";
}

// Load all blog posts
async function loadAllBlogPosts() {
  const base = path.join(process.cwd(), "src", "content", "blog");
  const pillars = await fs.readdir(base);
  
  const allDocs: Array<{ slug: string; pillar: string; frontmatter: Frontmatter; content: string }> = [];
  
  for (const pillar of pillars) {
    const pillarPath = path.join(base, pillar);
    const stat = await fs.stat(pillarPath);
    if (!stat.isDirectory()) continue;
    
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

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  
  // Root /blog - show all posts
  if (!slug || slug.length === 0) {
    const allDocs = await loadAllBlogPosts();
    const allPillars = [...new Set(allDocs.map(d => d.pillar))];
    const publishedDocs = allDocs.filter(d => getStatus(d.frontmatter) === "published");
    
    publishedDocs.sort((a, b) => {
      const aDate = a.frontmatter.scheduledAt || a.frontmatter.date || "";
      const bDate = b.frontmatter.scheduledAt || b.frontmatter.date || "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    
    return (
      <div className="w-full py-10">
        <h1 className="text-2xl font-semibold">Blog</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Notes and essays on communications, AI, and community systems.</p>
        
        <div className="mt-4 flex gap-2">
          {allPillars.map(p => (
            <Link key={p} href={`/blog/${p}`} className="text-sm px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Link>
          ))}
        </div>
        
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {publishedDocs.map((d) => (
            <ContentCard 
              key={`${d.pillar}-${d.slug}`} 
              doc={{ slug: `${d.pillar}/${d.slug}`, frontmatter: d.frontmatter, content: d.content }} 
              href={`/blog/${d.pillar}/${d.slug}`} 
              tagBase="/blog" 
            />
          ))}
        </div>
      </div>
    );
  }
  
  // /blog/ai/post - individual post
  if (slug.length === 2) {
    const [pillar, articleSlug] = slug;
    const docs = await loadMDX<Frontmatter>("blog", pillar);
    const doc = docs.find((d) => d.slug === articleSlug);

    if (!doc) {
      notFound();
    }

    const { frontmatter } = doc;
    const canonicalPath = `/blog/${pillar}/${articleSlug}`;

    // Get related posts from same pillar
    const allDocs = await loadMDX<Frontmatter>("blog", pillar);
    const related = allDocs
      .filter((d) => d.slug !== articleSlug)
      .slice(0, 3)
      .map((d) => ({
        title: d.frontmatter.title,
        slug: `${pillar}/${d.slug}`,
        summary: d.frontmatter.summary,
        hero: d.frontmatter.hero,
      }));

    // JSON-LD structured data
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: frontmatter.title,
      description: frontmatter.summary,
      datePublished: frontmatter.date || frontmatter.scheduledAt,
      author: { "@type": "Person", name: "Steven Pajewski" },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalPath },
      image: frontmatter.hero,
    };

    return (
      <article className="relative">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <CaseStudyLayout frontmatter={frontmatter} related={related} basePath="/blog">
          <MdxClient slug={articleSlug} dir="blog" pillar={pillar} />
        </CaseStudyLayout>
      </article>
    );
  }
  
  // /blog/ai - pillar page (list of posts in that pillar)
  if (slug.length === 1) {
    const pillar = slug[0];
    const allDocs = await loadAllBlogPosts();
    const pillarDocs = allDocs.filter(d => d.pillar.toLowerCase() === pillar.toLowerCase() && getStatus(d.frontmatter) === "published");
    
    // Get all pillars for navigation
    const allPillars = [...new Set(allDocs.map(d => d.pillar))];
    
    pillarDocs.sort((a, b) => {
      const aDate = a.frontmatter.scheduledAt || a.frontmatter.date || "";
      const bDate = b.frontmatter.scheduledAt || b.frontmatter.date || "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    return (
      <div className="w-full py-10">
        <h1 className="text-2xl font-semibold">Blog · {pillar.charAt(0).toUpperCase() + pillar.slice(1)}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Articles about {pillar}
        </p>
        
        <div className="mt-4 flex gap-2">
          <Link href="/blog" className="text-sm px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">All</Link>
          {allPillars.map(p => (
            <Link 
              key={p} 
              href={`/blog/${p}`} 
              className={`text-sm px-3 py-1 rounded-full ${p.toLowerCase() === pillar.toLowerCase() ? 'bg-neutral-900 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Link>
          ))}
        </div>
        
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pillarDocs.map((d) => (
            <ContentCard 
              key={`${d.pillar}-${d.slug}`} 
              doc={{ slug: `${d.pillar}/${d.slug}`, frontmatter: d.frontmatter, content: d.content }} 
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
