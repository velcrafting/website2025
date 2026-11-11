// Runtime reads for the portfolio: the two public README indexes, and (when available) public repo
// metadata.
//
// Boundaries this file is responsible for:
//
//   - **A daily window, not a scheduler.** Reads carry `next: { revalidate: 86400 }`, so the platform's
//     cache is what makes this request-driven. There is no cron, no queue, no owner action.
//   - **Failure is classified, never collapsed.** A transient or partial failure is NOT a removal. The
//     caller must be able to keep serving last-good data on `transient`, and only treat `not_found` as a
//     confirmed absence.
//   - **Public data only, and read-only.** No token, no authenticated call, no write. Nothing embedded
//     in the fetched text is executed — it is handed to the bounded parser as a string.
//   - **The fetch is injectable.** Tests supply their own implementation so cache and failure behaviour
//     can be exercised deterministically, which is why the live metadata read being unavailable does not
//     block this work.

import { extractReadmeIndex, ORG_README, PERSONAL_README, parseRepoUrl, type ReadmeExtraction } from "./readme-index";

export const DAILY_REVALIDATE_SECONDS = 86_400;

/**
 * Fixture-only overrides.
 *
 * Both default to the real public values, so the normal path is unchanged and no workaround is
 * introduced for the blocked metadata read. They exist so a production build can be pointed at an
 * isolated deterministic endpoint and given a short window, which is the only way to exercise the
 * framework's cache expiry, failure and cold-start behaviour in a real server rather than in a unit
 * test. They are read once, at module load, and are not a general configuration surface.
 */
const FIXTURE_BASE = (process.env.PORTFOLIO_FIXTURE_BASE ?? "").replace(/\/+$/, "");

