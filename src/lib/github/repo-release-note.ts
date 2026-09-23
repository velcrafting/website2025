// src/lib/github/repo-release-note.ts
//
// ============================================================================
// THE RELEASE-NOTE FILE CONVENTION — where a project states its own version
// (docs/implementation_plan_Sep16.md §5, tasks 3.1–3.5. Decision D2, 2026-09-16.)
// ============================================================================
//
// WHAT THIS FILE IS
//
//   Each project repository MAY carry one small, hand-editable file at its ROOT that states the
//   version that repository is on, plus one or more one-line notes about its latest change.
//   The project cards on `/projects` read it and render a chip:
//
//       [ Version 2026.09 ]  Latest: The project index is now one filterable list.
//
//   A repository that does not have the file simply has no chip. That is the designed outcome, not
//   a degraded one.
//
// WHERE — the file name and its location
//
//   File name:   release-note.json
//   Location:    the ROOT of that project's own repository
//                (not `docs/`, not `.github/`, not a subdirectory)
//   Branch:      the repository's default branch. The read is an unauthenticated public read of
//
//                    https://raw.githubusercontent.com/<owner>/<repo>/HEAD/release-note.json
//
//                so `HEAD` means whatever the default branch points at right now. There is no
//                release, no tag, no token, no CI step and no publish step in the path: commit the
//                file and the card picks it up on the next read. The read carries the site's existing
//                daily revalidation window (DAILY_REVALIDATE_SECONDS), so it is request-driven and
//                needs no scheduler.
//
// THE EXACT SHAPE — one JSON object, UTF-8
//
//   {
//     "version": "2026.09",
//     "updated": "2026-09-16",
//     "notes": [
//       "The project index is now one filterable list.",
//       "Fixed a crash on the cold-start path."
//     ]
//   }
//
//   version   REQUIRED. A string. Trimmed. It must be non-empty and at most 24 characters long.
//             Anything else — absent, empty, whitespace-only, a number, a boolean, an object, or
//             longer than 24 characters — makes the whole file unusable, and the card shows NO CHIP.
//
//   updated   Optional. A string, exactly `YYYY-MM-DD`. A malformed or absent date is dropped and
//             contributes nothing; it never blocks the chip and is never reformatted or guessed.
//
//   notes     Optional, but this is the point of the file. An array of strings, newest first.
//             Each entry is trimmed. An entry that is not a string, or is empty or whitespace-only
//             after trimming, or is longer than 200 characters, is DROPPED — never truncated and
//             never repaired. At most the first 5 usable entries are kept.
//             Only the FIRST usable entry is shown, as the one-sentence "Latest:" update. The rest
//             are read and validated but are not currently rendered on a card; the shape carries
//             them so a later surface (a changelog, a card disclosure) can use them without a file
//             format change.
//
//   A version plus one good sentence is a complete file; every other field is optional. Extra keys
//   are ignored — the file is authored text, and an unknown key is not an error.
//
// WHAT HAPPENS WHEN THE FILE IS MISSING OR MALFORMED — the file is never guessed at
//
//   no file at all        the public read answers 404      → status `absent`     → NO CHIP.
//                         The card renders exactly as it did before this feature existed.
//
//   unreadable body       not valid JSON, or valid JSON that is not an object (a bare string,
//                         number, array or `null`), or an object with no usable `version`
//                                                            → status `invalid`    → NO CHIP.
//
//                         A file WITH a usable version but NO usable note is NOT malformed: the
//                         chip renders the version and no "Latest:" line. Only the version is
//                         load-bearing.
//
//   the read failed       HTTP 5xx, a rate limit, a timeout, a thrown network error or an empty
//                         body → status `transient` → NO CHIP.
//
//   owner not approved    → status `unavailable` → NO CHIP, and nothing is fetched at all.
//
//   body over the bound   4 000 bytes, measured on the bytes that actually arrived (a
//                         `Content-Length` header is a claim, not a bound) → status `invalid`.
//
//   ABSENCE MUST NEVER PRODUCE A PLACEHOLDER VERSION. There is no "v0.0.0", no "unreleased", no
//   "—", no "no release notes yet" and no inherited version — not from another repository and not
//   from this website's own `src/lib/release-notes.json`. A card with no chip is the honest
//   rendering of "this repository does not say which version it is on". Same discipline as the
//   private-repo gate on `/projects`, where only `private === false` renders.
//
//   `transient` and `absent` are deliberately DIFFERENT states with the same visible outcome
//   (no chip) so that the page can say which one happened: a failure is not evidence that the
//   project publishes no release note. Do not collapse them.
//
// A NOTE ON THE OTHER RELEASE FILE — they are not the same thing
//
//   `src/lib/release-notes.json` (validated by `src/lib/release-notes.ts`) describes THIS WEBSITE's
//   own deploy: which build iteration of the site is live. It is not, and must not become, a source
//   for any project's version. This module reads a file inside a DIFFERENT repository, per project.
//
// HOW THIS MODULE IS BUILT — an adapter, not a second fetcher (task 3.2)
//
//   It reuses the existing public-read path (`readPublicText` from ./portfolio-source: the daily
//   window, `404 → not_found`, anything else → `transient`, and it never throws) and the existing
//   tolerant validator (`readReleaseNotes` from @/lib/release-notes), which is the same validator
//   the website's own release file uses. One validator, so the two cannot drift.
//
//   It adds only what neither of those did for a per-project file:
//     - the raw URL for `release-note.json` at the default branch;
//     - the approved-owner boundary (APPROVED_OWNERS from ./readme-index), plus a strict shape
//       check on the owner and repo segments before they are put into a URL path;
//     - a byte bound measured on the real body (utf8Bytes from ./tool-readme).
//
//   Every function here is total: it never throws, and every failure is classified rather than
//   collapsed. There is no catch-and-return-nothing anywhere — "no data" and "read failed" are
//   different states and they stay different.

