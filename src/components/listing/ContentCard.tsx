// src/components/listing/ContentCard.tsx
import Link from "next/link";
import Image from "next/image";
import type { Doc, Frontmatter } from "@/types/content";

type Variant = "default" | "compact";

type Props = {
  doc: Doc<Frontmatter>;
  href: string; // prebuilt link to detail page
  tagBase?: "/writing" | "/projects" | "/labs";
  variant?: Variant;
};

export default function ContentCard({ doc, href, tagBase, variant = "default" }: Props) {
  const { frontmatter } = doc;
  return (
    <div
      className="group card-hover-gradient relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white/80 p-3 shadow-sm transition hover:-translate-y-[2px] hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900/70"
    >
      {/* Featured badge */}
      {frontmatter.featured ? (
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">FEATURED</span>
      ) : null}

      {frontmatter.hero ? (
        <Link href={href} className={variant === "compact" ? "relative mb-2 block h-28 w-full overflow-hidden rounded-lg" : "relative mb-3 block h-40 w-full overflow-hidden rounded-lg"}>
          <Image
            src={frontmatter.hero}
            alt={frontmatter.title}
            fill
            sizes="(min-width: 1024px) 360px, 100vw"
            className="object-cover transition-transform group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/5" />
        </Link>
      ) : null}
      <Link href={href} className={variant === "compact" ? "text-[13px] font-semibold text-neutral-900 hover:underline dark:text-neutral-100" : "text-sm font-semibold text-neutral-900 hover:underline dark:text-neutral-100"}>{frontmatter.title}</Link>
      {frontmatter.summary ? (
        <div className={variant === "compact" ? "mt-0.5 line-clamp-2 text-[11px] text-neutral-600 dark:text-neutral-400" : "mt-1 line-clamp-3 text-xs text-neutral-600 dark:text-neutral-400"}>{frontmatter.summary}</div>
      ) : null}
      {frontmatter.tags?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {frontmatter.tags.slice(0, 4).map((t) => (
            tagBase ? (
              <Link
                key={t}
                href={`${tagBase}?tag=${encodeURIComponent(t)}`}
                className="relative z-10 rounded-md border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                #{t}
              </Link>
            ) : (
              <span key={t} className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">#{t}</span>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
}
