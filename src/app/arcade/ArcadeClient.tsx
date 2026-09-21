"use client";

// src/app/arcade/ArcadeClient.tsx
//
// The browsing half of the arcade. Steven, 2026-09-16: "it should feel like i am looking at the arcade
// cabinet while on that page" and "when someone clicks a game it should be like clicking a movie title
// on netflix, it states a larger description, maybe tags or general information".
//
// Client-side because three things need state: the tag filter, the shelf arrows, and the title view.
// Everything is a shared component — Drawer (Radix dialog: real focus trap, Escape to close, works on
// a phone), Card, Badge, Button. Nothing new is invented here and no raw colour is used: the accent is
// the site's own violet via the `link` badge variant and var(--link), NOT a signal red. Steven: "instead
// of signal red, maybe we should take the color of the main palette? im wondering if the red is to
// contrasting." Agreed — the arcade now borrows the palette rather than shouting over it.
//
// TAGS ARE THE ATTRIBUTION. Steven: "tags will be helpful since i may have several models making
// different games and then tagging them with their respective llms." So every entry carries tags, the
// model tag is rendered first and in the accent, and the filter row is built FROM the tags actually on
// the entries — it can never offer a tag that nothing carries.

import { useMemo, useRef, useState } from "react";

import { Badge, Button, Card, Drawer } from "@/components/ui";
import ContentCover from "@/components/listing/ContentCover";

export type ArcadeEntry = {
  /** Repository name, used as the title. */
  title: string;
  /** One line for the card. */
  summary: string;
  /** The longer paragraph for the title view. */
  description?: string;
  /** Where the game runs. The play area frames this. */
  playUrl?: string;
  /** Free-form, but `model:` tags carry the attribution. */
  tags: string[];
  /** "playable" or "workshop" decides the shelf. */
  status: "playable" | "workshop";
  added?: string;
};

type Props = {
  entries: ArcadeEntry[];
  /** Shown when nothing is flagged yet. Never replaced with invented games. */
  emptyNote: React.ReactNode;
};

const MODEL_PREFIX = "model:";

/**
 * The attribution for a game card.
 *
 * Uses the model tag when there is one — that IS the attribution Steven asked the tags to carry — and
 * keeps the fixture label honest when the source has no model attribution.
 */
function modelFor(entry: ArcadeEntry): string {
  const model = entry.tags.find((t) => t.startsWith(MODEL_PREFIX));
  return model ? model.slice(MODEL_PREFIX.length).trim() || "fixture" : "fixture";
}

function TagRow({ tags, onPick }: { tags: string[]; onPick?: (t: string) => void }) {
  // Model tags first, so the attribution reads before the genre.
  const sorted = [...tags].sort((a, b) => {
    const am = a.startsWith(MODEL_PREFIX) ? 0 : 1;
    const bm = b.startsWith(MODEL_PREFIX) ? 0 : 1;
    return am - bm || a.localeCompare(b);
  });
  return (
    <div className="flex flex-wrap gap-[var(--space-1)]">
      {sorted.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={onPick ? () => onPick(tag) : undefined}
          disabled={!onPick}
          className="disabled:cursor-default"
          aria-label={onPick ? `Filter by ${tag}` : tag}
        >
          <Badge variant={tag.startsWith(MODEL_PREFIX) ? "link" : "neutral"}>{tag}</Badge>
        </button>
      ))}
    </div>
  );
}

