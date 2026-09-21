"use client";

// Searchable component picker with inline previews (docs/2026-refresh.md §10, package 1).
//
// The picker inserts a block into the existing save form. It is deliberately an EXPLICIT
// catalog, not a registry fetch and not arbitrary JSX: the four kinds below are the ones
// the bundle renderer can produce, and each preview renders the SAME markup shape the
// renderer emits, so what you see here is what the saved revision renders.
//
// Controls are the shared shadcn-adapted Input and Button, so the editor keeps one kit.
// Search is a plain controlled input; the list is a real listbox with roving focus and
// Escape/arrow handling, because a picker that only works with a mouse is not finished.

import { useEffect, useMemo, useRef, useState } from "react";

import { FORM_STATE_EVENT } from "@/editor/forms/draft-baseline";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Kind = "paragraph" | "heading" | "callout" | "figure";

type CatalogEntry = {
  kind: Kind;
  name: string;
  detail: string;
  /** Extra words a person might search for. */
  keywords: string[];
};

const CATALOG: CatalogEntry[] = [
  {
    kind: "paragraph",
    name: "Paragraph",
    detail: "Body copy. A blank line starts a new paragraph.",
    keywords: ["text", "body", "copy", "p"],
  },
  {
    kind: "heading",
    name: "Section heading",
    detail: "A section title. Emitted as an h2 in the rendered issue.",
    keywords: ["title", "h2", "section", "break"],
  },
  {
    kind: "callout",
    name: "Callout",
    detail: "A note, tip or warning. The tone is stated in words as well as by colour.",
    keywords: ["note", "tip", "warning", "aside", "notice"],
  },
  {
    kind: "figure",
    name: "Figure",
    detail: "An image with required alt text and an optional caption.",
    keywords: ["image", "img", "picture", "photo", "diagram"],
  },
];

/**
 * Preview markup mirroring `renderBlocksToHtml` exactly, including the class names the
 * renderer stylesheet targets. If these drift, a preview stops being evidence.
 */
function Preview({ kind }: { kind: Kind }) {
  switch (kind) {
    case "heading":
      return <p className="text-lg font-semibold text-ink">Section heading</p>;
    case "callout":
      return (
        <aside className="callout" data-tone="note">
          <p className="callout-label">Note</p>
          <p className="callout-title">Example callout</p>
          <p>Callout body text, styled by the same rules the saved revision uses.</p>
        </aside>
      );
    case "figure":
      return (
        <figure>
          {/* A neutral 16:9 sample, not a fabricated product screenshot. */}
          <span
            aria-hidden="true"
            className="block h-16 w-full rounded-[var(--radius-surface)] border border-rule bg-paper-raised"
          />
          <figcaption>Figure caption (optional)</figcaption>
        </figure>
      );
    default:
      return <p>Body text. A blank line starts a new paragraph.</p>;
  }
}

