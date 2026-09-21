// src/lib/release-notes.ts
//
// The version chip's source of truth is a file in this repository, not a GitHub release.
//
// Why the file convention: the notes are Steven's own authored text, so they need no external consent
// or network read, they cannot rate-limit, they work in the isolated review instances and in tests, and
// — the deciding reason — the version shown always matches the version actually deployed. A GitHub
// release can be newer than this build, which would advertise something the site does not have.
//
// Validation is deliberately tolerant and never throws: a malformed or missing file must simply render
// no chip rather than break the page. Anything unusable is dropped, not guessed at.
//
// The validator is pure and takes its input as an argument, so it has no file or framework dependency
// and can be exercised directly by the checks in tests/portfolio/release-notes.test.mjs.

export type ReleaseNotes = {
  version: string;
  updated: string | null;
  /** The one-line summary shown beside the chip. */
  note: string | null;
  /** The bullet list behind the disclosure, newest first. */
  notes: string[];
};

const MAX_VERSION_CHARS = 24;
const MAX_NOTE_CHARS = 200;
const MAX_NOTES = 5;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readReleaseNotes(input: unknown): ReleaseNotes | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as { version?: unknown; updated?: unknown; notes?: unknown };

  if (typeof candidate.version !== "string") return null;
  const version = candidate.version.trim();
  if (!version || version.length > MAX_VERSION_CHARS) return null;

  const updatedRaw = typeof candidate.updated === "string" ? candidate.updated.trim() : "";
  const updated = ISO_DATE.test(updatedRaw) ? updatedRaw : null;

  const list = Array.isArray(candidate.notes) ? candidate.notes : [];
  const notes = list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= MAX_NOTE_CHARS)
    .slice(0, MAX_NOTES);

  return { version, updated, note: notes[0] ?? null, notes };
}
