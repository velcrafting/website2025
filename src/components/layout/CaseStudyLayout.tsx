// src/components/layout/CaseStudyLayout.tsx
"use client";
import ProjectKPISection from "@/components/projects/ProjectKPISection";
import Figure from "@/components/mdx/Figure";
import type { Frontmatter } from "@/types/content";

type Props = { frontmatter: Frontmatter; children: React.ReactNode };

export default function CaseStudyLayout({ frontmatter, children }: Props) {
  return (
    <div className="w-full py-10">
      <article className="prose prose-neutral dark:prose-invert max-w-none" data-toc-root>
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

        {frontmatter.hero ? (
          <Figure src={frontmatter.hero} alt={frontmatter.title} priority />
        ) : null}

        <ProjectKPISection items={frontmatter.kpi} />
        {children}
      </article>
    </div>
  );
}
