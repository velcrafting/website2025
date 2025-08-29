// src/lib/seo.ts  (move file here if you prefer keeping lib utils together)
import type { Metadata } from "next";

export function titleize(s: string) {
  return s ? `${s} · Steven Pajewski` : "Steven Pajewski";
}

export function buildMetadata(opts: {
  title: string;
  description?: string;
  ogImage?: string;
  canonicalPath?: string; // e.g. "/writing/my-post"
}): Metadata {
  const fullTitle = titleize(opts.title);
  const og = opts.ogImage ?? `/og?title=${encodeURIComponent(opts.title)}`;
  return {
    title: fullTitle,
    description: opts.description,
    alternates: opts.canonicalPath ? { canonical: opts.canonicalPath } : undefined,
    openGraph: {
      title: fullTitle,
      description: opts.description,
      images: [og],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: opts.description,
      images: [og],
    },
  };
}
