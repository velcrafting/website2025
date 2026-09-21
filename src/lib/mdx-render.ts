// src/lib/mdx-render.ts
//
// Non-executable MDX/Markdown renderer for public article bodies.
//
// Why this exists: `@mdx-js/mdx` `evaluate`/`compile` require *trusted* input.
// It runs `export` initialisers, JSX expressions and imports. The CMS
// POST/PUT route and the admin create form write author-supplied bodies into
// the same content tree the public detail routes render, so evaluation there
// is an author-to-server-code boundary (see GATE_A_REVIEW finding 2).
//
// This module renders the same content without ever compiling or evaluating
// JavaScript:
//   1. Parse Markdown+MDX to an AST (`remark-parse` + `remark-mdx`). Parsing
//      is not execution.
//   2. Remove executable node kinds at the AST level (`mdxjsEsm`,
//      `mdxFlowExpression`, `mdxTextExpression`), unwrap JSX elements whose
//      name is not on an explicit allow-list, and drop attribute values that
//      are expressions.
//   3. Convert markdown to hast and then to React elements with
//      `hast-util-to-jsx-runtime` — deliberately WITHOUT an `evaluater`, so a
//      surviving expression node throws instead of running.
//   4. Serialise to static HTML so the body is in the initial payload and any
//      component-render exception is caught by the caller's try/catch.
//
// Defence in depth: steps 2 and 3 are independent. Even if the AST scrub
// missed a node, the absent evaluator fails closed rather than executing.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrism from "rehype-prism-plus";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import * as runtime from "react/jsx-runtime";
import { Fragment, type ComponentType, type ReactElement } from "react";

/** Components the content is allowed to reference by name. */
export const MDX_ALLOWED_COMPONENTS = [
  "Figure",
  "Gallery",
  // Gallery's authorable item. The scrub deletes expression props, so a gallery item
  // must arrive as a child ELEMENT with literal attributes rather than as an entry in
  // an array prop.
  "GalleryItem",
  "Callout",
  "ContentImage",
] as const;

/** Node kinds that carry executable code. Removed outright. */
const EXECUTABLE_MDX_NODES = new Set([
  "mdxjsEsm",
  "mdxFlowExpression",
  "mdxTextExpression",
]);

type AnyNode = {
  type: string;
  name?: string;
  value?: unknown;
  tagName?: string;
  properties?: Record<string, unknown>;
  attributes?: Array<{
    type?: string;
    name?: string;
    value?: unknown;
  }>;
  children?: AnyNode[];
  data?: { estree?: unknown };
};

const allowed = new Set<string>(MDX_ALLOWED_COMPONENTS);

/**
 * AST scrub. Not a regex filter: it removes whole node kinds and rewrites the
 * tree structurally, so nothing downstream can derive an expression from them.
 */
function remarkScrubExecutableContent() {
  return (tree: unknown) => {
    scrubNode(tree as AnyNode);
  };
}

function scrubNode(node: AnyNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (!child || typeof child !== "object") continue;

    // Delete executable node kinds and any residual estree payloads.
    if (EXECUTABLE_MDX_NODES.has(child.type) || child.data?.estree) {
      children.splice(i, 1);
      i -= 1;
      continue;
    }

    if (child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement") {
      // Drop any attribute whose value is an expression.
      if (Array.isArray(child.attributes)) {
        child.attributes = child.attributes.filter(
          (attr) =>
            attr &&
            attr.type === "mdxJsxAttribute" &&
            (attr.value === null ||
              attr.value === undefined ||
              typeof attr.value === "string"),
        );
      }
      // A non-allow-listed element keeps its children but loses its element
      // identity, so an unknown component cannot pull in behaviour.
      if (!child.name || !allowed.has(child.name)) {
        const grandchildren = child.children ?? [];
        children.splice(i, 1, ...grandchildren);
        i -= 1;
        continue;
      }
    }

    scrubNode(child);
  }
}

/** Assert no executable node survived the scrub before conversion. */
function assertNoExecutableNodes(tree: unknown): void {
  const offending = findExecutableNode(tree as AnyNode);
  if (offending) {
    throw new Error(
      `refusing to render: executable MDX content survived the scrub (${offending})`,
    );
  }
}

