// next.config.ts
import type { NextConfig } from "next";
import createMDX from "@next/mdx";

import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import remarkFootnotes from "remark-footnotes";
import remarkEmoji from "remark-gemoji";
import remarkCodeTitles from "remark-code-titles";

import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrism from "rehype-prism-plus";
// Note: removed rehype-pretty-code (Shiki) to avoid potential
// build/dev hangs and simplify the MDX pipeline. If you want
// syntax highlighting later, consider rehype-highlight or
// re-adding rehype-pretty-code with a pinned Shiki version.

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      remarkCodeTitles,
      remarkGfm,
      remarkFrontmatter,
      [remarkMdxFrontmatter, { name: "frontmatter" }],
      [remarkFootnotes, { inlineNotes: true }],
      [remarkEmoji, { accessible: true, emoticon: false }],
    ],
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "wrap",
          properties: { className: ["anchor"] },
        },
      ],
      [rehypePrism, { showLineNumbers: true }],
    ],
  },
});

const config: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  experimental: { mdxRs: false },
  // Optional. Helps Vercel tracing when repo is in a subfolder locally.
  outputFileTracingRoot: process.cwd(),
};

export default withMDX(config);
