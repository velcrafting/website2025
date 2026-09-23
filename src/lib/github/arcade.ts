// src/lib/github/arcade.ts
//
// Discovery and metadata for the arcade. F4, 2026-09-17.
//
// TWO PARTS, and neither is a new mechanism:
//
//   The FLAG is a `## Arcade` section on the profile README. README inclusion is already this project's
//   authorised inclusion rule for the portfolio, so the arcade reuses `extractReadmeIndex` unchanged —
//   passing a source whose allowedSections is just ["Arcade"]. A repository listed there is on the shelf.
//   A GitHub topic was the first instinct and is the wrong tool: invisible where Steven edits, and it
//   carries no metadata.
//
//   The CARD is `arcade.json` at the root of each game repository, read through the same public-read
//   path as release-note.json: approved owners, daily window, last-good, byte bound on the real body,
//   and a total function the caller branches on instead of catching.
//
// FAIL CLOSED, NEVER FILL. This module never invents a game, a title, a model name or a version:
//
//   repo not listed in the index       → not on the shelf, and nothing is fetched from it
//   listed, no arcade.json             → an entry with the repository name only
//   arcade.json malformed or oversized → the entry stands, the file is ignored. Never half-parsed
//   read fails (5xx, timeout, empty)   → the entry stands without the file's fields. Never an empty shelf
//   playUrl absent or not https        → no player; the card says it is not playable yet
//
// The index read failing is reported, not hidden: `missing` from extractReadmeIndex is surfaced so a
// degraded discovery is visible instead of looking like an empty arcade.

import { APPROVED_OWNERS, extractReadmeIndex, parseRepoUrl, PERSONAL_README, type ReadmeSource } from "./readme-index";
import { readPublicText, type FetchLike } from "./portfolio-source";

/** Local to this module, matching the pattern in tool-readme.ts and repo-release-note.ts. */
export type RepoRef = { owner: string; repo: string };

/** The README section that means "this repository is a game". */
export const ARCADE_SECTION = "Arcade";

export const ARCADE_FILE = "arcade.json";

/** Bound on the metadata file, measured on the body that actually arrived. */
export const ARCADE_BYTE_BOUND = 4_000;

const MAX_SUMMARY = 200;
const MAX_DESCRIPTION = 600;
const MAX_TAGS = 5;
const MAX_TAG = 40;
const MAX_ADDED = 20;

/** The arcade reads the personal README, and only the Arcade section of it. */
export const ARCADE_README: ReadmeSource = {
  ...PERSONAL_README,
  allowedSections: [ARCADE_SECTION],
};

export type ArcadeEntry = {
  repo: string;
  owner: string;
  title: string;
  summary: string;
  description?: string;
  playUrl?: string;
  tags: string[];
  status: "playable" | "workshop";
  added?: string;
  /** Where the card's fields came from, for honesty in the UI and in tests. */
  metaState: "ok" | "absent" | "invalid" | "transient" | "unavailable";
};

export type ArcadeRead = {
  entries: ArcadeEntry[];
  /** Allowed sections that were absent from the README — a degraded parse is visible, never silent. */
  missing: string[];
  /** True when the README itself could not be read. */
  discoveryFailed: boolean;
};

export function isApprovedOwner(owner: string): boolean {
  return APPROVED_OWNERS.some((approved) => approved.toLowerCase() === owner.toLowerCase());
}