function windowSeconds(): number {
  const raw = Number(process.env.PORTFOLIO_REVALIDATE_SECONDS ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : DAILY_REVALIDATE_SECONDS;
}

function withFixtureBase(url: string): string {
  return FIXTURE_BASE ? `${FIXTURE_BASE}${new URL(url).pathname}` : url;
}

export const README_URLS = {
  personal: "https://raw.githubusercontent.com/velcrafting/velcrafting/HEAD/README.md",
  org: "https://raw.githubusercontent.com/Vel-Labs/.github/HEAD/profile/README.md",
} as const;

export type ReadOutcome =
  /** Read succeeded; the text is the index. */
  | { status: "ok"; text: string }
  /** Transient or partial failure. Keep last-good; this is NOT evidence of removal. */
  | { status: "transient"; reason: string }
  /** The resource is confirmed gone. This IS evidence of removal. */
  | { status: "not_found" };

export type FetchLike = (url: string, init?: { next?: { revalidate: number } }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * Read one public URL.
 *
 * `status >= 500`, a thrown network error and a 429 are all **transient**: GitHub failing to answer
 * says nothing about whether a repository still exists. Only 404 is `not_found`.
 */
export async function readPublicText(url: string, fetchImpl: FetchLike): Promise<ReadOutcome> {
  try {
    const response = await fetchImpl(withFixtureBase(url), {
      next: { revalidate: windowSeconds() },
    });
    if (response.status === 404) return { status: "not_found" };
    if (!response.ok) return { status: "transient", reason: `HTTP ${response.status}` };
    const text = await response.text();
    if (!text.trim()) return { status: "transient", reason: "empty body" };
    return { status: "ok", text };
  } catch (error) {
    return { status: "transient", reason: error instanceof Error ? error.message : "fetch failed" };
  }
}

export type RepoMetadata = {
  owner: string;
  repo: string;
  private: boolean | null;
  archived: boolean | null;
  language: string | null;
  topics: string[];
  pushedAt: string | null;
  htmlUrl: string | null;
  defaultBranch?: string | null;
};

export type MetadataRead = {
  byRepo: Record<string, RepoMetadata>;
  /** Repos whose public status could not be established. These must not be newly exposed. */
  unknown: string[];
  /** Repos confirmed private, deleted or absent. Excluded and recorded. */
  unavailable: Array<{ key: string; reason: string }>;
  /** True when every requested repo was read. False means partial: keep last-good for the rest. */
  complete: boolean;
};

/**
 * Read public metadata for the indexed repositories.
 *
 * A metadata read that fails leaves the repository's **public status unknown**. That is deliberately
 * not the same as private: an unknown entry is withheld from new cards and recorded for review, while
 * the rest of the portfolio continues to render.
 */
export async function readRepoMetadata(
  refs: Array<{ owner: string; repo: string }>,
  fetchImpl: FetchLike,
): Promise<MetadataRead> {
  const byRepo: Record<string, RepoMetadata> = {};
  const unknown: string[] = [];
  const unavailable: Array<{ key: string; reason: string }> = [];
  let complete = true;

  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.owner}/${ref.repo}`;
    if (seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    try {
      const response = await fetchImpl(
        withFixtureBase(`https://api.github.com/repos/${ref.owner}/${ref.repo}`),
        { next: { revalidate: windowSeconds() } },
      );
      if (response.status === 404) {
        unavailable.push({ key, reason: "404 — confirmed absent" });
        continue;
      }
      if (!response.ok) {
        unknown.push(key);
        complete = false;
        continue;
      }
      const parsed = JSON.parse(await response.text()) as Record<string, unknown>;
      const canonical = typeof parsed.full_name === "string" ? parsed.full_name : "";
      const htmlRef = typeof parsed.html_url === "string" ? parseRepoUrl(parsed.html_url) : null;
      if (canonical.toLowerCase() !== key.toLowerCase() ||
          !htmlRef || `${htmlRef.owner}/${htmlRef.repo}`.toLowerCase() !== key.toLowerCase()) {
        unavailable.push({ key, reason: "canonical repository identity mismatch" });
        continue;
      }
      byRepo[key] = {
        owner: ref.owner,
        repo: ref.repo,
        private: typeof parsed.private === "boolean" ? parsed.private : null,
        archived: typeof parsed.archived === "boolean" ? parsed.archived : null,
        language: typeof parsed.language === "string" ? parsed.language : null,
        topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t): t is string => typeof t === "string") : [],
        pushedAt: typeof parsed.pushed_at === "string" ? parsed.pushed_at : null,
        htmlUrl: typeof parsed.html_url === "string" ? parsed.html_url : null,
        defaultBranch: typeof parsed.default_branch === "string" && parsed.default_branch.trim()
          ? parsed.default_branch : null,
      };
    } catch {
      unknown.push(key);
      complete = false;
    }
  }

  return { byRepo, unknown, unavailable, complete };
}

export type ReadmeRead = {
  personal: ReadOutcome;
  org: ReadOutcome;
  /** Extractions for whichever sources read successfully. */
  extractions: ReadmeExtraction[];
  /** True only when BOTH indexes were read successfully. */
  complete: boolean;
};

export async function readReadmeIndexes(fetchImpl: FetchLike): Promise<ReadmeRead> {
  const sources = await readRepoMetadata([
    { owner: "velcrafting", repo: "velcrafting" },
    { owner: "Vel-Labs", repo: ".github" },
  ], fetchImpl);
  async function readIndex(key: string, url: string): Promise<ReadOutcome> {
    const metadata = sources.byRepo[key];
    if (metadata?.private !== false || !metadata.defaultBranch) {
      return { status: "transient", reason: "public index identity/default branch unconfirmed" };
    }
    return readPublicText(url.replace("/HEAD/", `/${encodeURIComponent(metadata.defaultBranch)}/`), fetchImpl);
  }
  const personal = await readIndex("velcrafting/velcrafting", README_URLS.personal);
  const org = await readIndex("Vel-Labs/.github", README_URLS.org);

  const extractions: ReadmeExtraction[] = [];
  if (personal.status === "ok") extractions.push(extractReadmeIndex(personal.text, PERSONAL_README));
  if (org.status === "ok") extractions.push(extractReadmeIndex(org.text, ORG_README));

  return { personal, org, extractions, complete:
    personal.status === "ok" && org.status === "ok" && extractions.every((entry) => entry.found.length > 0) };
}
