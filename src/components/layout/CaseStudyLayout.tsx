// src/components/layout/CaseStudyLayout.tsx
//
// Concept 03: token colours, hairline rules instead of the bordered card grid,
// and the article respects the shared reading measure. The TOC root hook, the
// Figure/ProjectKPISection composition, the related-items list and the basePath
// tag links are all unchanged.
"use client";
import ProjectKPISection from "@/components/projects/ProjectKPISection";
import Figure from "@/components/mdx/Figure";
import type { Frontmatter } from "@/types/content";
import { formatDateOnly, isoDateOnly } from "@/lib/format-date";
import Image from "next/image";
import Link from "next/link";

type RelatedItem = { slug: string; title: string; summary?: string; hero?: string };
type Props = {
  frontmatter: Frontmatter;
  children: React.ReactNode;
  related?: RelatedItem[];
  basePath?: "/blog" | "/projects" | "/labs" | "/tools";
  cover?: "show" | "hide";
  contentWidth?: "reading" | "wide";
};

export default function CaseStudyLayout({ frontmatter, related, children, basePath = "/blog", cover = "show", contentWidth = "reading" }: Props) {
  return (
    <div className="container-page py-[var(--space-7)]">
      {/*
        `prose` carries the 60–70 character reading measure and `mx-auto` CENTERS the
        reading region in the available width. Before this, the measure was applied
        but the region stayed left-anchored, leaving ~730px of dead space on a 1440px
        desktop. VELCRAFTING_DESIGN_PRINCIPLES.md allows either centering or balancing
        with a rail; centering is used here because the "on this page" navigation
        already lives in the site sidebar.
      */}
      <article
        className={`prose mx-auto ${contentWidth === "wide" ? "" : "lg:max-w-[76ch]"}`}
        style={contentWidth === "wide" ? { maxWidth: "var(--measure-index)" } : undefined}
        data-toc-root
      >
        <h1>{frontmatter.title}</h1>

        {frontmatter.summary && <p className="lead">{frontmatter.summary}</p>}

        {frontmatter.date && (
          <p className="meta mt-[var(--space-1)]">
            {/* One shared date-only policy. The list and this detail page must
                render the same calendar day, so both call formatDateOnly and
                neither constructs a Date from a date-only string. */}
            <time dateTime={isoDateOnly(frontmatter.date)}>
              {formatDateOnly(frontmatter.date)}
            </time>
          </p>
        )}

        {frontmatter.tags?.length ? (
          <p className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
            {frontmatter.tags.map((t) => (
              <Link
                key={t}
                href={`${basePath}?tag=${encodeURIComponent(t)}`}
                className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 no-underline hover:bg-paper-raised"
              >
                #{t}
              </Link>
            ))}
          </p>
        ) : null}

        {frontmatter.hero && cover === "show" ? (
          <Figure src={frontmatter.hero} alt={frontmatter.title} priority />
        ) : null}

        <ProjectKPISection items={frontmatter.kpi} />
        {children}
      </article>

      {/* Read more: rule-topped entries, not a bordered card grid. */}
      {related && related.length > 0 ? (
        <section className="mt-[var(--space-7)]">
          <h2>Read more</h2>
          <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
            {related.map((it) => (
              <Link
                key={it.slug}
                href={`/blog/${it.slug}`}
                className="block border-t border-rule pt-[var(--space-3)] no-underline hover:border-ink"
              >
                {it.hero ? (
                  <Image
                    src={it.hero}
                    alt={it.title}
                    width={800}
                    height={450}
                    sizes="(min-width: 1024px) 360px, 100vw"
                    className="mb-[var(--space-3)] h-40 w-full rounded-[var(--radius-surface)] object-cover"
                  />
                ) : null}
                <span className="block font-semibold text-ink">{it.title}</span>
                {it.summary ? (
                  <span className="meta mt-[var(--space-1)] line-clamp-3 block">{it.summary}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
