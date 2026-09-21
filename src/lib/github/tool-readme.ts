// src/lib/github/tool-readme.ts
//
// The read path for ONE tool's own README, used by `/tools/<slug>` so the page can show what the
// tool is instead of only linking out to GitHub (docs/implementation_plan_Sep16.md §3).
//
// This is an adapter, not a second fetcher (task 1.2). It reuses the existing public-read path in
// `./portfolio-source` — `readPublicText`, which already carries the daily revalidate window and
// classifies a failure as transient rather than as an absence — and the existing approved-owner
// boundary in `./readme-index`. The only new work here is the two things neither of those did for
// a per-tool README:
//
//   - **An approved-owner check on the frontmatter's `repo` URL.** A tool page supplies its repo
//     URL as document frontmatter, so the URL is a trust boundary: the host must be exactly
//     `github.com` (not a lookalike) and the owner must be one of APPROVED_OWNERS. Anything else
//     yields `unavailable` — never a read of an arbitrary host.
//   - **A byte bound measured on the real bytes.** `response.text()` is read first and the bound is
//     applied to the UTF-8 byte length of what actually arrived. `Content-Length` is never
//     consulted, because a header is a claim and the bound has to hold on the body.
//
// Failure is classified, never collapsed. The caller renders the launch buttons and nothing else
// for every non-`ok` status, so an upstream that is down cannot break the page and cannot render
// an empty panel.

import { APPROVED_OWNERS } from "./readme-index";
import { readPublicText, type FetchLike, type ReadOutcome } from "./portfolio-source";

/**
 * The most README bytes this page will render.
 *
 * A README is prose, and this page shows it inline; 200 KiB is far more than any honest README and
 * small enough that a pathological or accidentally binary file is refused rather than rendered.
 * The value bounds the *body*, measured after it is read — see `utf8Bytes` below.
 */
export const README_BYTE_BOUND = 200_000;

export type RepoRef = { owner: string; repo: string };

function isApprovedOwner(owner: string): boolean {
  return APPROVED_OWNERS.some((approved) => approved.toLowerCase() === owner.toLowerCase());
}

/** UTF-8 byte length of a string. Bytes, not characters — `é` is 2 of them. */
export function utf8Bytes(text: string): number {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
  // Node always has TextEncoder; this keeps the function total if it ever does not.
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Parse a document's `repo` frontmatter field into an approved owner/repo reference.
 *
 * Stricter than `parseRepoUrl` in `./readme-index` in one respect that matters here: that helper
 * classifies *index links found inside a README*, while this one classifies a *shaped field the
 * page is about to fetch*. So it insists the value is an absolute http(s) URL as well — a bare
 * `owner/repo`, a relative path or a `javascript:` string is not a repository address.
 */
export function parseApprovedRepoRef(raw: unknown): RepoRef | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Exact host. `github.com.evil.test` and `rawgithub.com` are different hosts and are refused.
  if (url.hostname.toLowerCase() !== "github.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  if (!isApprovedOwner(owner)) return null;
  return { owner, repo };
}

/** The public raw URL for one file at the repository's default branch. */
export function readmeUrlFor(ref: RepoRef, file = "README.md"): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD/${file}`;
}

export type ToolReadmeRead =
  /** Read succeeded and is inside the byte bound. */
  | { status: "ok"; text: string; url: string; bytes: number }
  /** Confirmed absent at both candidate paths. Evidence of removal, not of failure. */
  | { status: "not_found"; url: string }
  /** Transient upstream failure, rate limit, timeout or an empty body. Keep last-good; render buttons. */
  | { status: "transient"; reason: string; url: string }
  /** Read succeeded but the real body exceeds README_BYTE_BOUND. Not rendered. */
  | { status: "too_large"; url: string; bytes: number }
  /** No approved repository reference in the document, so nothing is fetched at all. */
  | { status: "unavailable"; reason: string };

/**
 * Read one tool's README from its own repository.
 *
 * Never throws: every branch of `readPublicText` is already total, and this function adds no
 * unguarded work. A caller therefore never has to catch — it branches on the status.
 */
export async function readToolReadme(repo: unknown, fetchImpl: FetchLike): Promise<ToolReadmeRead> {
  const ref = parseApprovedRepoRef(repo);
  if (!ref) {
    return {
      status: "unavailable",
      reason: "the document supplies no repository address under an approved owner",
    };
  }

  // GitHub's own web UI resolves a README case-insensitively; raw.githubusercontent.com resolves
  // the path as git stores it. Two bounded attempts cover `README.md` and `readme.md` without an
  // API call, a token, or a directory listing.
  const candidates = [readmeUrlFor(ref, "README.md"), readmeUrlFor(ref, "readme.md")];

  let lastNotFound: ToolReadmeRead | null = null;
  for (const url of candidates) {
    const outcome: ReadOutcome = await readPublicText(url, fetchImpl);

    if (outcome.status === "ok") {
      const bytes = utf8Bytes(outcome.text);
      if (bytes > README_BYTE_BOUND) return { status: "too_large", url, bytes };
      return { status: "ok", text: outcome.text, url, bytes };
    }
    if (outcome.status === "not_found") {
      lastNotFound = { status: "not_found", url };
      continue;
    }
    // Transient: stop immediately rather than trying the next name. An upstream that is failing
    // is not evidence that the file is named differently.
    return { status: "transient", reason: outcome.reason, url };
  }

  return lastNotFound ?? { status: "not_found", url: candidates[0] };
}
