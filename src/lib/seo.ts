import type { Metadata } from "next";
import { SITE } from "@/config/site";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.velcrafting.com";
export const AUTHOR_NAME = "Steven Pajewski";
export const AUTHOR_SAME_AS = [SITE.links.linkedin, SITE.links.github].filter(Boolean);
export const PERSON_ID = `${SITE_URL}/#person`;
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

function normalizeIsoDate(date?: string): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function titleize(s: string) {
  return s ? `${s} · Steven Pajewski` : "Steven Pajewski";
}

export function buildMetadata(opts: {
  title: string;
  description?: string;
  ogImage?: string;
  canonicalPath?: string; // e.g. "/blog/my-post"
  article?: {
    publishedTime?: string;
    authors?: string[];
    section?: string;
  };
}): Metadata {
  const fullTitle = titleize(opts.title);
  const og = opts.ogImage ?? `/og?title=${encodeURIComponent(opts.title)}`;
  const publishedTime = normalizeIsoDate(opts.article?.publishedTime);

  return {
    title: fullTitle,
    description: opts.description,
    alternates: opts.canonicalPath ? { canonical: opts.canonicalPath } : undefined,
    openGraph: {
      type: opts.article ? "article" : "website",
      title: fullTitle,
      description: opts.description,
      url: opts.canonicalPath ? absoluteUrl(opts.canonicalPath) : undefined,
      images: [og],
      publishedTime,
      authors: opts.article?.authors,
      section: opts.article?.section,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: opts.description,
      images: [og],
    },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE.name,
    url: SITE_URL,
    logo: absoluteUrl("/about/logos/velcrafting.png"),
    sameAs: AUTHOR_SAME_AS,
  };
}

export function personSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    name: AUTHOR_NAME,
    url: absoluteUrl("/about"),
    image: absoluteUrl("/avatar.png"),
    email: SITE.email,
    sameAs: AUTHOR_SAME_AS,
    worksFor: { "@id": ORGANIZATION_ID },
  };
}

export function articleSchemas(opts: {
  title: string;
  description?: string;
  canonicalPath: string;
  image?: string;
  datePublished?: string;
  section: string;
  tags?: string[];
}) {
  const url = absoluteUrl(opts.canonicalPath);
  const publishedTime = normalizeIsoDate(opts.datePublished);
  const image = absoluteUrl(opts.image ?? `/og?title=${encodeURIComponent(opts.title)}`);
  const common = {
    "@context": "https://schema.org",
    headline: opts.title,
    description: opts.description,
    url,
    mainEntityOfPage: url,
    image: [image],
    author: { "@id": PERSON_ID },
    publisher: { "@id": ORGANIZATION_ID },
    keywords: opts.tags?.join(", "),
    datePublished: publishedTime,
    dateModified: publishedTime,
    articleSection: opts.section,
  };

  return {
    blogPosting: {
      ...common,
      "@type": "BlogPosting",
      "@id": `${url}#blogposting`,
    },
    techArticle: {
      ...common,
      "@type": "TechArticle",
      "@id": `${url}#techarticle`,
    },
  };
}
