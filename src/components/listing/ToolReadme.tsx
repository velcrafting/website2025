// src/components/listing/ToolReadme.tsx
//
// Renders a tool's README as plain, non-executable elements (docs/implementation_plan_Sep16.md §3,
// task 1.3). The input is the closed block model from `src/lib/readme-blocks.ts` — never markup,
// never MDX, never HTML. Every value below is a string in a React text position, so React escapes
// it; there is no `dangerouslySetInnerHTML` in this file and no attribute passthrough from the
// README. A `<script>` tag written inside a README arrives here as the literal characters
// `<script>`, and is displayed that way.
//
// Heading levels are mapped, not copied: the page's own `<h1>` is the tool title and this panel
// owns an `<h2>`, so a README's `#`/`##` becomes `h3` and anything deeper becomes `h4`. That keeps
// the document's heading order monotonic instead of letting third-party content inject an `h1` or
// skip a level.
import { Fragment } from "react";
import type { ReadmeBlock, ReadmeInline } from "@/lib/readme-blocks";

type Props = {
  blocks: ReadmeBlock[];
  /** The exact URL the text was read from. Rendered as provenance only, never as a claim. */
  source: string;
  /** Real UTF-8 byte length of the text that was rendered. */
  bytes?: number;
};

function InlineNodes({ nodes }: { nodes: readonly ReadmeInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === "code") return <code key={index}>{node.text}</code>;
        if (node.kind === "link") {
          return (
            <a
              key={index}
              href={node.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {node.text} <span aria-hidden="true">↗</span>
            </a>
          );
        }
        return <Fragment key={index}>{node.text}</Fragment>;
      })}
    </>
  );
}

function Block({ block }: { block: ReadmeBlock }) {
  if (block.kind === "heading") {
    // `#`/`##` → h3, `###`+ → h4. The README's own depth is preserved, its rank is not.
    return block.level <= 2 ? (
      <h3>
        <InlineNodes nodes={block.content} />
      </h3>
    ) : (
      <h4>
        <InlineNodes nodes={block.content} />
      </h4>
    );
  }
  if (block.kind === "list") {
    return (
      <ul>
        {block.items.map((item, index) => (
          <li key={index}>
            <InlineNodes nodes={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === "code") {
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    );
  }
  return (
    <p>
      <InlineNodes nodes={block.content} />
    </p>
  );
}

export default function ToolReadme({ blocks, source, bytes }: Props) {
  return (
    <section
      aria-label="Readme from this tool's repository"
      className="mt-[var(--space-5)] border-t border-rule pt-[var(--space-4)]"
      // Machine-readable provenance. The visible surface is the README; these attributes are what
      // the served-HTML evidence quotes: the exact URL read, the real byte count, and the state.
      data-readme-source={source}
      data-readme-bytes={typeof bytes === "number" ? String(bytes) : undefined}
      data-readme-blocks={String(blocks.length)}
    >
      <p className="meta uppercase tracking-wide">Readme from the repository</p>
      <p className="meta mt-[var(--space-1)]">
        Read when this page was served and shown below as plain text. Nothing in it runs here.
      </p>
      <div className="mt-[var(--space-3)]">
        {blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </div>
    </section>
  );
}
