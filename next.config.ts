// next.config.ts
import type { NextConfig } from "next";
import createMDX from "@next/mdx";

import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import remarkFootnotes from "remark-footnotes";
import remarkEmoji from "remark-gemoji";

import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";

const prettyCodeOptions = {
  theme: { dark: "github-dark", light: "github-light" },
  keepBackground: false,
  defaultLang: "ts",
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
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
      [rehypePrettyCode, prettyCodeOptions],
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
