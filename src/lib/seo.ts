import type { Metadata } from "next";
import { SITE } from "@/config/site";

const DEPLOYMENT_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
export const SITE_URL =
  process.env.VERCEL_ENV === "preview" && DEPLOYMENT_URL
    ? DEPLOYMENT_URL
    : process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.velcrafting.com";
export const SHARE_CARD_TITLE = "Steven Pajewski · You can call me vel";
export const SHARE_CARD_DESCRIPTION =
  "Things I’m making. Ideas I’m researching. Helping you understand, identify opportunities for, and implement AI in your business.";
export const SHARE_CARD_IMAGE =
  `/opengraph-image?v=${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}`;
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

// Escape a string so it is safe to embed inside an HTML <script>
// element. JSON-encoding (used by JSON.stringify) does NOT escape the
// sequence "</script", so we must substitute it explicitly. This is the
// standard OWASP guidance for inlining JSON-LD into HTML.
export function escapeForScriptTag(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildMetadata(opts: {
  title: string;
  description?: string;
  canonicalPath?: string; // e.g. "/blog/my-post"
  article?: {
    publishedTime?: string;
    authors?: string[];
    section?: string;
  };
}): Metadata {
  const fullTitle = titleize(opts.title);
  const publishedTime = normalizeIsoDate(opts.article?.publishedTime);

  return {
    title: fullTitle,
    description: opts.description,
    alternates: opts.canonicalPath ? { canonical: opts.canonicalPath } : undefined,
    openGraph: {
      type: opts.article ? "article" : "website",
      title: SHARE_CARD_TITLE,
      description: SHARE_CARD_DESCRIPTION,
      url: opts.canonicalPath ? absoluteUrl(opts.canonicalPath) : undefined,
      images: [SHARE_CARD_IMAGE],
      publishedTime,
      authors: opts.article?.authors,
      section: opts.article?.section,
    },
    twitter: {
      card: "summary_large_image",
      title: SHARE_CARD_TITLE,
      description: SHARE_CARD_DESCRIPTION,
      images: [SHARE_CARD_IMAGE],
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
  const image = absoluteUrl(opts.image ?? SHARE_CARD_IMAGE);
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
