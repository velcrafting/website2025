// src/components/mdx/MdxClient.tsx
"use client";
import { useEffect, useState } from "react";
import type { MDXComponents } from "mdx/types";
import { mdxComponents } from "./mdx-components";

type MDXComponent = React.ComponentType<{ components?: MDXComponents }>;
type Props = { slug: string; dir?: "projects" | "blog" | "labs"; pillar?: string };

export default function MdxClient({ slug, dir = "projects", pillar }: Props) {
  const [Comp, setComp] = useState<MDXComponent | null>(null);

  useEffect(() => {
    let mounted = true;

    // For blog, construct path with pillar if provided
    const blogPath = pillar ? `blog/${pillar}/${slug}.mdx` : `blog/${slug}.mdx`;

    const loaders = {
      projects: () =>
        import(`@/content/projects/${slug}.mdx`) as Promise<{ default: MDXComponent }>,
      blog: () =>
        import(`@/content/${blogPath}`) as Promise<{ default: MDXComponent }>,
      labs: () =>
        import(`@/content/labs/${slug}.mdx`) as Promise<{ default: MDXComponent }>,
      tools: () =>
        import(`@/content/tools/${slug}.mdx`) as Promise<{ default: MDXComponent }>,
    } as const;

    loaders[dir]()
      .then(m => { if (mounted) setComp(() => m.default); })
      .catch(err => console.error("Failed to load MDX:", err));

    return () => { mounted = false; };
  }, [slug, dir, pillar]);

  if (!Comp) return null;
  return <Comp components={mdxComponents} />;
}