function findExecutableNode(node: AnyNode): string | undefined {
  // Any surviving MDX node kind is a failure: the JSX runtime would enter its
  // MDX code paths (which compile/evaluate expressions) for those.
  if (typeof node.type === "string" && node.type.startsWith("mdx")) {
    return node.type;
  }
  if (node.data?.estree) return `${node.type} estree`;
  if (Array.isArray(node.attributes)) {
    for (const attr of node.attributes) {
      if (
        attr &&
        attr.value !== null &&
        attr.value !== undefined &&
        typeof attr.value !== "string"
      ) {
        return `attribute expression on <${node.name ?? node.type}>`;
      }
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (!child || typeof child !== "object") continue;
      const found = findExecutableNode(child);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * hast-level conversion, run after `remark-rehype`.
 *
 * Converts allow-listed MDX JSX elements into plain hast `element` nodes whose
 * `tagName` is the component name, so the JSX runtime resolves them through the
 * `components` map without entering any MDX code path. Everything else MDX is
 * deleted. After this pass the tree contains only standard hast nodes.
 */
function rehypeConvertAllowedMdxJsx() {
  return (tree: unknown) => {
    convertNode(tree as AnyNode);
  };
}

function convertNode(node: AnyNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (!child || typeof child !== "object") {
      children.splice(i, 1);
      i -= 1;
      continue;
    }

    if (child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement") {
      const name = child.name;
      if (name && allowed.has(name)) {
        const properties: Record<string, string | boolean> = {};
        for (const attr of child.attributes ?? []) {
          // Only literal values survive; expression attributes were removed in
          // the mdast scrub and are never evaluated.
          if (
            attr &&
            attr.type === "mdxJsxAttribute" &&
            typeof attr.name === "string" &&
            (attr.value === null || attr.value === undefined || typeof attr.value === "string")
          ) {
            properties[attr.name] = attr.value === null || attr.value === undefined ? true : attr.value;
          }
        }
        convertNode(child);
        children[i] = {
          type: "element",
          tagName: name,
          properties,
          children: child.children ?? [],
        };
        continue;
      }
      // Not allow-listed: drop the element, keep its content, recurse.
      convertNode(child);
      const inner = child.children ?? [];
      children.splice(i, 1, ...inner);
      i -= 1;
      continue;
    }

    // Any other MDX node kind (ESM, expressions) is deleted outright.
    if (typeof child.type === "string" && child.type.startsWith("mdx")) {
      children.splice(i, 1);
      i -= 1;
      continue;
    }

    convertNode(child);
  }
}

export type MdxComponentsMap = Record<string, ComponentType<never>>;

/**
 * Render MDX/Markdown body source to a React element.
 *
 * Never compiles or evaluates the body. Throws (rather than executing) if any
 * executable construct survives the scrub; callers are expected to catch and
 * fall back to escaped text.
 *
 * Returns elements rather than an HTML string because Next.js forbids
 * `react-dom/server` in the server-component graph. The caller renders the
 * returned element, so the body still lands in the initial HTML payload.
 */
export async function renderMdxToReact(
  source: string,
  components: MdxComponentsMap,
): Promise<ReactElement> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkScrubExecutableContent)
    .use(remarkRehype, {
      allowDangerousHtml: false,
      passThrough: ["mdxJsxFlowElement", "mdxJsxTextElement"],
    })
    .use(rehypeConvertAllowedMdxJsx)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: { className: ["anchor"] },
    })
    .use(rehypePrism, { showLineNumbers: true });

  const mdast = processor.parse(source);
  const transformed = await processor.run(mdast);
  assertNoExecutableNodes(transformed);

  // No `evaluater` is passed. If an expression node somehow reached here,
  // hast-util-to-jsx-runtime throws instead of evaluating it.
  const element = toJsxRuntime(transformed as never, {
    ...(runtime as unknown as Record<string, unknown>),
    Fragment,
    components,
  } as never);

  return element as ReactElement;
}