export default function BlockPicker() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Kind | null>(null);
  /**
   * A stable identity for the block this picker is about to add.
   *
   * Generated ONCE per selection, in the browser, and carried in the form. Without it the preview
   * and the save each normalise the pending block and each mint their own UUID, so the block's
   * `data-block` differs between what the author was shown and what was stored, and the revision
   * hash moves for a reason that has nothing to do with the words.
   */
  const [pendingId, setPendingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function choose(kind: Kind) {
    setSelected(kind);
    setPendingId((current) => current ?? `blk_new_${crypto.randomUUID()}`);
  }

  /**
   * Announce the selection once React has written it into the form.
   *
   * `newKind` and `newId` are hidden inputs whose values come from state, so picking a component
   * adds a block to the draft without any input event. Announcing from an effect (not from the
   * click handler) means the panel reads the values that are actually in the DOM.
   */
  const announced = useRef(false);
  useEffect(() => {
    if (!announced.current) {
      announced.current = true;
      return;
    }
    const form = document.querySelector("form[data-unsaved-guard]");
    form?.dispatchEvent(new CustomEvent(FORM_STATE_EVENT, { bubbles: true }));
  }, [selected, pendingId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter((entry) =>
      [entry.name, entry.detail, ...entry.keywords].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [query]);

  function moveFocus(delta: number) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button[role='option']") ?? [],
    );
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    const next = current === -1 ? 0 : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className="rounded-[var(--radius-surface)] border border-dashed border-rule p-3">
      <p className="text-xs text-muted">Insert a block</p>

      <label className="mt-2 block text-sm" htmlFor="block-picker-search">
        Search components
      </label>
      <Input
        id="block-picker-search"
        type="search"
        value={query}
        placeholder="try: image, note, heading…"
        className="mt-1"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveFocus(1);
          }
          if (event.key === "Escape") setQuery("");
        }}
      />

      <p className="meta mt-2" aria-live="polite">
        {matches.length === CATALOG.length
          ? `${CATALOG.length} components available`
          : `${matches.length} of ${CATALOG.length} components match “${query}”`}
      </p>

      <ul
        ref={listRef}
        role="listbox"
        aria-label="Component picker"
        className="mt-2 flex list-none flex-col gap-[var(--space-1)] pl-0"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveFocus(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveFocus(-1);
          }
        }}
      >
        {matches.map((entry) => {
          const isSelected = selected === entry.kind;
          return (
            <li key={entry.kind} className="border-t border-rule pt-[var(--space-2)]">
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(entry.kind)}
                className={`w-full rounded-[var(--radius-chip)] px-[var(--space-2)] py-[var(--space-2)] text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isSelected ? "bg-paper-raised ring-1 ring-[var(--accent)]" : "hover:bg-paper-raised"
                }`}
              >
                <span className="flex flex-wrap items-center gap-[var(--space-2)]">
                  <span className="font-medium text-ink">{entry.name}</span>
                  {isSelected ? (
                    <span className="meta rounded-[var(--radius-chip)] bg-[var(--accent)] px-[var(--space-2)] text-[var(--on-accent)]">
                      Selected
                    </span>
                  ) : null}
                </span>
                <span className="meta mt-[var(--space-1)] block">{entry.detail}</span>
              </button>
              {isSelected ? (
                <div className="mt-[var(--space-2)] rounded-[var(--radius-chip)] border border-rule bg-paper p-[var(--space-3)]">
                  <p className="meta uppercase tracking-wide">Preview</p>
                  <div className="mt-[var(--space-2)] text-sm">
                    <Preview kind={entry.kind} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No component matches that search. Clear it to see all {CATALOG.length}.
        </p>
      ) : null}

      {/* The picker's choice is submitted with the form. Fields for kinds that do not
          apply stay empty and are ignored by validation. */}
      <input type="hidden" name="newKind" value={selected ?? ""} />
      {/* The pending block's identity, so preview and save describe the same block. */}
      <input type="hidden" name="newId" value={pendingId ?? ""} />

      {selected ? (
        <div className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
          {selected === "figure" ? (
            <>
              <label className="text-sm" htmlFor="newSrc">
                Image path (local, under /public)
              </label>
              <Input id="newSrc" name="newSrc" placeholder="/projects/example/hero.png" />
              <label className="text-sm" htmlFor="newAlt">
                Alt text (required)
              </label>
              <Input id="newAlt" name="newAlt" placeholder="What the image shows" />
              <label className="text-sm" htmlFor="newCaption">
                Caption (optional)
              </label>
              <Input id="newCaption" name="newCaption" />
            </>
          ) : null}

          {selected === "callout" ? (
            <>
              <label className="text-sm" htmlFor="newTone">
                Tone
              </label>
              <select
                id="newTone"
                name="newTone"
                defaultValue="note"
                className="rounded-[var(--radius-chip)] border border-rule bg-[var(--field-background)] px-[var(--space-3)] py-[var(--space-2)] text-ink"
              >
                <option value="note">Note</option>
                <option value="tip">Tip</option>
                <option value="warning">Warning</option>
              </select>
              <label className="text-sm" htmlFor="newCalloutTitle">
                Title (optional)
              </label>
              <Input id="newCalloutTitle" name="newTitle" />
            </>
          ) : null}

          {selected === "heading" ? (
            <>
              <label className="text-sm" htmlFor="newHeadingText">
                Heading text
              </label>
              <Input id="newHeadingText" name="newHeading" />
            </>
          ) : null}

          {selected !== "heading" && selected !== "figure" ? (
            <label className="text-sm" htmlFor="newMarkdown">
              Text (a blank line starts a new paragraph)
            </label>
          ) : null}

          {selected !== "heading" && selected !== "figure" ? (
            <textarea
              id="newMarkdown"
              name="newMarkdown"
              rows={4}
              className="w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-2 py-1 font-mono text-sm text-ink"
            />
          ) : null}

          <p className="meta">
            Chosen: <strong>{selected}</strong>. It is added when you save a new revision.
          </p>
          <Button type="button" variant="ghost" onClick={() => { setSelected(null); setPendingId(null); }}>
            Clear selection
          </Button>
        </div>
      ) : (
        <p className="meta mt-2">Choose a component above, then fill in its fields.</p>
      )}
    </div>
  );
}
