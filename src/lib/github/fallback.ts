// The committed last-good portfolio snapshot.
//
// Provenance: every entry below was read from the LIVE public README indexes on 2026-09-15 through
// unauthenticated reads, and the URL is the canonical link the README itself points to.
//
//   personal: https://raw.githubusercontent.com/velcrafting/velcrafting/main/README.md        (HTTP 200)
//   org:      https://raw.githubusercontent.com/Vel-Labs/.github/main/profile/README.md       (HTTP 200)
//
// These are the README's OWN names and links, in the README's order. No prose is rewritten, nothing
// is summarised, and no field here is invented: metadata that would come from the GitHub API
// (language, topics, archived, latest release, pushed_at) is deliberately ABSENT rather than guessed.
// Runtime enrichment fills those in when the public metadata read succeeds; when it does not, the
// page still renders a populated portfolio from this file.
//
// Regenerate only from a fresh public read. Never hand-edit an entry to add a fact that was not read.

export type FallbackEntry = {
  owner: string;
  repo: string;
  url: string;
  label: string;
  section: string;
  source: string;
};

/** Kept as data so the refresh path and the cold start read exactly the same list. */
export const FALLBACK_READ_AT = "2026-09-15";

/**
 * Last-good repo metadata, keyed `Owner/repo`.
 *
 * EMPTY on purpose: the public metadata read is blocked pending consent, so no validated metadata has
 * ever been read and none may be invented. This is the slot a validated read fills, and the merge reads
 * from here when a refresh is transient or partial — which is what keeps last-good metadata in place
 * instead of dropping it.
 */
export const FALLBACK_METADATA: Record<
  string,
  {
    owner: string;
    repo: string;
    private: boolean | null;
    archived: boolean | null;
    language: string | null;
    topics: string[];
    pushedAt: string | null;
    htmlUrl: string | null;
  }
> = {};

export const FALLBACK_ENTRIES: FallbackEntry[] = [
  // Org index — "What We Build", "Start Here", "Recommended Pins".
  // The label was "AOL" until 2026-09-17. That is the internal codename, and the candidate profile states
  // it "must not be used as the public project name". The owner/repo/url are left exactly as the README
  // stated them, because this baseline is a fidelity snapshot of a real read — only the *display label*
  // is corrected, which is the thing the constraint is about. If Steven renames the repository, or adds a
  // display mapping, this entry should follow it. See hermes-handoff/LUNA_FINISHING_AUDIT_HANDOFF.md.
  { owner: "Vel-Labs", repo: "AOL", url: "https://github.com/Vel-Labs/AOL", label: "Agent orchestration workbench", section: "What We Build", source: "org" },
  { owner: "Vel-Labs", repo: "CareSight", url: "https://github.com/Vel-Labs/CareSight", label: "CareSight", section: "What We Build", source: "org" },
  { owner: "Vel-Labs", repo: "ClearIntent", url: "https://github.com/Vel-Labs/ClearIntent", label: "ClearIntent", section: "What We Build", source: "org" },
  { owner: "Vel-Labs", repo: "VelDesk", url: "https://github.com/Vel-Labs/VelDesk", label: "VelDesk", section: "Start Here", source: "org" },
  { owner: "Vel-Labs", repo: "civulacrum", url: "https://github.com/Vel-Labs/civulacrum", label: "civulacrum", section: "Start Here", source: "org" },
  { owner: "Vel-Labs", repo: "project-scaffold", url: "https://github.com/Vel-Labs/project-scaffold", label: "project-scaffold", section: "Start Here", source: "org" },
  { owner: "Vel-Labs", repo: "thc-leaderboard", url: "https://github.com/Vel-Labs/thc-leaderboard", label: "thc-leaderboard", section: "Recommended Pins", source: "org" },
  { owner: "Vel-Labs", repo: "thc-methodology", url: "https://github.com/Vel-Labs/thc-methodology", label: "thc-methodology", section: "Recommended Pins", source: "org" },
  { owner: "Vel-Labs", repo: "vel-mcp", url: "https://github.com/Vel-Labs/vel-mcp", label: "vel-mcp", section: "Recommended Pins", source: "org" },
  { owner: "Vel-Labs", repo: "yolo26-mlx-swift", url: "https://github.com/Vel-Labs/yolo26-mlx-swift", label: "yolo26-mlx-swift", section: "Recommended Pins", source: "org" },

  // Personal index — "Current Focus", "Start Here". Same repositories, read from the other surface.
  { owner: "Vel-Labs", repo: "VelDesk", url: "https://github.com/Vel-Labs/VelDesk", label: "VelDesk", section: "Current Focus", source: "personal" },
  { owner: "Vel-Labs", repo: "civulacrum", url: "https://github.com/Vel-Labs/civulacrum", label: "civulacrum", section: "Current Focus", source: "personal" },
  { owner: "Vel-Labs", repo: "vel-mcp", url: "https://github.com/Vel-Labs/vel-mcp", label: "vel-mcp", section: "Start Here", source: "personal" },
  { owner: "Vel-Labs", repo: "thc-methodology", url: "https://github.com/Vel-Labs/thc-methodology", label: "thc-methodology", section: "Start Here", source: "personal" },
];
