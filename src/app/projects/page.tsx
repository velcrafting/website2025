import Link from "next/link";
import {
  laneById,
  portfolioProjects,
  projectLanes,
  type PortfolioProject,
} from "@/lib/portfolio-projects";
import { buildMetadata } from "@/lib/seo";
import { readReadmeIndexes, readRepoMetadata } from "@/lib/github/portfolio-source";
import {
  readRepoReleaseNotes,
  type RepoReleaseNoteRead,
} from "@/lib/github/repo-release-note";
import { buildPortfolioView, type EditorialCard, type PortfolioCard } from "@/lib/portfolio-view";

import { Badge } from "@/components/ui";
import RepoVersionChip from "@/components/listing/RepoVersionChip";

export const generateMetadata = () =>
  buildMetadata({
    title: "Projects",
    description:
      "Curated project index for Steven / velcrafting: inspectable AI systems, agent workbenches, local-first AI, simulations, MCP tooling, and governance scaffolds.",
    canonicalPath: "/projects",
  });

// Status is stated in words, never carried by colour alone (concept 03).
const statusLabel: Record<PortfolioProject["status"], string> = {
  live: "Live",
  active: "Active",
  prototype: "Prototype",
  draft: "Draft",
  "local-only": "Local-only — not publicly hosted",
  hackathon: "Hackathon build",
};

/**
 * Status → shared Badge variant. Steven asked for clearly defined, tinted status chips, so
 * each state gets a distinct restrained fill/border from the shared Badge API rather than a
 * page-level colour. The LABELS are untouched, so no status meaning changes:
 *
 *   live       → success tint (confirmed-good, shipped)
 *   active     → accent (the primary working state)
 *   prototype  → link tint (exploratory, editorially linked)
 *   draft      → default (quiet metadata)
 *   local-only → neutral tint (a qualifier, not a quality judgement)
 *   hackathon  → warn (time-boxed, not a durable release)
 *
 * Every chip carries its text label, so no state is signalled by colour alone.
 */
const statusVariant: Record<
  PortfolioProject["status"],
  "success" | "accent" | "link" | "default" | "neutral" | "warn"
> = {
  live: "success",
  active: "accent",
  prototype: "link",
  draft: "default",
  "local-only": "neutral",
  hackathon: "warn",
};

