// src/components/listing/FeaturedStrip.tsx
import Link from "next/link";
import Image from "next/image";
import type { Doc, Frontmatter } from "@/types/content";

type Props = {
  items: Doc<Frontmatter>[];
  base: "/writing" | "/projects" | "/labs";
};

export default function FeaturedStrip({ items, base }: Props) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">Featured</div>
      <div className="-mx-2 flex snap-x gap-4 overflow-x-auto px-2 pb-2">
        {items.map((d) => (
          <Link
            key={d.slug}
            href={`${base}/${d.slug}`}
            className="group relative h-40 w-[320px] shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white/80 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[2px] hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900/70 dark:ring-white/5"
          >
            {d.frontmatter.hero ? (
              <Image
                src={d.frontmatter.hero}
                alt={d.frontmatter.title}
                fill
                sizes="320px"
                className="object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <div className="text-sm font-semibold text-white drop-shadow">{d.frontmatter.title}</div>
              {d.frontmatter.summary ? (
                <div className="mt-0.5 line-clamp-2 text-[11px] text-neutral-200 drop-shadow">{d.frontmatter.summary}</div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