import { readReleaseNotes, type ReleaseNotes } from "@/lib/release-notes";

import { readPublicText, type FetchLike } from "./portfolio-source";
import { APPROVED_OWNERS } from "./readme-index";
import { utf8Bytes } from "./tool-readme";

/** The file name this convention reserves, at the root of each project repository. */
export const RELEASE_NOTE_FILE = "release-note.json";

/**
 * The most bytes of a release note this site will accept.
 *
 * The file holds one version and at most five one-line notes, so 4 KiB is already generous; the
 * bound exists so a huge or accidentally binary file at that path is refused rather than parsed.
 * It bounds the BODY, after it is read — `Content-Length` is never consulted.
 */
export const RELEASE_NOTE_BYTE_BOUND = 4_000;

/** One repository address. `owner`/`repo` only — never a full URL from untrusted text. */
export type RepoRef = { owner: string; repo: string };

/** The one URL this convention reads. `HEAD` is the repository's default branch. */
export function releaseNoteUrlFor(ref: RepoRef): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD/${RELEASE_NOTE_FILE}`;
}

/**
 * The only owners this site publishes links to, and therefore the only owners it will read a
 * release note from. Unknown owners are never fetched.
 */
export function isApprovedOwner(owner: string): boolean {
  return APPROVED_OWNERS.some((approved) => approved.toLowerCase() === owner.toLowerCase());
}

/** GitHub owner and repository names are restricted to this character set in the URL path. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export type RepoReleaseNoteRead =
  /** A version was read and validated. This is the ONLY state that renders a chip. */
  | { status: "ok"; release: ReleaseNotes; url: string; bytes: number }
  /** Confirmed 404: the repository does not have the file. No chip. Evidence of absence, not failure. */
  | { status: "absent"; url: string }
  /** The file exists but is unusable: not JSON, not an object, no usable version, or too large. No chip. */
  | { status: "invalid"; url: string; reason: string }
  /** The read itself failed. No chip — and no claim that the file is absent. */
  | { status: "transient"; url: string; reason: string }
  /** Not an approved owner, or not a usable owner/repo pair. Nothing was fetched. No chip. */
  | { status: "unavailable"; reason: string };

/**
 * Read one repository's `release-note.json`.
 *
 * Total: never throws, and never returns a version that was not read out of a validated body.
 * A caller branches on `status`; it never has to catch.
 */
export async function readRepoReleaseNote(
  ref: { owner: unknown; repo: unknown },
  fetchImpl: FetchLike,
): Promise<RepoReleaseNoteRead> {
  const owner = typeof ref?.owner === "string" ? ref.owner.trim() : "";
  const repo = typeof ref?.repo === "string" ? ref.repo.trim() : "";

  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) {
    return { status: "unavailable", reason: "no usable owner/repo pair" };
  }
  if (!isApprovedOwner(owner)) {
    return { status: "unavailable", reason: `owner "${owner}" is not an approved owner` };
  }

  const url = releaseNoteUrlFor({ owner, repo });
  const outcome = await readPublicText(url, fetchImpl);

  if (outcome.status === "not_found") return { status: "absent", url };
  if (outcome.status === "transient") {
    return { status: "transient", url, reason: outcome.reason };
  }

  const bytes = utf8Bytes(outcome.text);
  if (bytes > RELEASE_NOTE_BYTE_BOUND) {
    return {
      status: "invalid",
      url,
      reason: `body is ${bytes} bytes, over the ${RELEASE_NOTE_BYTE_BOUND}-byte bound`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.text);
  } catch {
    return { status: "invalid", url, reason: "body is not valid JSON" };
  }

  // The shared validator. `null` means "no usable version", which is exactly the unusable case:
  // it drops the file rather than filling the gap with anything.
  const release = readReleaseNotes(parsed);
  if (!release) return { status: "invalid", url, reason: "no usable version string" };

  return { status: "ok", release, url, bytes };
}

export type RepoReleaseNotes = {
  /** Keyed `owner/repo`, exactly as the caller passed it. */
  byRepo: Record<string, RepoReleaseNoteRead>;
  /** Status → how many refs landed in it. Every requested ref is counted exactly once. */
  states: Record<string, number>;
  /** Cards that produced a chip. */
  chips: number;
  /**
   * Cards whose state is neither `ok` nor `absent`: the file was unusable or the read failed.
   * Kept separate from `absent` so the page can say "not read" instead of implying "none published".
   */
  unreadable: number;
};

/**
 * Read `release-note.json` for a list of repositories, once each.
 *
 * Duplicates are dropped by `owner/repo`, and the reads are sequential on purpose: this is a
 * daily-window read of a handful of small files, and the card list is stable. Nothing is retried
 * and nothing is cached in memory here — the framework's fetch cache is the cache.
 */
export async function readRepoReleaseNotes(
  refs: Array<{ owner: unknown; repo: unknown }>,
  fetchImpl: FetchLike,
): Promise<RepoReleaseNotes> {
  const byRepo: Record<string, RepoReleaseNoteRead> = {};
  const states: Record<string, number> = {};
  const seen = new Set<string>();
  let chips = 0;
  let unreadable = 0;

  for (const ref of refs) {
    const owner = typeof ref?.owner === "string" ? ref.owner.trim() : "";
    const repo = typeof ref?.repo === "string" ? ref.repo.trim() : "";
    const key = `${owner}/${repo}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let read: RepoReleaseNoteRead;
    try {
      read = await readRepoReleaseNote({ owner, repo }, fetchImpl);
    } catch (error) {
      // `readRepoReleaseNote` is total, so this only fires if a caller-supplied fetch impl breaks
      // its own contract. Classified, not swallowed: it renders no chip and is counted as unread.
      read = {
        status: "transient",
        url: releaseNoteUrlFor({ owner, repo }),
        reason: error instanceof Error ? error.message : "read threw",
      };
    }

    byRepo[key] = read;
    states[read.status] = (states[read.status] ?? 0) + 1;
    if (read.status === "ok") chips += 1;
    else if (read.status !== "absent") unreadable += 1;
  }

  return { byRepo, states, chips, unreadable };
}