export function arcadeUrlFor(ref: RepoRef): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD/${ARCADE_FILE}`;
}

export type ArcadeFileStatus =
  | { status: "ok"; fields: ArcadeFields; url: string; bytes: number }
  | { status: "absent"; url: string }
  | { status: "invalid"; url: string; reason: string }
  | { status: "transient"; url: string; reason: string }
  | { status: "unavailable"; reason: string };

export type ArcadeFields = {
  summary: string;
  description?: string;
  playUrl?: string;
  tags: string[];
  status: "playable" | "workshop";
  added?: string;
};

/**
 * An https URL, and nothing else — with one fixture-only seam.
 *
 * PRODUCTION RULE, unchanged: only `https:` survives. Anything else means no player rather than a frame
 * around something unexpected. Do not add schemes or hosts here.
 *
 * THE FIXTURE SEAM: when `PORTFOLIO_FIXTURE_BASE` is configured, a URL on that exact origin is also
 * accepted, so a disposable local fixture can serve the game bytes and the embedded player can be exercised
 * end to end. The variable is unset in production, so this branch cannot be reached there. It relaxes
 * nothing about the production rule; it adds a path that only exists while the fixture seam is switched on.
 * An independent re-review asked for exactly this: prove the embedded iframe locally without weakening
 * HTTPS validation.
 */
const FIXTURE_ORIGIN: string | null = (() => {
  const base = process.env.PORTFOLIO_FIXTURE_BASE?.trim();
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
})();

function playUrlOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:") return url.toString();
    if (FIXTURE_ORIGIN !== null && url.origin === FIXTURE_ORIGIN) return url.toString();
    return undefined;
  } catch {
    return undefined;
  }
}

function shortString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

/**
 * Validate a parsed arcade.json. Drops what it cannot trust and reports why; it never repairs or invents.
 * A version with no usable summary is still usable — the card falls back to the repository name — so a
 * missing summary is reported as invalid rather than silently blank.
 */
export function validateArcadeFields(input: unknown): { fields: ArcadeFields } | { reason: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { reason: "not a JSON object" };
  }
  const raw = input as Record<string, unknown>;

  const summary = shortString(raw.summary, MAX_SUMMARY);
  if (!summary) return { reason: `summary must be a non-empty string of ${MAX_SUMMARY} characters or fewer` };

  const status = raw.status === "playable" || raw.status === "workshop" ? raw.status : "workshop";

  const tags: string[] = Array.isArray(raw.tags)
    ? (raw.tags as unknown[])
        .map((t) => shortString(t, MAX_TAG))
        .filter((t): t is string => Boolean(t))
        .slice(0, MAX_TAGS)
    : [];

  return {
    fields: {
      summary,
      description: shortString(raw.description, MAX_DESCRIPTION),
      playUrl: playUrlOrUndefined(raw.playUrl),
      tags,
      status,
      added: shortString(raw.added, MAX_ADDED),
    },
  };
}

/**
 * Read one repository's arcade.json. Total: it never throws and the caller branches on `status`.
 * Modelled on readRepoReleaseNote, including the byte bound measured on the real body.
 */
export async function readArcadeFile(ref: RepoRef, fetchImpl: FetchLike): Promise<ArcadeFileStatus> {
  const url = arcadeUrlFor(ref);

  if (!ref.owner || !ref.repo) return { status: "unavailable", reason: "no usable owner/repo pair" };
  if (!isApprovedOwner(ref.owner)) {
    return { status: "unavailable", reason: `owner "${ref.owner}" is not an approved owner` };
  }

  const outcome = await readPublicText(url, fetchImpl);
  if (outcome.status === "not_found") return { status: "absent", url };
  if (outcome.status !== "ok") return { status: "transient", url, reason: outcome.reason };

  const bytes = new TextEncoder().encode(outcome.text).length;
  if (bytes > ARCADE_BYTE_BOUND) {
    return { status: "invalid", url, reason: `body is ${bytes} bytes, over the ${ARCADE_BYTE_BOUND}-byte bound` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.text);
  } catch {
    return { status: "invalid", url, reason: "not valid JSON" };
  }

  const validated = validateArcadeFields(parsed);
  if ("reason" in validated) return { status: "invalid", url, reason: validated.reason };

  return { status: "ok", fields: validated.fields, url, bytes };
}

/**
 * Read the whole shelf: the README index decides what exists, each repository's arcade.json decides what
 * the card says. A failure at either level keeps the entry standing with less information — never a
 * blank shelf because one fetch failed.
 */
export async function readArcade(readmeText: string | null, fetchImpl: FetchLike): Promise<ArcadeRead> {
  if (readmeText === null) {
    return { entries: [], missing: [ARCADE_SECTION], discoveryFailed: true };
  }

  const extraction = extractReadmeIndex(readmeText, ARCADE_README);
  const missing = extraction.missing as string[];

  const entries = await Promise.all(
    extraction.entries.map(async (entry): Promise<ArcadeEntry | null> => {
      const parsed = parseRepoUrl(entry.url ?? "");
      if (!parsed) return null;
      const ref: RepoRef = { owner: parsed.owner, repo: parsed.repo };

      const file = await readArcadeFile(ref, fetchImpl);
      const base: ArcadeEntry = {
        owner: ref.owner,
        repo: ref.repo,
        title: ref.repo,
        summary: "",
        tags: [],
        status: "workshop",
        metaState: file.status,
      };

      if (file.status !== "ok") return base;

      return {
        ...base,
        summary: file.fields.summary,
        description: file.fields.description,
        playUrl: file.fields.playUrl,
        tags: file.fields.tags,
        status: file.fields.status,
        added: file.fields.added,
      };
    }),
  );

  return {
    entries: entries.filter((e): e is ArcadeEntry => e !== null),
    missing,
    discoveryFailed: false,
  };
}
