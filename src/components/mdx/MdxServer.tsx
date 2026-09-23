// src/components/mdx/MdxServer.tsx
//
// Server-rendered article body.
//
// Rendering goes through `@/lib/mdx-render`, which is a NON-EXECUTABLE
// pipeline: it parses the body to an AST, deletes MDX ESM/expression nodes,
// converts allow-listed JSX elements to plain elements, and returns React
// elements. It never compiles or evaluates the body. That matters because the
// CMS POST/PUT route and the admin create form write author-supplied bodies
// into the same content tree this component renders (GATE_A_REVIEW finding 2).
//
// Failure coverage:
//   - parse/transform failures are caught here and degrade to escaped text;
//   - content-component render failures are caught by `guardComponent`, which
//     invokes the presentational component inside a try/catch. These MDX
//     components are pure functions (no hooks), so direct invocation is safe
//     and converts a render throw into an inline marker instead of a 500.
// An exception thrown elsewhere in the React tree is NOT covered here; that
// needs a route-level error boundary, which is outside this slice.
import type { ComponentType, ReactElement } from "react";
import { renderMdxToReact, type MdxComponentsMap } from "@/lib/mdx-render";
import { mdxComponents } from "./mdx-components";

type Props = { source: string };

/** Escaped plain-text fallback. Renders the body without interpreting it. */
function MdxFallback({ source }: Props) {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
  return <pre data-mdx-fallback="text">{body}</pre>;
}

/**
 * Wrap a content component so a throw during its own render is contained.
 * These components are pure presentational functions, so calling them directly
 * keeps the failure inside this try/catch.
 */
function guardComponent(name: string, Component: ComponentType<never>) {
  function Guarded(props: never): ReactElement | null {
    try {
      return (Component as unknown as (p: unknown) => ReactElement | null)(props);
    } catch (err) {
      console.error(`MdxServer: <${name}> failed to render`, err);
      return <span data-mdx-component-error={name} />;
    }
  }
  Guarded.displayName = `Guarded(${name})`;
  return Guarded as ComponentType<never>;
}

const guardedComponents: MdxComponentsMap = Object.fromEntries(
  Object.entries(mdxComponents).map(([name, Component]) => [
    name,
    guardComponent(name, Component as ComponentType<never>),
  ]),
) as MdxComponentsMap;

export default async function MdxServer({ source }: Props) {
  let content: ReactElement | null = null;
  try {
    content = await renderMdxToReact(source, guardedComponents);
  } catch (err) {
    console.error("MdxServer: body render failed; using escaped-text fallback", err);
  }
  if (content === null) return <MdxFallback source={source} />;
  return <div data-mdx-rendered="element">{content}</div>;
}
