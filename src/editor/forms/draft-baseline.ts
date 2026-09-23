// One canonical snapshot of the fields that are actually PERSISTED, used to answer a single
// question: does what is on screen differ from what is saved?
//
// Why a snapshot rather than a flag set on every input event:
//
//   - A flag cannot go back to clean. Retyping the original words is not "unsaved changes", but a
//     flag raised on the first keystroke can never notice that the text matches again.
//   - A flag cannot see changes that fire no event. The picker's kind and identity live in hidden
//     inputs written by React state, so choosing a component changes the draft without a single
//     `input` event.
//   - A flag counts things that are not content. The picker's search box is a control for finding a
//     component, not writing; typing in it must not mark a draft as changed.
//
// The baseline is computed by the SERVER from the saved revision and carried in a hidden field, so
// it is the saved data by construction. It cannot be confused by a client-side restore: restoring
// rejected writing puts values back into the form, and compared against saved data that correctly
// reads as unsaved.

import { blockKindOf } from "../contracts/types";

/** The fields of one block that end up in a stored revision. */
export type SnapshotBlock = {
  id: string;
  kind: string;
  heading: string;
  markdown: string;
  locked: boolean;
  tone: string;
  title: string;
  src: string;
  alt: string;
  caption: string;
};

export type SnapshotParts = {
  title: string;
  summary: string;
  byline: string;
  blocks: Array<Partial<SnapshotBlock>>;
  /** The block the picker is about to add. Empty (and unlocked) when none is chosen. */
  pending: Partial<SnapshotBlock>;
};

const EMPTY_BLOCK: SnapshotBlock = {
  id: "",
  kind: "",
  heading: "",
  markdown: "",
  locked: false,
  tone: "",
  title: "",
  src: "",
  alt: "",
  caption: "",
};

/** The hidden field the editor page renders with the saved snapshot. Never part of the snapshot. */
export const BASELINE_FIELD = "__savedDraft";

/**
 * Broadcast after a programmatic change the browser does not report: a restore, or a picker
 * selection. React writes those values without dispatching `input`, so the panel is told directly
 * rather than being left to guess from a stale flag.
 */
export const FORM_STATE_EVENT = "editor:form-state";

/**
 * Normalisation has to match the PERSISTENCE path exactly, or the panel reports changes that a save
 * would not make. The save path trims the title, summary and byline before storing them, and the
 * validator trims headings and every kind-specific field (asset paths, alt text, captions, callout
 * tones and titles). Markdown is different: it is newline-canonicalised but never trimmed, since
 * leading or trailing whitespace in prose can be deliberate.
 *
 * So there are two normalisations here, not one, and each field uses the one its own path uses.
 */
function text(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

/** For fields the save path or the validator trims. */
function trimmed(value: unknown): string {
  return text(value).trim();
}

function block(partial: Partial<SnapshotBlock>): SnapshotBlock {
  return {
    ...EMPTY_BLOCK,
    ...partial,
    id: text(partial.id),
    kind: text(partial.kind),
    // A heading is validated through `optionalText`, which trims.
    heading: trimmed(partial.heading),
    // Markdown is NOT trimmed — only newline-canonicalised, as the validator does.
    markdown: text(partial.markdown),
    locked: Boolean(partial.locked),
    // Every kind-specific field goes through `optionalText`, which trims.
    tone: trimmed(partial.tone),
    title: trimmed(partial.title),
    src: trimmed(partial.src),
    alt: trimmed(partial.alt),
    caption: trimmed(partial.caption),
  };
}

/** Fixed key order, so two equivalent drafts serialise identically regardless of how they were built. */
export function canonicalSnapshot(parts: SnapshotParts): string {
  return JSON.stringify({
    title: trimmed(parts.title),
    summary: trimmed(parts.summary),
    byline: trimmed(parts.byline),
    blocks: parts.blocks.map((entry) => block(entry)),
    pending: block(parts.pending),
  });
}

/** The saved snapshot, from the revision the server actually stored. */
export function snapshotFromRevision(input: {
  title: string;
  summary?: string | null;
  byline?: string | null;
  blocks: Array<{
    id: string;
    kind?: unknown;
    heading?: string;
    markdown?: string;
    humanLocked?: boolean;
    data?: Record<string, unknown> | null;
  }>;
}): string {
  return canonicalSnapshot({
    title: input.title ?? "",
    summary: input.summary ?? "",
    byline: input.byline ?? "",
    blocks: input.blocks.map((entry) =>
      block({
        id: String(entry.id ?? ""),
        // The same derivation the reader uses, so a legacy block and its selector agree.
        kind: blockKindOf({ kind: entry.kind, heading: entry.heading }),
        heading: entry.heading ?? "",
        markdown: entry.markdown ?? "",
        locked: Boolean(entry.humanLocked),
        tone: String(entry.data?.tone ?? ""),
        title: String(entry.data?.title ?? ""),
        src: String(entry.data?.src ?? ""),
        alt: String(entry.data?.alt ?? ""),
        caption: String(entry.data?.caption ?? ""),
      }),
    ),
    pending: {},
  });
}

/**
 * A control whose value is content. Everything else is a control, not writing.
 *
 * Deliberately duck-typed rather than using `instanceof HTMLInputElement`: this module is imported
 * by server code and by tests as well as by the browser, and a DOM class does not exist there.
 */
export function isContentControl(target: EventTarget | null): boolean {
  const element = target as
    | { name?: unknown; type?: unknown; dataset?: Record<string, string> }
    | null;
  if (!element) return false;
  if (element.type === "search") return false;
  if (element.dataset?.notContent === "true") return false;
  const name = typeof element.name === "string" ? element.name : "";
  return name !== "" && !name.startsWith("__") && !name.startsWith("$ACTION");
}

function derivedKind(heading: string): string {
  return heading.trim() ? "heading" : "paragraph";
}

/** The live draft, read from the form: exactly the fields a save would read. */
export function snapshotFromForm(form: HTMLFormElement): string {
  const value = (name: string): string => {
    const found = form.elements.namedItem(name);
    if (!found || found instanceof RadioNodeList) return "";
    const element = found as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return element.checked ? "true" : "";
    }
    return element.value;
  };

  const count = Number(value("blockCount") || 0);
  const blocks: SnapshotBlock[] = [];
  for (let index = 0; index < count; index += 1) {
    const prefix = `block.${index}.`;
    const heading = value(`${prefix}heading`);
    blocks.push(
      block({
        id: value(`${prefix}id`),
        kind: value(`${prefix}kind`) || derivedKind(heading),
        heading,
        markdown: value(`${prefix}markdown`),
        locked: value(`${prefix}locked`) === "true",
        tone: value(`${prefix}tone`),
        title: value(`${prefix}title`),
        src: value(`${prefix}src`),
        alt: value(`${prefix}alt`),
        caption: value(`${prefix}caption`),
      }),
    );
  }

  // A pending block exists only once the picker has chosen a kind, which is how the server's
  // baseline describes it (an empty, unlocked pending block).
  const pendingKind = value("newKind");
  return canonicalSnapshot({
    title: value("title"),
    summary: value("summary"),
    byline: value("byline"),
    blocks,
    pending: pendingKind
      ? {
          id: value("newId"),
          kind: pendingKind,
          heading: value("newHeading"),
          markdown: value("newMarkdown"),
          locked: true,
          tone: value("newTone"),
          title: value("newTitle"),
          src: value("newSrc"),
          alt: value("newAlt"),
          caption: value("newCaption"),
        }
      : {},
  });
}
