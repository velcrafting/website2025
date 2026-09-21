// Bounded extraction of the public profile README indexes.
//
// The READMEs are the authorised inclusion rule: whatever they link, in their own words and order, is
// what the portfolio lists. This module does ONE job — turn a README's bounded sections into a list of
// owner/repo references — and it is deliberately strict about it:
//
//   - Only the sections named for that source are read. The personal README also carries `Elsewhere`
//     and `Profile Bio`, and those are not an index; the org README has no `Current Focus` at all, so
//     the allowed set is PER SOURCE rather than shared.
//   - The README is UNTRUSTED DATA. Text is scanned, never evaluated: no HTML, no scripts, no
//     embeds, no fetches. Only markdown links and bare github.com references inside an allowed
//     section produce entries.
//   - Ownership is bounded here as well: a link to any owner other than the approved set is dropped.
//     Anchoring and traversal are cleaned up so a crafted URL cannot smuggle a different owner.
//   - Order and inclusion come from the README. Nothing here sorts, ranks, scores or summarises.
//
// An unparseable or missing section degrades by reporting it in `missing` and returning the entries it
// did find. It NEVER returns a synthetic list and never throws for content reasons: deciding what to do
// about an empty result belongs to the caller, which falls back to the committed snapshot.

/** The only owners this site publishes links to. Anything else is dropped, not displayed. */
export const APPROVED_OWNERS = ["velcrafting", "Vel-Labs"] as const;

export type ReadmeSource = {
  /** Stable id for diagnostics: which index an entry came from. */
  id: string;
  /** Exact `## ` section headings that this source's index lives in. */
  allowedSections: string[];
};

export const PERSONAL_README: ReadmeSource = {
  id: "personal",
  allowedSections: ["Current Focus", "Start Here"],
};

export const ORG_README: ReadmeSource = {
  id: "org",
  allowedSections: ["What We Build", "Start Here", "Recommended Pins"],
};

export type ReadmeEntry = {
  owner: string;
  repo: string;
  /** Canonical public URL, rebuilt from owner/repo rather than echoed from the source. */
  url: string;
  /** The README's own link text, shown as authored. Never rewritten. */
  label: string;
  section: string;
  source: string;
  /**
   * The lane the README itself states for this repository, when the row it appears in has a `Lane`
   * column. `null` means the README did not state one for this row — a section heading is not a lane
   * and is never used as one.
   */
  laneName: string | null;
};

export type ReadmeExtraction = {
  entries: ReadmeEntry[];
  /** Allowed sections that were read. */
  found: string[];
  /** Allowed sections that were absent — surfaced so a degraded parse is visible, not silent. */
  missing: string[];
};

const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]+)/g;
const BARE_GITHUB = /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/g;

function isApprovedOwner(owner: string): boolean {
  return APPROVED_OWNERS.some((approved) => approved.toLowerCase() === owner.toLowerCase());
}

/**
 * Pull the owner/repo out of a URL, if this is a github.com repository reference at all.
 *
 * Deliberately conservative: the host must be github.com exactly (not a subdomain, not a
 * lookalike), and the first two path segments are taken as owner/repo. Query strings, anchors,
 * deeper paths, `.git` suffixes and surrounding punctuation are discarded — a crafted link must not
 * be able to resolve to a different owner than the one that is actually approved.
 */
export function parseRepoUrl(raw: string): { owner: string; repo: string } | null {
  // Strip the punctuation that naturally surrounds a URL in prose or markdown — angle brackets,
  // parentheses, square brackets and trailing sentence punctuation — so "(see https://…)" resolves to
  // the same reference as the bare URL, while the host and owner checks below still apply.
  const trimmed = raw
    .trim()
    .replace(/^[<([{]+/, "")
    .replace(/[>\])}.,;:]+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  return { owner, repo };
}

/** The lines belonging to one `## ` section, up to the next `## ` heading. */
function sectionBody(lines: string[], heading: string): string[] | null {
  const start = lines.findIndex((line) => {
    const match = SECTION_HEADING.exec(line);
    return match ? match[1].trim().toLowerCase() === heading.toLowerCase() : false;
  });
  if (start === -1) return null;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (SECTION_HEADING.test(line)) break;
    body.push(line);
  }
  return body;
}

/**
 * Extract the authorised index from one README.
 *
 * Never throws for content reasons — a malformed README yields an empty entry list plus a `missing`
 * record, so the caller can keep serving last-good data instead of publishing an empty portfolio.
 */
export function extractReadmeIndex(markdown: unknown, source: ReadmeSource): ReadmeExtraction {
  const text = typeof markdown === "string" ? markdown : "";
  const lines = text.split(/\r\n?|\n/);
  const found: string[] = [];
  const missing: string[] = [];
  const entries: ReadmeEntry[] = [];
  const seen = new Set<string>();

  for (const heading of source.allowedSections) {
    const body = sectionBody(lines, heading);
    if (body === null) {
      missing.push(heading);
      continue;
    }
    found.push(heading);

    // Collect (label, rawUrl, laneName) candidates from this section only.
    //
    // The lane comes from a TABLE row's `Lane` column when the table declares one. A section heading
    // is a heading, not a lane, so it is never used as one — a row in a table without a `Lane` column
    // (the "Start Here" tables) simply contributes no lane.
    const candidates: Array<{ label: string; raw: string; laneName: string | null }> = [];
    let tableLaneColumn: number | null = null;
    for (const line of body) {
      const cells = line.trim().startsWith("|")
        ? line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
        : null;

      if (cells) {
        const isDivider = cells.every((cell) => /^:?-{2,}:?$/.test(cell));
        if (isDivider) continue;
        if (tableLaneColumn === null && cells[0]?.toLowerCase() === "lane") {
          tableLaneColumn = 0;
          continue; // the header row itself carries no repos
        }
        const laneCell = tableLaneColumn !== null ? cells[tableLaneColumn] : undefined;
        const laneName = laneCell && laneCell.length <= 60 ? laneCell : null;
        for (const match of line.matchAll(MARKDOWN_LINK)) {
          candidates.push({ label: match[1].trim(), raw: match[2], laneName });
        }
        continue;
      }

      // A non-table line ends any table context.
      tableLaneColumn = null;
      for (const match of line.matchAll(MARKDOWN_LINK)) {
        candidates.push({ label: match[1].trim(), raw: match[2], laneName: null });
      }
      for (const match of line.matchAll(BARE_GITHUB)) {
        const raw = match[0];
        if (!candidates.some((entry) => entry.raw.includes(raw))) {
          candidates.push({ label: `${match[1]}/${match[2]}`, raw, laneName: null });
        }
      }
    }

    for (const candidate of candidates) {
      const parsed = parseRepoUrl(candidate.raw);
      if (!parsed) continue;
      if (!isApprovedOwner(parsed.owner)) continue;
      const key = `${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        owner: parsed.owner,
        repo: parsed.repo,
        // Rebuilt, not echoed: the displayed URL is always the canonical approved shape.
        url: `https://github.com/${parsed.owner}/${parsed.repo}`,
        label: candidate.label || `${parsed.owner}/${parsed.repo}`,
        section: heading,
        source: source.id,
        laneName: candidate.laneName,
      });
    }
  }

  return { entries, found, missing };
}
