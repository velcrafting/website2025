// src/components/listing/ContentCard.tsx
import Link from "next/link";
import Image from "next/image";
import type { Doc, Frontmatter } from "@/types/content";

type Variant = "default" | "compact";

type Props = {
  doc: Doc<Frontmatter>;
  href: string; // prebuilt link to detail page
  tagBase?: "/blog" | "/projects" | "/labs" | "/tools";
  variant?: Variant;
  hardLink?: boolean; // use <a> to force full navigation
};

export default function ContentCard({ doc, href, tagBase, variant = "default", hardLink = false }: Props) {
  const { frontmatter } = doc;
  const isSvg = frontmatter.hero?.toLowerCase().endsWith(".svg");
  
  // Determine status
  let status: "draft" | "scheduled" | "published" = "published";
  if (frontmatter.status) {
    status = frontmatter.status;
  } else if (frontmatter.scheduledAt) {
    status = new Date(frontmatter.scheduledAt) > new Date() ? "scheduled" : "published";
  } else if (!frontmatter.date) {
    status = "draft";
  }
  
  const statusColors = {
    draft: "bg-neutral-500",
    scheduled: "bg-amber-500", 
    published: "bg-emerald-500",
  };
  
  const HeroImage = frontmatter.hero
    ? isSvg
      ? (
          <img
            src={frontmatter.hero}
            alt={frontmatter.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        )
      : (
          <Image
            src={frontmatter.hero}
            alt={frontmatter.title}
            fill
            sizes="(min-width: 1024px) 360px, 100vw"
            className="object-cover transition-transform group-hover:scale-[1.03]"
          />
        )
    : null;
  
  // Tag color mapping - each tag maps to gradient colors
  const tagColors: Record<string, [string, string]> = {
    // AI/Agentic - purple/blue
    ai: ["from-violet-100", "to-indigo-200"],
    agents: ["from-violet-100", "to-indigo-200"],
    agentic: ["from-violet-100", "to-indigo-200"],
    llm: ["from-violet-100", "to-indigo-200"],
    discovery: ["from-violet-100", "to-indigo-200"],
    geo: ["from-violet-100", "to-indigo-200"],
    chatgpt: ["from-violet-100", "to-indigo-200"],
    // Systems - teal/cyan
    systems: ["from-teal-100", "to-cyan-200"],
    "systems-design": ["from-teal-100", "to-cyan-200"],
    architecture: ["from-teal-100", "to-cyan-200"],
    framework: ["from-teal-100", "to-cyan-200"],
    engineering: ["from-teal-100", "to-cyan-200"],
    seo: ["from-teal-100", "to-cyan-200"],
    // Communications - amber/orange
    communications: ["from-amber-100", "to-orange-200"],
    "strategic-comms": ["from-amber-100", "to-orange-200"],
    narrative: ["from-amber-100", "to-orange-200"],
    fud: ["from-amber-100", "to-orange-200"],
    defense: ["from-amber-100", "to-orange-200"],
    security: ["from-amber-100", "to-orange-200"],
    // About - rose/pink
    about: ["from-emerald-100", "to-green-200"],
    vel: ["from-emerald-100", "to-green-200"],
    anchor: ["from-rose-100", "to-pink-200"],
    // Default
    default: ["from-neutral-100", "to-neutral-200"],
  };

  const getGradientByTags = (tags?: string[]) => {
    if (!tags?.length) return "from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-700";
    
    const tagLower = tags.map(t => t.toLowerCase().trim());
    
    // Find first matching tag color
    for (const tag of tagLower) {
      if (tagColors[tag]) {
        const [from, to] = tagColors[tag];
        return `${from} ${to} dark:${from.replace('from-', 'from-')} dark:${to.replace('to-', 'to-')}`;
      }
    }
    
    return "from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-700";
  };
  
  
  
  const gradientClass = getGradientByTags(frontmatter.tags);
  
  // Generate a unique pattern based on slug (for visual variety)
  const patternId = `pattern-${doc.slug.slice(0, 8)}`;
  
  const GradientPlaceholder = !frontmatter.hero ? (
    <div className={`h-full w-full bg-gradient-to-br ${gradientClass} relative overflow-hidden`}>
      {/* 30% black overlay for readability */}
      <div className="absolute inset-0 bg-black/30" />
      {/* Subtle geometric pattern overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
        <defs>
          <pattern id={patternId} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1.5" fill="currentColor" className="text-white/20" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      {/* Title overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/50 to-transparent">
        <span className="text-xs font-medium text-white drop-shadow-md line-clamp-2">
          {frontmatter.title}
        </span>
      </div>
    </div>
  ) : null;
  return (
    <div
      className="group card-hover-gradient relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white/80 p-3 shadow-sm transition hover:-translate-y-[2px] hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900/70"
    >
      {/* Featured badge - position below title when no hero image */}
      {frontmatter.featured ? (
        <span className={`pointer-events-none absolute ${HeroImage ? 'left-3 top-3' : 'left-3 top-3'} z-10 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm`}>FEATURED</span>
      ) : null}
      
      {/* Status badge */}
      {status !== "published" ? (
        <span className={`pointer-events-none absolute right-3 ${HeroImage ? 'top-3' : 'top-3'} z-10 rounded-full ${statusColors[status]} px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm`}>
          {status.toUpperCase()}
        </span>
      ) : null}

      {HeroImage ? (
        hardLink ? (
          <a
            href={href}
            className={
              variant === "compact"
                ? "relative mb-2 block h-28 w-full overflow-hidden rounded-lg"
                : "relative mb-3 block h-40 w-full overflow-hidden rounded-lg"
            }
          >
            {HeroImage}
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/5" />
          </a>
        ) : (
          <Link
            href={href}
            className={
              variant === "compact"
                ? "relative mb-2 block h-28 w-full overflow-hidden rounded-lg"
                : "relative mb-3 block h-40 w-full overflow-hidden rounded-lg"
            }
          >
            {HeroImage}
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/5" />
          </Link>
        )
      ) : GradientPlaceholder ? (
        hardLink ? (
          <a
            href={href}
            className={
              variant === "compact"
                ? "relative mb-2 block h-28 w-full overflow-hidden rounded-lg"
                : "relative mb-3 block h-40 w-full overflow-hidden rounded-lg"
            }
          >
            {GradientPlaceholder}
          </a>
        ) : (
          <Link
            href={href}
            className={
              variant === "compact"
                ? "relative mb-2 block h-28 w-full overflow-hidden rounded-lg"
                : "relative mb-3 block h-40 w-full overflow-hidden rounded-lg"
            }
          >
            {GradientPlaceholder}
          </Link>
        )
      ) : <div className="mb-2" />}
      {hardLink ? (
        <a href={href} className={`${variant === "compact" ? "text-[13px]" : "text-sm"} font-semibold text-neutral-900 hover:underline dark:text-neutral-100 ${!HeroImage ? "mt-2" : ""}`}>{frontmatter.title}</a>
      ) : (
        <Link href={href} className={variant === "compact" ? "text-[13px] font-semibold text-neutral-900 hover:underline dark:text-neutral-100" : "text-sm font-semibold text-neutral-900 hover:underline dark:text-neutral-100"}>{frontmatter.title}</Link>
      )}
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