function ProjectIndexCard({
  project,
  release,
}: {
  project: PortfolioProject;
  /**
   * The result of this repository's `release-note.json` read. `null` also renders no chip, so a
   * missing read can never produce a version. The status is on the article either way, so "the
   * project publishes no version" and "the read failed" stay distinguishable in the HTML.
   */
  release: RepoReleaseNoteRead | null;
}) {
  const lane = laneById(project.lane);

  return (
    <article
      className="surface flex h-full flex-col"
      data-repo-version-state={release?.status ?? "not-read"}
    >
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Link
          href={`/projects?lane=${project.lane}`}
          className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 uppercase tracking-wide no-underline hover:border-ink"
        >
          {lane?.title ?? project.lane}
        </Link>
        <Badge variant={statusVariant[project.status]}>{statusLabel[project.status]}</Badge>
      </div>

      <h2 className="mt-[var(--space-3)] text-[1.3rem]">{project.name}</h2>
      <p className="measure-prose mt-[var(--space-2)]">{project.summary}</p>

      <div className="mt-[var(--space-4)] border-l-2 border-rule pl-[var(--space-3)]">
        <p className="meta uppercase tracking-wide">What it proves</p>
        <p className="mt-[var(--space-1)]">{project.proves}</p>
      </div>

      <ul className="mt-[var(--space-4)] flex list-none flex-wrap gap-[var(--space-1)] pl-0">
        {project.stack.map((item) => (
          <li
            key={item}
            className="meta rounded-[var(--radius-chip)] bg-paper px-[var(--space-2)] py-1"
          >
            {item}
          </li>
        ))}
      </ul>

      <RepoVersionChip read={release} className="mt-[var(--space-4)]" />

      <div className="mt-auto flex flex-wrap gap-[var(--space-4)] pt-[var(--space-5)]">
        {project.links.length ? (
          project.links.map((link) => {
            const external = link.href.startsWith("http");
            return (
              <Link
                key={link.href}
                href={link.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="font-medium"
              >
                {link.label}
                {external ? <span aria-hidden="true"> ↗</span> : null}
              </Link>
            );
          })
        ) : (
          <span className="meta">No public link yet</span>
        )}
      </div>
    </article>
  );
}

/**
 * A row that exists only because a public index lists it. Deliberately leaner than the curated card:
 * there is no editorial summary or status to show, and inventing one would be presenting a guess as
 * curation. Metadata that was not read says so rather than being omitted silently.
 */
function ImportedIndexCard({
  card,
  release,
}: {
  card: PortfolioCard;
  /** Same rule as the curated card: no usable version, or no read at all, means no chip. */
  release: RepoReleaseNoteRead | null;
}) {
  return (
    <article
      className="surface flex h-full flex-col"
      data-imported="true"
      data-repo-version-state={release?.status ?? "not-read"}
    >
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        {card.laneId ? (
          <Link
            href={`/projects?lane=${card.laneId}`}
            className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5 uppercase tracking-wide no-underline hover:border-ink"
          >
            {laneById(card.laneId)?.title ?? card.laneId}
          </Link>
        ) : card.laneName ? (
          // The README stated a lane this site has no filter for. Shown as the README's own words,
          // not turned into a link that would return the wrong set.
          <span className="meta rounded-[var(--radius-chip)] border border-rule px-[var(--space-2)] py-0.5">
            {card.laneName}
          </span>
        ) : null}
        <Badge variant="neutral">From the indexes</Badge>
        {card.archived ? <Badge variant="warn">Archived</Badge> : null}
      </div>

      <h2 className="mt-[var(--space-3)] text-[1.3rem]">
        <a href={card.url} target="_blank" rel="noopener noreferrer" className="font-medium">
          {card.displayName}
          <span aria-hidden="true"> ↗</span>
        </a>
      </h2>
      <p className="meta mt-[var(--space-2)]">
        {card.owner}/{card.repo}
        {card.language ? ` · ${card.language}` : ""}
        {card.pushedAt ? ` · last push ${card.pushedAt.slice(0, 10)}` : " · metadata not read"}
      </p>

      <RepoVersionChip read={release} className="mt-[var(--space-3)]" />

      <div className="mt-auto flex flex-wrap gap-[var(--space-4)] pt-[var(--space-5)]">
        <a href={card.url} target="_blank" rel="noopener noreferrer" className="font-medium">
          Repository<span aria-hidden="true"> ↗</span>
        </a>
      </div>
    </article>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ lane?: string; q?: string; status?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const lane = params.lane;
  const status = params.status;
  const q = params.q;

  const activeLane = lane ? laneById(lane) : undefined;
  const knownLaneIds = new Set(projectLanes.map((item) => item.id));

  // Public indexes. Request-driven: the reads carry a daily revalidation window and this page is
  // dynamic (it reads searchParams), so a request after the window refreshes without a rebuild.
  // Nothing here can empty the page: a failed or partial read degrades to the committed snapshot and
  // the freshness line says which is being shown.
  const editorialCards: EditorialCard[] = portfolioProjects.flatMap((project) => {
    const link = project.links.find((entry) => entry.href.startsWith("https://github.com/"));
    if (!link) return [];
    const [, owner, repo] = new URL(link.href).pathname.split("/");
    if (!owner || !repo) return [];
    return [
      {
        owner,
        repo: repo.replace(/\.git$/, ""),
        url: `https://github.com/${owner}/${repo.replace(/\.git$/, "")}`,
        label: project.name,
        lane: project.lane,
      },
    ];
  });

  const publicIndex = await (async () => {
    try {
      const readme = await readReadmeIndexes(fetch);
      const refs = readme.extractions.flatMap((extraction) => extraction.entries).map((entry) => ({
        owner: entry.owner,
        repo: entry.repo,
      }));
      const metadata = refs.length
        ? await readRepoMetadata(refs, fetch)
        : { byRepo: {}, unknown: [], unavailable: [], complete: true };
      return buildPortfolioView({
        readmeEntries: readme.extractions.flatMap((extraction) => extraction.entries),
        readmeComplete: readme.complete,
        metadata,
        editorial: editorialCards,
        knownLaneIds,
      });
    } catch {
      // An unexpected throw is still not an empty portfolio.
      return buildPortfolioView({
        readmeEntries: [],
        readmeComplete: false,
        metadata: { byRepo: {}, unknown: [], unavailable: [], complete: false },
        editorial: editorialCards,
        knownLaneIds,
      });
    }
  })();

  const indexedCards = publicIndex.cards;

  /**
   * Per-project version chips (§5). ONE read per rendered repository, through the SAME public-read
   * path the portfolio already uses: the daily revalidation window, the approved-owner boundary, and
   * the same classification where a 404 is an absent file and anything else is a failed read.
   *
   * Only the cards that will actually render are read — a repository withheld by the confirmed-public
   * gate is not fetched at all.
   *
   * Nothing here can add a version that was not read. No file, an unusable file and a failed read all
   * produce `null` for that card, and `null` renders no chip. There is no placeholder, no last-good
   * version carried over from another repository, and no fallback value anywhere in this path.
   */
  const releaseNotes = await readRepoReleaseNotes(
    indexedCards.map((card) => ({ owner: card.owner, repo: card.repo })),
    fetch,
  );

  /** How many cards landed in each read state, sorted, for the served page's own diagnostics. */
  const releaseStateSummary = Object.keys(releaseNotes.states)
    .sort()
    .map((state) => `${state}=${releaseNotes.states[state]}`)
    .join(" ");

  /**
   * A fingerprint of what was actually served, so "cached" and "freshly read" are distinguishable.
   *
   * The freshness text cannot know whether the framework served a cached read, and the fetch layer
   * cannot see through that cache. A short digest of the entry list plus the metadata keys changes when
   * the served data changes and stays put when it does not — which is the observable a cache, failure or
   * recovery proof needs. It is a check value, not a claim about freshness.
   */
  const indexFingerprint = (() => {
    const material = JSON.stringify([
      indexedCards.map((card) => `${card.owner}/${card.repo}:${card.language ?? "-"}`),
      Object.keys(publicIndex.cards).length,
      publicIndex.source,
      publicIndex.pending.map((entry) => entry.key),
    ]);
    let hash = 0x811c9dc5;
    for (let index = 0; index < material.length; index += 1) {
      hash ^= material.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  })();

  /**
   * Override-effectiveness guard for the isolated proof instance.
   *
   * When an upstream override is configured, the fixture's own marker must be visible in the served
   * rows — `LateAddition` exists only in the test fixture, in neither real README and in no curated
   * entry. If the override is configured and that marker is ABSENT, the override is not in effect and
   * nothing about caching or failure may be concluded from this instance.
   *
   * An earlier version of this guard used a "real-only" marker and produced a false positive, because
   * the fixture happened to serve that repository too. The check is now one-sided and decidable.
   */
  const fixtureMarker = process.env.PORTFOLIO_FIXTURE_MARKER?.trim() || "LateAddition";
  const overrideConfigured = Boolean(process.env.PORTFOLIO_FIXTURE_BASE?.trim());
  const overrideIneffective =
    overrideConfigured && !indexedCards.some((card) => card.repo === fixtureMarker);

  // ONE merged list under ONE set of filter semantics. The imported rows used to render in a separate
  // strip that ignored the filters and duplicated curated repositories; a lane chip could therefore
  // point at a query that matched nothing while those rows stayed visible.
  const curatedByRepo = new Map(
    portfolioProjects.flatMap((project) => {
      const link = project.links.find((entry) => entry.href.startsWith("https://github.com/"));
      if (!link) return [];
      const [, owner, repo] = new URL(link.href).pathname.split("/");
      if (!owner || !repo) return [];
      return [[`${owner}/${repo.replace(/\.git$/, "")}`.toLowerCase(), project] as const];
    }),
  );

  const mergedFiltered = indexedCards.filter((card) => {
    const project = curatedByRepo.get(`${card.owner}/${card.repo}`.toLowerCase());
    // A lane filter matches only rows whose lane resolved to a real lane id; an unmapped row cannot
    // honestly claim membership of one.
    const okLane = lane ? card.laneId === lane : true;
    const okStatus = status ? project?.status === status : true;
    const text = [
      // The public name AND the README's own text, so the row stays findable by its source words
      // even when the displayed name is overridden for publication.
      card.displayName,
      card.label,
      card.repo,
      card.owner,
      card.laneName ?? "",
      project?.summary,
      project?.proves,
      ...(project?.stack ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const okQuery = q ? text.includes(q.trim().toLowerCase()) : true;
    return okLane && okStatus && okQuery;
  });

  return (
    <div className="container-index py-[var(--space-7)]">
      <section>
        <h1 className="measure-prose">Curated project index</h1>
        <p className="measure-prose mt-[var(--space-4)]">
          A compact map of the systems I build: agent workbenches, local-first
          AI, simulations, MCP tooling, authority layers, governance scaffolds,
          and trading control planes. Each entry names its status and the proof
          boundary it is meant to demonstrate.
        </p>
      </section>

      <section className="surface mt-[var(--space-6)]">
        <form
          className="grid gap-[var(--space-3)] lg:grid-cols-[1fr_220px_180px_auto]"
          action="/projects"
        >
          <label className="flex flex-col gap-1">
            <span className="meta">Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search projects, stacks, or proof language"
              className="rounded-[var(--radius-chip)] border border-rule bg-white px-[var(--space-3)] py-[var(--space-2)] text-ink placeholder:text-muted"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="meta">Lane</span>
            <select
              name="lane"
              defaultValue={lane ?? ""}
              className="rounded-[var(--radius-chip)] border border-rule bg-[var(--field-background)] px-[var(--space-3)] py-[var(--space-2)] text-ink"
            >
              <option value="">All lanes</option>
              {projectLanes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="meta">Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-[var(--radius-chip)] border border-rule bg-[var(--field-background)] px-[var(--space-3)] py-[var(--space-2)] text-ink"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary btn-compact self-end">
            Apply
          </button>
        </form>
        <div className="mt-[var(--space-4)] flex flex-wrap gap-[var(--space-2)]">
          <Link href="/projects" className="no-underline">
            <Badge variant="neutral">All</Badge>
          </Link>
          {projectLanes.map((item) => (
            <Link key={item.id} href={`/projects?lane=${item.id}`} className="no-underline">
              <Badge variant="neutral">{item.title}</Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-[var(--space-6)]">
        <div className="flex flex-wrap items-end justify-between gap-[var(--space-3)]">
          <div>
            <h2>{activeLane ? activeLane.title : "All proof lanes"}</h2>
            <p
              className="meta mt-[var(--space-2)]"
              data-freshness={publicIndex.source}
              data-index-fp={indexFingerprint}
              data-upstream-contaminated={overrideIneffective ? "true" : "false"}
            >
              Showing {mergedFiltered.length} of {indexedCards.length} projects. {publicIndex.freshness}
              {publicIndex.enrichmentPartial
                ? " Some repository metadata could not be read, so those fields are omitted."
                : ""}{" "}
              Index check value <code>{indexFingerprint}</code>.
            </p>
            {overrideIneffective ? (
              <p className="meta mt-[var(--space-2)]" role="alert" data-upstream-warning="true">
                An upstream override is configured but its fixture rows are not being served, so the
                override is not in effect. No cache or failure proof may be run against this instance.
              </p>
            ) : null}
            {/*
              A release note that could not be read is not the same as a project that publishes none.
              Both render no chip, so the page says which one happened rather than letting a failed
              read look like a deliberate silence. One line, only when it is true, with the count.
            */}
            {releaseNotes.unreadable ? (
              <p
                className="meta mt-[var(--space-2)]"
                data-repo-version-unreadable={releaseNotes.unreadable}
              >
                {releaseNotes.unreadable} project{" "}
                {releaseNotes.unreadable === 1 ? "card" : "cards"} could not be checked for a release
                note — the file was unusable or the read failed — so those cards show no version. That
                is not a statement that the project has no release note.
              </p>
            ) : null}
          </div>
        </div>

        <div
          className="mt-[var(--space-5)] grid gap-[var(--space-4)] lg:grid-cols-2"
          data-repo-version-summary={releaseStateSummary}
        >
          {mergedFiltered.map((card) => {
            const project = curatedByRepo.get(`${card.owner}/${card.repo}`.toLowerCase());
            const release = releaseNotes.byRepo[`${card.owner}/${card.repo}`] ?? null;
            return project ? (
              <ProjectIndexCard key={project.slug} project={project} release={release} />
            ) : (
              <ImportedIndexCard key={`${card.owner}/${card.repo}`} card={card} release={release} />
            );
          })}
        </div>

        {mergedFiltered.length === 0 ? (
          <p className="surface meta mt-[var(--space-5)]">No projects match this filter.</p>
        ) : null}

        {publicIndex.pending.length ? (
          <details className="mt-[var(--space-4)]">
            <summary className="meta cursor-pointer">
              Listed in an index but not shown ({publicIndex.pending.length})
            </summary>
            <ul className="mt-[var(--space-2)] list-none pl-0">
              {publicIndex.pending.map((entry, i) => (
                // The React key must NOT be `entry.key`: a key is serialized into the RSC payload, so
                // the raw `owner/repo` string reached the served bytes even after the visible text was
                // overridden (found by grepping the served page, 2026-09-17). The index keeps keys
                // unique within this static server-rendered list without publishing the identity.
                <li key={`${entry.display}-${i}`} className="meta">
                  {/* `display` is the public name; `entry.key` remains the machine identity in the data. */}
                  {entry.display} — {entry.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

    </div>
  );
}
