// src/components/listing/FeaturedStrip.tsx
//
// Concept 03 / refresh contract migration.
//
// What changed and why:
//  - The cards used the retired treatment: `bg-white/80`, `shadow-sm`,
//    `ring-1 ring-black/5`, `rounded-2xl`, a `hover:-translate-y` lift and a
//    `hover:shadow-lg`. All retired; the strip now uses the shared surface, radius and
//    hairline tokens, and hover changes a border rather than moving the card.
//  - The text sat in WHITE over a `from-black/60` scrim on top of the image. When a
//    document had no hero the card was an empty light panel with white text on it —
//    unreadable. The cover now always comes from the shared `ContentCover` (real hero,
//    otherwise a labelled illustration) and the title and summary sit BELOW it in
//    `text-ink`, so contrast never depends on someone else's image.
//  - The horizontal snap-scroll strip is kept: it is the component's purpose.
import Link from "next/link";

import ContentCover from "./ContentCover";
import type { Doc, Frontmatter } from "@/types/content";

type Props = {
  items: Doc<Frontmatter>[];
  base: "/blog" | "/projects" | "/labs" | "/tools";
};

export default function FeaturedStrip({ items, base }: Props) {
  if (!items.length) return null;
  return (
    <section className="mt-[var(--space-5)]" aria-labelledby="featured-strip-title">
      <div
        id="featured-strip-title"
        className="mb-[var(--space-2)] text-sm font-semibold text-ink"
      >
        Featured
      </div>
      {/* Overflow scrolling is intentional; horizontal scroll containers are exempt
          from the page overflow checks because the container itself scrolls. */}
      <div className="-mx-[var(--space-2)] flex snap-x gap-[var(--space-4)] overflow-x-auto px-[var(--space-2)] pb-[var(--space-2)]">
        {items.map((d) => (
          <Link
            key={d.slug}
            href={`${base}/${d.slug}`}
            className="group w-[280px] shrink-0 snap-start no-underline"
          >
            <ContentCover
              title={d.frontmatter.title}
              hero={d.frontmatter.hero}
              topic={d.frontmatter.tags?.[0]}
              className="h-32"
            />
            <div className="mt-[var(--space-2)]">
              <div className="text-sm font-semibold text-ink group-hover:underline">
                {d.frontmatter.title}
              </div>
              {d.frontmatter.summary ? (
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">
                  {d.frontmatter.summary}
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