function Shelf({
  label,
  entries,
  onOpen,
}: {
  label: string;
  entries: ArcadeEntry[];
  /** `opener` is the card that was clicked, so focus can be returned to it when the dialog closes. */
  onOpen: (entry: ArcadeEntry, opener: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section className="mt-[var(--space-6)]">
      <div className="flex items-baseline justify-between gap-[var(--space-3)]">
        <h2 className="text-[0.8rem] uppercase tracking-[0.18em] text-muted">{label}</h2>
        {/* Arrows are a desktop affordance; on touch the row itself is the interaction. */}
        <div className="arcade-arrows items-center gap-[var(--space-1)]">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="min-h-[32px] min-w-[32px] rounded-[var(--radius-chip)] border border-rule text-muted hover:border-ink hover:text-ink"
            aria-label={`Scroll ${label} backwards`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="min-h-[32px] min-w-[32px] rounded-[var(--radius-chip)] border border-rule text-muted hover:border-ink hover:text-ink"
            aria-label={`Scroll ${label} forwards`}
          >
            ›
          </button>
        </div>
      </div>

      <div ref={ref} className="arcade-shelf mt-[var(--space-3)]">
        {entries.map((entry) => (
          <button
            key={entry.title}
            type="button"
            onClick={(event) => onOpen(entry, event.currentTarget)}
            className="text-left"
          >
            <Card variant="outline" hoverLift className="flex h-full flex-col overflow-hidden">
              {/* The shared cover carries the attribution and game name; the outer cabinet remains the
                  only interactive element. No status filler or invented artwork is added. */}
              <ContentCover
                title={entry.title}
                topic={modelFor(entry)}
                variant="card-top"
                showFigure={false}
                sizes="(min-width: 1024px) 280px, 70vw"
              >
                <span className="block text-[1.05rem] font-medium text-ink">{entry.title}</span>
              </ContentCover>
              <div className="p-[var(--space-3)]">
                <p className="mt-[var(--space-1)] text-[0.8rem] text-muted">{entry.summary}</p>
                {entry.tags.some((tag) => !tag.startsWith(MODEL_PREFIX)) ? (
                  <div className="mt-[var(--space-2)]">
                    {/* NOT the interactive TagRow. The card is itself a button, and F2 forbids nested
                        interactive elements (a button inside a button is also invalid HTML). The
                        filterable TagRow is used in the title view, where the tags are not inside
                        another control. */}
                    <span className="flex flex-wrap gap-[var(--space-1)]">
                      {entry.tags.filter((t) => !t.startsWith(MODEL_PREFIX)).map((t) => (
                        <Badge key={t} variant="neutral">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  </div>
                ) : null}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function ArcadeClient({ entries, emptyNote }: Props) {
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  // Bumping the key remounts the frame, which is the only restart a parent can perform on a
  // cross-origin game. It cannot pause one, so it does not offer to.
  const [frameKey, setFrameKey] = useState(0);

  /**
   * The card that opened the dialog.
   *
   * The shared Drawer documents this exact defect in its header: Radix restores focus to its own
   * Dialog.Trigger, but this dialog's trigger is a shelf card in the caller, so closing left focus on
   * <body> and a keyboard user lost their place. The fix is the documented one — hold a ref to the opener
   * and pass it as `returnFocusTo`, which the Drawer focuses explicitly on close.
   *
   * An independent re-review reproduced the defect on the fixture twice, including after a separate state
   * read, so this is a real user-visible bug and not a theoretical one.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  const openFrom = (entry: ArcadeEntry, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setOpenTitle(entry.title);
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return [...set].sort((a, b) => {
      const am = a.startsWith(MODEL_PREFIX) ? 0 : 1;
      const bm = b.startsWith(MODEL_PREFIX) ? 0 : 1;
      return am - bm || a.localeCompare(b);
    });
  }, [entries]);

  const visible = tag ? entries.filter((e) => e.tags.includes(tag)) : entries;
  const playable = visible.filter((e) => e.status === "playable");
  const workshop = visible.filter((e) => e.status === "workshop");
  const open = entries.find((e) => e.title === openTitle) ?? null;

  return (
    <>
      {entries.length === 0 ? (
        <div className="mt-[var(--space-6)] rounded-[var(--radius-surface)] border border-dashed border-rule p-[var(--space-5)]">
          {emptyNote}
        </div>
      ) : (
        <>
          {allTags.length > 0 ? (
            <div className="mt-[var(--space-5)] flex flex-wrap items-center gap-[var(--space-2)]">
              <span className="text-[0.7rem] uppercase tracking-[0.18em] text-muted">Filter</span>
              <button type="button" onClick={() => setTag(null)} aria-pressed={tag === null}>
                <Badge variant={tag === null ? "link" : "neutral"}>all</Badge>
              </button>
              {allTags.map((t) => (
                <button key={t} type="button" onClick={() => setTag(t)} aria-pressed={tag === t}>
                  <Badge variant={tag === t ? "link" : "neutral"}>{t}</Badge>
                </button>
              ))}
            </div>
          ) : null}

          {playable.length > 0 ? <Shelf label="Playable now" entries={playable} onOpen={openFrom} /> : null}
          {workshop.length > 0 ? <Shelf label="In the workshop" entries={workshop} onOpen={openFrom} /> : null}

          {visible.length === 0 ? (
            <p className="mt-[var(--space-6)] text-muted">Nothing carries that tag.</p>
          ) : null}
        </>
      )}

      {/* The title view. Drawer gives a real dialog: focus trapped, Escape closes, usable on a phone. */}
      <Drawer
        open={open !== null}
        onClose={() => setOpenTitle(null)}
        side="right"
        title={open?.title ?? "Cabinet"}
        returnFocusTo={openerRef}
      >
        {open ? (
          <div>
            {/* The play area. A fixed aspect, because a game wants a screen, not a paragraph. v0 shows
                the frame; the game itself loads here once entries point at a URL. */}
            {/* The play area. Fixed aspect, because a game wants a screen, not a paragraph. The frame
                is sandboxed and cross-origin, so this page cannot read the score, pause the loop or
                measure the content — the arcade offers a Reload, which is a real restart, and nothing
                it cannot do. Rules for authors: ./AUTHOR_PROMPT.md. */}
            {open.playUrl ? (
              <>
                <div className="aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-surface)] border border-rule">
                  <iframe
                    key={frameKey}
                    title={`${open.title} — playable here`}
                    src={open.playUrl}
                    className="h-full w-full"
                    referrerPolicy="no-referrer"
                    data-arcade-player={open.playUrl}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
                  />
                </div>
                <div className="mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-3)]">
                  <Button variant="outline" onClick={() => setFrameKey((k) => k + 1)}>
                    Reload the game
                  </Button>
                  <a href={open.playUrl} target="_blank" rel="noopener noreferrer">
                    Open separately <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-[var(--radius-surface)] border border-rule px-[var(--space-4)] text-center text-[0.7rem] uppercase tracking-[0.2em] text-muted">
                Not playable yet
              </div>
            )}

            {/* The player replaces the old separate Play button: the game is already running above, so
                a second control that only meant "the game is up there" would be noise. Close stays. */}
            <div className="mt-[var(--space-4)] flex flex-wrap items-center gap-[var(--space-3)]">
              <Button variant="outline" onClick={() => setOpenTitle(null)}>
                Close
              </Button>
            </div>

            {open.description ? (
              <p className="measure-prose mt-[var(--space-4)]">{open.description}</p>
            ) : null}

            <dl className="mt-[var(--space-5)] grid grid-cols-2 gap-[var(--space-4)]">
              <div>
                <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-muted">Status</dt>
                <dd className="mt-[var(--space-1)] text-[0.9rem]">
                  {open.status === "playable" ? "Playable" : "In the workshop"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-muted">Added</dt>
                <dd className="mt-[var(--space-1)] text-[0.9rem]">{open.added ?? "—"}</dd>
              </div>
            </dl>

            <div className="mt-[var(--space-5)]">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted">Tags</p>
              <div className="mt-[var(--space-2)]">
                <TagRow tags={open.tags} onPick={(t) => { setTag(t); setOpenTitle(null); }} />
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
