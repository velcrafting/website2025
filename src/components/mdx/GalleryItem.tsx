// src/components/mdx/GalleryItem.tsx
//
// One image inside an authored <Gallery>.
//
// WHY THIS EXISTS (docs/2026-refresh.md §5, CODEX_REFRESH_REVIEW.md finding 7):
// `Gallery` originally took an array — `<Gallery images={[{...}]} />` — and the
// non-executable body scrub deletes JSX EXPRESSION nodes, so that array could never
// arrive from an article. The component existed; the authoring path did not.
//
// Literal attributes DO survive the scrub, and child elements are structural, so this
// child-element form is authorable without weakening the boundary:
//
//   <Gallery>
//     <GalleryItem src="/blog/example/one.png" alt="First" caption="Optional" />
//     <GalleryItem src="/blog/example/two.png" alt="Second" />
//   </Gallery>
//
// Presentational only: no hooks, no imports, so MdxServer's guard can invoke it
// directly. Opening a Gallery item on its own (rendered outside a Gallery) still
// produces a usable figure rather than nothing.
type Props = {
  /** Absolute path under /public. Required; an item without a usable src renders nothing. */
  src: string;
  /**
   * Passed through as authored. A missing `alt` becomes `alt=""` (correct for a
   * decorative image); it never decides whether the item renders.
   */
  alt?: string;
  caption?: string;
};

export default function GalleryItem({ src, alt, caption }: Props) {
  if (!src) return null;
  return (
    <figure className="rounded-[var(--radius-surface)] border border-rule p-[var(--space-2)]">
      {/* A plain img, not next/image: authored diagrams may be SVG, which next/image cannot
          optimise. The @next/next/no-img-element disable that used to sit here was removed
          2026-09-16 — eslint reported it as an unused directive, so the rule is not enabled in this
          project and the comment was suppressing nothing. The reasoning is kept because it is the
          reason the element is plain. */}
      <img
        src={src}
        alt={alt ?? ""}
        className="w-full rounded-[var(--radius-chip)]"
        loading="lazy"
      />
      {caption ? (
        <figcaption className="meta mt-[var(--space-2)]">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
