// The merged portfolio view: ONE list, one set of filter semantics.
//
// This used to produce two surfaces — the curated grid and a separate imported strip — which
// duplicated repositories, ignored the page's filters, and let a lane chip point at a query that
// matched nothing while the imported cards stayed visible. It now returns a single deduplicated list
// with an explicit lane per row, and the page renders that list under its normal filters.
//
// Rules, in order of importance:
//
//   1. **One row per repository.** Deduplication is by owner/repo. The README owns inclusion and order;
//      the site's own curation supplies description, status and site-only entries.
//   2. **A lane is README state or a supported mapping — never a section heading.** A row in a `Lane`
//      table carries its lane; a row elsewhere carries none; an unmapped lane word is shown as text
//      rather than pretended into a filter value.
//   3. **Newly discovered repositories must be confirmed public.** A row found by a live read renders
//      only when the metadata read says `private === false`. Private and unknown are withheld and
//      recorded. Baseline and curated rows are exempt — they are the approved last-good content, and a
//      cold start must still render them.
//   4. **Last-good metadata is kept, not dropped.** A transient or partial refresh leaves previous
//      validated metadata in place (from the baseline slot); a failure never replaces it with nothing.
//
// REPORTED BEHAVIOUR, verified 2026-09-16 (task 6.6): a partial failure is carried at the REPOSITORY
// METADATA level — a repo whose metadata read fails keeps its last-good values. It is NOT carried at
// the INDEX level: if one of the two public README reads fails, the page serves the committed baseline
// for BOTH indexes, so a successful read is discarded along with the failed one.
//
// That is deliberate. Steven, 2026-09-16: "what value is there in the extra complexity? seems like
// less is more." A mixed page — half freshly read, half last-good — is harder to explain and harder to
// trust than a page that says plainly "serving the snapshot". Do not add per-index partial state
// without a decision to that effect, and do not let the copy imply it exists.
//   5. **It never empties and never silently swaps.** A failed read keeps last-good; a read that
//      succeeds but yields nothing while the baseline had entries is reported as DEGRADED.

import { FALLBACK_ENTRIES, FALLBACK_METADATA, FALLBACK_READ_AT } from "./github/fallback";
import type { ReadmeEntry } from "./github/readme-index";
import type { MetadataRead, RepoMetadata } from "./github/portfolio-source";

/**
 * Supported README lane words → this site's lane ids.
 *
 * Deliberately partial: a word absent here is not a lane this site has, so it is displayed as the
 * README's own text and does not become a filter value. Inventing a mapping would produce a filter
 * that silently returns the wrong set.
 */
export const README_LANE_MAP: Record<string, string> = {
  "agent workbenches": "agent-workbenches",
  "local-first ml": "local-first-ai",
  "synthetic systems": "simulation-systems",
  "capability tooling": "mcp-tooling",
  "capability layers": "mcp-tooling",
  "agent authority": "authority-governance",
};

export type EditorialCard = {
  owner: string;
  repo: string;
  url: string;
  label: string;
  /** Reference only: which lane the site places it in. */
  lane: string;
};

export type PortfolioCard = {
  owner: string;
  repo: string;
  url: string;
  /** The README's own link text, or the editorial title. Never generated. */
  label: string;
  /**
   * The name shown on the public card.
   *
   * It equals `label` unless a local override applies. `label` is README PROVENANCE and stays as
   * authored, so the source of the row remains reviewable — but a README's own link text is not
   * always publishable as a public project name. See PUBLIC_DISPLAY_OVERRIDES.
   */
  displayName: string;
  /** The README section this row was found in. Provenance, NOT a lane. */
  section: string;
  origin: "readme" | "editorial";
  /** The site's curation for this repository, when it has one. */
  curated: EditorialCard | null;
  /** Used for filtering. `null` means no supported lane applies to this row. */
  laneId: string | null;
  /** The README's own lane word, shown as authored when it did not map. */
  laneName: string | null;
  laneMapped: boolean;
  /** Which surface put this row in the list. */
  inclusion: "readme" | "baseline" | "editorial";
  /** Discovered by a live read, and therefore subject to the confirmed-public gate. */
  discovered: boolean;
  /** Factual fields only. `null` means not read — never guessed. */
  language: string | null;
  topics: string[];
  archived: boolean | null;
  pushedAt: string | null;
  metadataSource: "live" | "baseline" | "none";
};

export type PendingReview = {
  /** The owner/repository identity — machine provenance, kept for review. */
  key: string;
  /**
   * The name shown to a reader, on the same override rule as a card's `displayName`.
   *
   * The pending list is a PUBLIC surface, and it was the one place a repository's internal codename
   * still reached readers (found on the served page 2026-09-17, after the card label itself had been
   * overridden). `key` stays as the identity reviewers need.
   */
  display: string;
  reason: string;
};

