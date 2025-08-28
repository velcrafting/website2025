// src/components/layout/CaseStudyLayout.tsx
"use client";
import ProjectKPISection from "@/components/projects/ProjectKPISection";
import Figure from "@/components/mdx/Figure";
import type { Frontmatter } from "@/types/content";
import Image from "next/image";
import Link from "next/link";

type RelatedItem = { slug: string; title: string; summary?: string; hero?: string };
type Props = { frontmatter: Frontmatter; children: React.ReactNode; related?: RelatedItem[]; basePath?: "/writing" | "/projects" | "/labs" };

export default function CaseStudyLayout({ frontmatter, related, children, basePath = "/writing" }: Props) {
  return (
    <div className="w-full py-10">
      <article className="prose max-w-none" data-toc-root>
        <h1>{frontmatter.title}</h1>

        {frontmatter.summary && (
          <p className="text-neutral-600 dark:text-neutral-400">{frontmatter.summary}</p>
        )}

        {frontmatter.date && (
          <p className="mt-1 text-sm text-neutral-500">
            {new Date(frontmatter.date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "2-digit",
            })}
          </p>
        )}

        {frontmatter.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {frontmatter.tags.map((t) => (
              <Link
                key={t}
                href={`${basePath}?tag=${encodeURIComponent(t)}`}
                className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                #{t}
              </Link>
            ))}
          </div>
        ) : null}

        {frontmatter.hero ? (
          <Figure src={frontmatter.hero} alt={frontmatter.title} priority />
        ) : null}

        <ProjectKPISection items={frontmatter.kpi} />
        {children}
      </article>

      {/* Read more section */}
      {related && related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Read more</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((it) => (
              <Link
                key={it.slug}
                href={`/writing/${it.slug}`}
                className="block overflow-hidden rounded-xl border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                {it.hero ? (
                  <Image
                    src={it.hero}
                    alt={it.title}
                    width={800}
                    height={450}
                    sizes="(min-width: 1024px) 360px, 100vw"
                    className="mb-3 h-40 w-full rounded-lg object-cover"
                  />)
                : null}
                <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{it.title}</div>
                {it.summary ? (
                  <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3">{it.summary}</div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
