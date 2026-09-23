// src/lib/readme-blocks.ts
//
// A bounded, pure converter from third-party README markdown to a plain block model.
//
// Why this exists (docs/implementation_plan_Sep16.md §3, task 1.3): a README is third-party
// content. It is therefore converted to a tiny, closed set of *data* blocks that the caller
// renders as ordinary React elements. Nothing here evaluates MDX, builds an AST of arbitrary
// nodes, or emits HTML — there is no `dangerouslySetInnerHTML`, no attribute passthrough and no
// way to express a script, an event handler, an iframe or a style. Anything the converter does
// not recognise stays literal text.
//
// Recognised, and nothing else:
//
//   - ATX headings (`#` … `######`)      -> { kind: "heading" }
//   - unordered list items (`-`, `*`, `+`) -> { kind: "list" }
//   - fenced code blocks (``` or ~~~)    -> { kind: "code" }, the fence text as literal text
//   - inline code spans (`code`)         -> { kind: "code" } inline
//   - markdown links `[label](href)`     -> { kind: "link" } only for an absolute http(s) href
//
// Deliberately NOT recognised: tables, blockquotes, HTML tags, images, emphasis markers,
// ordered lists, autolinks, reference links, footnotes, directives. They render as text, which
// is the honest degradation: the reader sees the author's characters rather than a claim about
// a structure this renderer does not actually support.
//
// A heading is a heading and never becomes data. Nothing in this module derives a field value
// (a lane, a status, a count) from heading text — the `/projects` lane-derivation defect class
// is not reachable from here, because this module derives no fields at all.
//
// Pure and dependency-free on purpose: it can be exercised in the test harness without a
// network, a DOM or a build.

export type ReadmeInline =
  /** Literal text. Always a plain string; never interpreted further. */
  | { kind: "text"; text: string }
  /** Inline code span. Literal text, no language, no highlighting. */
  | { kind: "code"; text: string }
  /** A link with an absolute http(s) target. */
  | { kind: "link"; text: string; href: string };

export type ReadmeBlock =
  /** `level` is the source heading depth (1–6), reported as authored. */
  | { kind: "heading"; level: number; content: ReadmeInline[] }
  | { kind: "paragraph"; content: ReadmeInline[] }
  /** One `ul` of literal items. Nested bullets are flattened into the same list. */
  | { kind: "list"; items: ReadmeInline[][] }
  /** A fenced code block. Rendered as text inside `<pre><code>`. */
  | { kind: "code"; text: string };

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.+?)\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

/**
 * One token at a time: a code span, an image (kept as text), or a markdown link.
 *
 * Written as one alternation rather than a nested parser so the scan cannot recurse, cannot
 * backtrack into a pathological case, and cannot invent a construct.
 *
 * A target allows one level of nested parentheses so a URL that contains a `)` — or a link whose
 * target is `javascript:alert(1)` — stays one token instead of being cut in half. Cutting it would
 * not have been unsafe (both halves are text), but splitting a construct in the middle makes the
 * refusal harder to see, and refusing loudly is the point.
 */
const LINK_TARGET = "\\(((?:[^()\\n]|\\([^()\\n]*\\))*)\\)";
const INLINE_TOKEN = new RegExp(
  "(`[^`\\n]+`)" + "|(!\\[[^\\]\\n]*\\]" + LINK_TARGET + ")" + "|(\\[[^\\]\\n]*\\]" + LINK_TARGET + ")",
  "g",
);

/**
 * A link target is only kept when it is an absolute `http:`/`https:` URL.
 *
 * `javascript:`, `data:`, `file:`, `mailto:` and every relative path (which this renderer
 * cannot resolve, because it does not know the README's own base) are refused. A refused
 * target is not dropped silently — the caller renders the original markdown as literal text,
 * so the reader can still see what the author wrote.
 */
export function safeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    // No base argument: a relative reference throws rather than resolving against this site.
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Rebuilt from the parsed URL, so the emitted string is the one that was actually checked.
  return url.href;
}

/** Convert one line's worth of text into inline nodes. Never throws. */
export function parseInline(text: unknown): ReadmeInline[] {
  const source = typeof text === "string" ? text : "";
  const nodes: ReadmeInline[] = [];
  const push = (node: ReadmeInline) => {
    if (node.kind === "text" && !node.text) return;
    nodes.push(node);
  };

  let cursor = 0;
  for (const match of source.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) push({ kind: "text", text: source.slice(cursor, index) });
    cursor = index + match[0].length;

    // 1. code span
    if (match[1]) {
      push({ kind: "code", text: match[1].slice(1, -1) });
      continue;
    }
    // 2. image — never an element here, only the author's characters
    if (match[2]) {
      push({ kind: "text", text: match[2] });
      continue;
    }
    // 3. markdown link (group 4 is the whole construct, group 5 the target)
    const token = match[4] ?? "";
    const labelEnd = token.indexOf("](");
    const label = labelEnd === -1 ? "" : token.slice(1, labelEnd).trim();
    const href = safeLinkHref(match[5] ?? "");
    if (!href) {
      push({ kind: "text", text: token });
      continue;
    }
    push({ kind: "link", text: label || href, href });
  }

  if (cursor < source.length) push({ kind: "text", text: source.slice(cursor) });
  return nodes;
}

/**
 * Convert README markdown into the block model.
 *
 * Total function: any input, including `null`, a number, an array or a 5 MB string, returns an
 * array of blocks. It never throws and never returns a partially-parsed structure, because the
 * caller's failure path (buttons only) is driven by "no blocks came back", and a throw would
 * turn a content problem into a page error.
 */
export function parseReadmeBlocks(markdown: unknown): ReadmeBlock[] {
  const source = typeof markdown === "string" ? markdown : "";
  if (!source.trim()) return [];

  const lines = source.split(/\r\n?|\n/);
  const blocks: ReadmeBlock[] = [];

  let paragraph: string[] = [];
  let list: ReadmeInline[][] | null = null;
  let fence: string | null = null;
  let code: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list && list.length) blocks.push({ kind: "list", items: list });
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (fence) {
      // Inside a fence: only the closing fence is syntax. Everything else is literal text.
      if (line.trim().startsWith(fence)) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = [];
        fence = null;
        continue;
      }
      code.push(line);
      continue;
    }

    if (FENCE.test(line)) {
      flush();
      fence = line.trim().slice(0, 3);
      code = [];
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, content: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list) list = [];
      list.push(parseInline(bullet[1]));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  // An unterminated fence is still text, not an error and not a silently dropped tail.
  if (fence) blocks.push({ kind: "code", text: code.join("\n") });
  flush();

  return blocks;
}

/** True when a block list has anything worth rendering. */
export function hasReadableBlocks(blocks: readonly ReadmeBlock[] | null | undefined): boolean {
  return Array.isArray(blocks) && blocks.length > 0;
}
