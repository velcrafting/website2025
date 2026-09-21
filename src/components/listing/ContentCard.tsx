// src/components/listing/ContentCard.tsx
//
// ONE coherent card per article (Steven's visual review, item 5).
//
// What changed and why: the cover previously sat above a rule-separated text block, so the
// illustration read as a separate object rather than part of the article. Each entry is now a
// single card containing the cover as its TOP REGION, then the title, description, date and
// tags inside the same frame. Image and no-image entries share identical geometry because the
// cover's top region uses an aspect ratio rather than a fixed height.
//
// Deliberate structural choices:
//   - The card is NOT a link. The title is the link and the tags are separate links. Wrapping
//     the card in an anchor would nest interactive elements inside an anchor, which is invalid
//     and breaks keyboard and screen-reader use.
//   - There are no nested competing frames: the card owns the outer border and radius, and the
//     cover variant drops its own frame (see ContentCover `variant="card-top"`).
//   - Status and Featured use the shared Badge/status vocabulary rather than ad-hoc spans, and
//     every state still carries its text label, so nothing is signalled by colour alone.
//   - Honest illustration labelling is inherited unchanged from the shared cover.
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import ContentCover from "./ContentCover";
import { formatDateOnly, isoDateOnly } from "@/lib/format-date";
import type { Doc, Frontmatter } from "@/types/content";

type Variant = "default" | "compact";

/**
 * The card's title as a heading that links to the item.
 *
 * Defined once because the title renders in one of two places depending on the card: inside the
 * cover panel when there is no hero image, or in the card body when there is. Never both.
 */
function TitleLink({
  title,
  href,
  hardLink,
  className,
}: {
  title: string;
  href: string;
  hardLink?: boolean;
  className?: string;
}) {
  const inner = hardLink ? (
    <a href={href} className="text-ink no-underline hover:underline">
      {title}
    </a>
  ) : (
    <Link href={href} className="text-ink no-underline hover:underline">
      {title}
    </Link>
  );
  return <h3 className={className}>{inner}</h3>;
}

type Props = {
  doc: Doc<Frontmatter>;
  href: string; // prebuilt link to detail page
  tagBase?: "/blog" | "/projects" | "/labs" | "/tools";
  variant?: Variant;
  hardLink?: boolean; // use <a> to force full navigation
  /** Position in the list; shown as the cover's index mark. */
  index?: number;
};

const STATUS_TEXT: Record<"draft" | "scheduled", string> = {
  draft: "Draft",
  scheduled: "Scheduled",
};

export default function ContentCard({
  doc,
  href,
  tagBase,
  variant = "default",
  hardLink = false,
  index,
}: Props) {
  const { frontmatter } = doc;

  // Determine status
  let status: "draft" | "scheduled" | "published" = "published";
  if (frontmatter.status) {
    status = frontmatter.status;
  } else if (frontmatter.scheduledAt) {
    status = new Date(frontmatter.scheduledAt) > new Date() ? "scheduled" : "published";
  } else if (!frontmatter.date) {
    status = "draft";
  }

  const compact = variant === "compact";
  const titleClass = compact ? "text-[1rem] font-semibold" : "text-[1.15rem] font-semibold";
  const dateLabel = formatDateOnly(frontmatter.date) || null;
  const showStatusRow = status !== "published" || Boolean(frontmatter.featured);

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-[var(--radius-surface)] border border-rule bg-paper-raised ${
        compact ? "" : "transition-colors hover:border-ink/40"
      }`}
    >
      {/*
        A card with no hero used to show a tall empty ruled panel labelled "Illustration" and then
        the title underneath it, which read as half-implemented. The title now sits inside the panel
        and is not repeated below. A card WITH a real hero keeps the title in the body: the hero
        already carries the visual weight, and overlaying text on an image is a contrast risk.
      */}
      {compact ? null : (
        <ContentCover
          title={frontmatter.title}
          hero={frontmatter.hero}
          topic={frontmatter.tags?.[0]}
          index={index}
          variant="card-top"
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 100vw"
        >
          {frontmatter.hero ? null : (
            <TitleLink
              title={frontmatter.title}
              href={href}
              hardLink={hardLink}
              className={titleClass}
            />
          )}
        </ContentCover>
      )}

      <div className={`flex flex-1 flex-col ${compact ? "p-[var(--space-3)]" : "p-[var(--space-4)]"}`}>
        {showStatusRow ? (
          <div className="mb-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)]">
            {status !== "published" ? (
              <Badge variant="warn">{STATUS_TEXT[status as "draft" | "scheduled"]}</Badge>
            ) : null}
            {frontmatter.featured ? <Badge variant="link">Featured</Badge> : null}
          </div>
        ) : null}

        {!compact && !frontmatter.hero ? null : (
          <TitleLink title={frontmatter.title} href={href} hardLink={hardLink} className={titleClass} />
        )}

        {frontmatter.summary ? (
          <p className={`mt-[var(--space-2)] text-muted ${compact ? "text-[0.9rem]" : "text-[0.95rem]"}`}>
            {frontmatter.summary}
          </p>
        ) : null}

        {/* mt-auto keeps the metadata row aligned across cards in a grid, so cards of
            different text lengths still line up at the bottom. */}
        {(dateLabel || frontmatter.tags?.length) && (
          <p className="meta mt-[var(--space-4)] flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)] pt-[var(--space-3)]">
            {dateLabel ? (
              <time dateTime={isoDateOnly(frontmatter.date)}>{dateLabel}</time>
            ) : null}
            {frontmatter.tags?.slice(0, 4).map((t) =>
              tagBase ? (
                <Link
                  key={t}
                  href={`${tagBase}?tag=${encodeURIComponent(t)}`}
                  className="no-underline hover:underline"
                >
                  #{t}
                </Link>
              ) : (
                <span key={t}>#{t}</span>
              ),
            )}
          </p>
        )}
      </div>
    </article>
  );
}