export type PortfolioView = {
  cards: PortfolioCard[];
  /** `snapshot` is the committed baseline, with the date it was taken — never described as fresh. */
  source: "live" | "snapshot";
  /** When the displayed data was last successfully read. */
  lastSuccessAt: string | null;
  /** Human-readable state, including age, for the page to render verbatim. */
  freshness: string;
  /** Entries withheld because their public status is not established, private, or confirmed gone. */
  pending: PendingReview[];
  enrichmentPartial: boolean;
  /** A read succeeded but parsed to nothing while the baseline had entries. */
  degraded: boolean;
};

function keyOf(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/**
 * Local display overrides: repository → the name this site publishes for it.
 *
 * WHY THIS EXISTS. The public GitHub README indexes are the editorial source and are used as
 * authored. One of them names a Vel-Labs repository with an internal codename. The candidate
 * profile states that codename "must not be used as the public project name", so serving the
 * README's own link text put a private working name on a public page — a truthfulness and privacy
 * defect, not a wording preference.
 *
 * WHY IT IS HERE AND NOT IN THE README. Renaming the remote repository is Steven's decision and is
 * not this run's to make, and the committed baseline's own label was already corrected (see
 * `github/fallback.ts`) — but that covers only the snapshot path. A LIVE read still returns the
 * README's raw text, so the override has to sit at the view boundary where both paths meet.
 *
 * The replacement text is not invented: it is the descriptive phrase the profile itself uses for
 * this work, and it is the same name the curated entry and the committed baseline already use.
 * A key absent from this map changes nothing.
 */
export const PUBLIC_DISPLAY_OVERRIDES: Record<string, string> = {
  "vel-labs/aol": "Agent orchestration workbench",
};

/**
 * The public name for a row: `label` unless this repository has a local display override.
 * Comparison is case-insensitive because GitHub repository names are.
 */
export function publicDisplayName(owner: string, repo: string, label: string): string {
  return PUBLIC_DISPLAY_OVERRIDES[keyOf(owner, repo).toLowerCase()] ?? label;
}

/**
 * The public name for a withheld row, from its `owner/repo` key.
 *
 * Derived at the boundary rather than at each `pending.push(...)` site so a future push cannot
 * reintroduce the leak: every withheld row goes through here.
 */
function displayForKey(key: string): string {
  const slash = key.indexOf("/");
  if (slash <= 0) return publicDisplayName("", key, key);
  return publicDisplayName(key.slice(0, slash), key.slice(slash + 1), key);
}

/** Resolve a README lane word against the supported map and the site's real lane ids. */
export function resolveLane(
  laneName: string | null,
  knownLaneIds: ReadonlySet<string>,
): { laneId: string | null; laneName: string | null; mapped: boolean } {
  if (!laneName) return { laneId: null, laneName: null, mapped: false };
  const mapped = README_LANE_MAP[laneName.trim().toLowerCase()];
  if (mapped && knownLaneIds.has(mapped)) return { laneId: mapped, laneName, mapped: true };
  return { laneId: null, laneName, mapped: false };
}

function metadataFor(
  key: string,
  metadata: MetadataRead,
): { value: RepoMetadata | null; source: "live" | "baseline" | "none" } {
  const live = metadata.byRepo[key];
  if (live) return { value: live, source: "live" };
  const baseline = FALLBACK_METADATA[key];
  if (baseline) return { value: baseline, source: "baseline" };
  return { value: null, source: "none" };
}

export function buildPortfolioView(input: {
  /** Extractions from a successful read, in source order. Empty when the read failed. */
  readmeEntries: ReadmeEntry[];
  readmeComplete: boolean;
  metadata: MetadataRead;
  editorial: EditorialCard[];
  /** The site's real lane ids. Absent means no lane can be mapped, so none is claimed. */
  knownLaneIds?: ReadonlySet<string>;
  /** How many entries each source contributed, so an empty parse is distinguishable from a failure. */
  perSourceCounts?: Record<string, number>;
}): PortfolioView {
  const { readmeEntries, readmeComplete, metadata, editorial } = input;
  const knownLaneIds = input.knownLaneIds ?? new Set<string>();
  // Withheld rows are collected without their public name and get it at the return boundary, so a
  // new `pending.push(...)` cannot reintroduce the codename.
  const pending: Omit<PendingReview, "display">[] = [];

  // (5) A read that succeeded but parsed to nothing is DEGRADED, not a new empty truth.
  const degraded = input.perSourceCounts
    ? Object.keys(input.perSourceCounts).length > 0 &&
      Object.values(input.perSourceCounts).every((count) => count === 0)
    : false;

  const liveNow = readmeEntries.length > 0;
  const readmeRows: Array<{ entry: ReadmeEntry | (typeof FALLBACK_ENTRIES)[number]; discovered: boolean }> =
    liveNow
      ? readmeEntries.map((entry) => ({ entry, discovered: true }))
      : FALLBACK_ENTRIES.map((entry) => ({ entry, discovered: false }));

  const unavailableKeys = new Set(metadata.unavailable.map((entry) => entry.key));
  const unknownKeys = new Set(metadata.unknown);
  const editorialByKey = new Map(editorial.map((entry) => [keyOf(entry.owner, entry.repo), entry]));
  const seen = new Set<string>();
  const cards: PortfolioCard[] = [];

  for (const { entry, discovered } of readmeRows) {
    const key = keyOf(entry.owner, entry.repo);
    if (seen.has(key)) continue; // (1) one row per repository
    seen.add(key);

    const curated = editorialByKey.get(key) ?? null;
    const lane = resolveLane(
      ("laneName" in entry ? (entry.laneName as string | null) : null) ?? null,
      knownLaneIds,
    );
    const curatedLane = curated && knownLaneIds.has(curated.lane) ? curated.lane : null;
    const meta = metadataFor(key, metadata);
    const section = "section" in entry ? String(entry.section) : "";
    const base = {
      owner: entry.owner,
      repo: entry.repo,
      url: entry.url,
      label: entry.label,
      displayName: publicDisplayName(entry.owner, entry.repo, entry.label),
      section,
      origin: (discovered ? "readme" : "editorial") as PortfolioCard["origin"],
      curated,
      laneId: lane.laneId ?? curatedLane,
      laneName: lane.laneName,
      laneMapped: lane.mapped,
      inclusion: (discovered ? "readme" : "baseline") as PortfolioCard["inclusion"],
      discovered,
      language: meta.value?.language ?? null,
      topics: meta.value?.topics ?? [],
      archived: meta.value?.archived ?? null,
      pushedAt: meta.value?.pushedAt ?? null,
      metadataSource: meta.source,
    };

    // A confirmed 404 is a removal, recorded explicitly.
    if (unavailableKeys.has(key)) {
      pending.push({ key, reason: "confirmed absent — excluded, recorded for review" });
      continue;
    }

    // (3) Rows discovered by a live read need a confirmed-public answer.
    if (discovered) {
      if (meta.value && meta.value.private === true) {
        pending.push({ key, reason: "confirmed private — excluded" });
        continue;
      }
      if (unknownKeys.has(key) || !meta.value || meta.value.private !== false) {
        pending.push({ key, reason: "public status unconfirmed — withheld from new cards" });
        continue;
      }
    }

    cards.push(base);
  }

  // (1) Curated entries the READMEs exclude (site-only, local-only) are appended once and are never
  //     subject to the discovery gate.
  for (const entry of editorial) {
    const key = keyOf(entry.owner, entry.repo);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      owner: entry.owner,
      repo: entry.repo,
      url: entry.url,
      label: entry.label,
      displayName: publicDisplayName(entry.owner, entry.repo, entry.label),
      section: "",
      origin: "editorial",
      curated: entry,
      laneId: knownLaneIds.has(entry.lane) ? entry.lane : null,
      laneName: null,
      laneMapped: false,
      inclusion: "editorial",
      discovered: false,
      language: null,
      topics: [],
      archived: null,
      pushedAt: null,
      metadataSource: "none",
    });
  }

  // (4) The check time must reflect what is actually known. A live read may be served from the
  //     framework's cache, so claiming it was "checked during this request" would overstate it — the
  //     fetch layer cannot see through that cache. The baseline states its committed date; a live read
  //     states the window it is revalidated under and nothing more.
  const ageLabel = liveNow
    ? `revalidated on a daily window`
    : `last successful committed read ${FALLBACK_READ_AT}`;
  const freshness = liveNow
    ? readmeComplete && metadata.complete
      ? `Read from the public indexes — ${ageLabel}.`
      : `Read from the public indexes — partial: some repository metadata could not be read. ${ageLabel}.`
    : degraded
      ? `A read succeeded but produced no usable entries, so the committed baseline is being served. ${ageLabel}.`
      : `No usable read: serving the committed baseline — not a live refresh. ${ageLabel}.`;

  return {
    cards,
    source: liveNow ? "live" : "snapshot",
    lastSuccessAt: liveNow ? null : FALLBACK_READ_AT,
    freshness,
    pending: pending.map((p) => ({ ...p, display: displayForKey(p.key) })),
    enrichmentPartial: !metadata.complete,
    degraded,
  };
}

/**
 * Whether a confirmed 404 should remove an entry that is currently displayed.
 *
 * Stated as a function so the policy is in one place: only `unavailable` (a 404) removes; a transient
 * failure never does.
 */
export function removalPolicy(metadata: MetadataRead): { remove: string[]; keep: string[] } {
  return {
    remove: metadata.unavailable.map((entry) => entry.key),
    keep: [...metadata.unknown],
  };
}
