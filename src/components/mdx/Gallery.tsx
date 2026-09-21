// Presentational MDX component. Rendered on the server by the
// non-executable body renderer, so it must not be a client component and must not
// use hooks: MdxServer's guard invokes these functions directly.
//
// Concept 03: token border, radius and caption colour.
//
// TWO WAYS IN, ONE RENDERER
//
//  1. Authoring (articles) — child elements, because the body scrub deletes JSX
//     expression props, so an array prop can never arrive from an article:
//
//       <Gallery>
//         <GalleryItem src="/blog/x/one.png" alt="First" caption="Optional" />
//         <GalleryItem src="/blog/x/two.png" alt="Second" />
//       </Gallery>
//
//  2. React callers (pages) — the array prop, unchanged:
//
//       <Gallery images={[{ src, alt, caption }]} />
//
// Items are normalised to one shape, so both paths produce identical output.
//
// PRECEDENCE, precisely: the `images` array wins when it is NON-EMPTY. An empty array
// (or no `images` prop at all) falls through to the children, so a caller that passes
// both gets the array only if it actually contains something, and never a silently
// empty gallery.
import { Children, isValidElement } from "react";

type Item = { src: string; alt: string; caption?: string };

type Props = {
  images?: Item[];
  children?: React.ReactNode;
};

/**
 * Read `<GalleryItem>` children into items.
 *
 * Only a literal, non-empty `src` creates an item: a `src` that was an expression is
 * removed by the scrub before this runs, and an item with no usable `src` cannot render
 * an image.
 *
 * `alt` is passed through as authored. A non-string `alt` becomes an empty string, and
 * `alt` never decides whether an item renders — an item with an empty `alt` still
 * renders, with `alt=""`, which is the correct treatment for a decorative image.
 * Nothing here evaluates or trusts the child beyond reading three literal string props.
 */
function itemsFromChildren(children: React.ReactNode): Item[] {
  const items: Item[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { src?: unknown; alt?: unknown; caption?: unknown };
    if (typeof props?.src !== "string" || !props.src) return;
    items.push({
      src: props.src,
      alt: typeof props.alt === "string" ? props.alt : "",
      caption: typeof props.caption === "string" && props.caption ? props.caption : undefined,
    });
  });
  return items;
}

export default function Gallery({ images, children }: Props) {
  const items = images?.length ? images : itemsFromChildren(children);

  // An empty gallery renders nothing rather than an empty bordered grid.
  if (items.length === 0) return null;

  return (
    <div className="my-[var(--space-5)] grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it, i) => (
        <figure
          key={i}
          className="rounded-[var(--radius-surface)] border border-rule p-[var(--space-2)]"
        >
          {/* A plain img, not next/image: authored diagrams may be SVG, which next/image cannot
              optimise. The @next/next/no-img-element disable that used to sit here was removed
              2026-09-16 — eslint reported it as an unused directive, so the rule is not enabled in
              this project and the comment was suppressing nothing. The reasoning is kept because it
              is the reason the element is plain. */}
          <img
            src={it.src}
            alt={it.alt}
            className="w-full rounded-[var(--radius-chip)]"
            loading="lazy"
          />
          {it.caption ? (
            <figcaption className="meta mt-[var(--space-2)] text-center">
              {it.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
