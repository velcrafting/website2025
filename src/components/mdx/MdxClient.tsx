// src/components/mdx/MdxClient.tsx
"use client";
import { useEffect, useState } from "react";
import type { MDXComponents } from "mdx/types";
import { mdxComponents } from "./mdx-components";

type MDXComponent = React.ComponentType<{ components?: MDXComponents }>;
type Props = { slug: string; dir?: "projects" | "writing" | "labs" };

export default function MdxClient({ slug, dir = "projects" }: Props) {
  const [Comp, setComp] = useState<MDXComponent | null>(null);

  useEffect(() => {
    let mounted = true;

    const loaders = {
      projects: () =>
        import(`@/content/projects/${slug}.mdx`) as Promise<{ default: MDXComponent }>,
      writing: () =>
        import(`@/content/writing/${slug}.mdx`) as Promise<{ default: MDXComponent }>,
      labs: () =>
        import(`@/content/labs/${slug}.mdx`) as Promise<{ default: MDXComponent }>,
    } as const;

    loaders[dir]()
      .then(m => { if (mounted) setComp(() => m.default); })
      .catch(err => console.error("Failed to load MDX:", err));

    return () => { mounted = false; };
  }, [slug, dir]);

  if (!Comp) return null;
  return <Comp components={mdxComponents} />;
}
