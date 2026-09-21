import Link from "next/link";
import { featuredProjects, projectLanes } from "@/lib/portfolio-projects";
import { allWriting } from "@/lib/content";
import { formatDateOnly, isoDateOnly } from "@/lib/format-date";
import { buildMetadata } from "@/lib/seo";
import HomePathSelector from "@/components/home/HomePathSelector";
import { Button } from "@/components/ui";

export const generateMetadata = () =>
  buildMetadata({
    title: "Home",
    description:
      "Steven Pajewski / velcrafting: Founder, Technical Consultant & Product Builder focused on communications, brand trust, and practical AI systems.",
    canonicalPath: "/",
  });

// The notebook list reads the same published-writing source as /connect, so a new article
// appears without a redeploy rather than being frozen at build time.
export const revalidate = 3600;

export default async function Page() {
  // Existing content only: one featured project and the latest published writing. Nothing
  // here invents a project, a metric, a date or a biographical claim.
  const workbench = featuredProjects()[0];
  const writing = (await allWriting()).slice(0, 3);

  return (
    <div className="container-index py-[var(--space-7)]">
      {/*
        LANDING (Steven's visual review, item 1): a concise identity and one clear primary
        action on the reading measure, beside ONE restrained supporting feature.

        Previously the rail carried the workbench AND the notebook, so it competed with the
        introduction and stood much taller than it — the awkward void below the intro. The
        notebook now lives further down the page in its own section, and the two landing
        columns are deliberately comparable in height. Grouping comes from the hairline rule
        and the spacing scale; no filler cards, and no smaller type to make things fit.
      */}
      <section
        aria-labelledby="home-intro"
        className="grid items-start gap-[var(--space-6)] lg:grid-cols-[minmax(0,var(--measure-prose))_minmax(0,24rem)] lg:gap-[var(--space-8)] lg:justify-between"
      >
        <div>
          <p className="wordmark mb-[var(--space-4)]">
            <span aria-hidden="true">❧</span> velcrafting
          </p>
          <h1 id="home-intro">Steven Pajewski</h1>
          <p className="meta mt-[var(--space-1)]">Founder, Technical Consultant &amp; Product Builder</p>
          <p className="meta mt-[var(--space-1)]">you can call me Vel</p>
          <p className="lead mt-[var(--space-4)]">
            I&rsquo;ve worked in public under Velcrafting since 2016; since 2021, I&rsquo;ve been building
            tools and products alongside communications, trust, and practical AI systems.
          </p>
          <p className="mt-[var(--space-5)]">
            <Button asChild>
              <Link href="/connect">Save my contact or say hello</Link>
            </Button>
          </p>
        </div>

        {/* One supporting feature: what is currently on the bench.
            Steven's visual review (item 1): the rail's label used to sit level with the h1, so the
            right column read as HIGHER and more of a statement than the introduction. It is now
            offset below the intro's start, bounded to a narrower measure than the reading column,
            and the project name is no longer set larger and heavier than body copy. It supports
            the introduction instead of competing with it. Not a card list, not a second nav. */}
        {workbench ? (
          <div className="border-t border-rule pt-[var(--space-4)] lg:border-l lg:border-t-0 lg:pl-[var(--space-8)] lg:pt-[var(--space-7)]">
            <p className="meta uppercase tracking-wide">Recent workbench</p>
            <p className="mt-[var(--space-2)]">
              <Link
                href={`/projects?lane=${workbench.lane}`}
                className="text-ink no-underline hover:underline"
              >
                {workbench.name}
              </Link>
            </p>
            <p className="measure-prose mt-[var(--space-2)]">{workbench.summary}</p>
            <p className="meta mt-[var(--space-3)]">{workbench.proves}</p>
            <p className="meta mt-[var(--space-3)]">
              {workbench.stack.slice(0, 3).join(" · ")}
            </p>
          </div>
        ) : (
          <p className="meta">Nothing is on the bench yet.</p>
        )}
      </section>

      <HomePathSelector />

      {/* Secondary notebook content, below the landing region. */}
      <section className="mt-[var(--space-7)]" aria-labelledby="home-notebook">
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-4)]">
          <h2 id="home-notebook">From the notebook</h2>
          <Link href="/blog">All writing</Link>
        </div>
        {writing.length === 0 ? (
          <p className="meta mt-[var(--space-3)]">No published writing yet.</p>
        ) : (
          <ul className="mt-[var(--space-4)] grid list-none gap-[var(--space-4)] pl-0 sm:grid-cols-2 xl:grid-cols-3">
            {writing.map((entry) => (
              <li key={entry.slug} className="border-t border-rule pt-[var(--space-3)]">
                <Link
                  href={`/blog/${entry.slug}`}
                  className="text-ink no-underline hover:underline"
                >
                  {entry.frontmatter.title}
                </Link>
                {entry.frontmatter.date ? (
                  <p className="meta mt-[var(--space-1)]">
                    <time dateTime={isoDateOnly(entry.frontmatter.date)}>
                      {formatDateOnly(entry.frontmatter.date)}
                    </time>
                  </p>
                ) : null}
                {entry.frontmatter.summary ? (
                  <p className="mt-[var(--space-2)] text-sm text-muted">
                    {entry.frontmatter.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-[var(--space-7)]" aria-labelledby="home-lane-map">
        <div className="flex flex-wrap items-start justify-between gap-[var(--space-4)]">
          <div className="measure-prose">
            <h2 id="home-lane-map">Current lab map</h2>
            <p className="mt-[var(--space-2)]">
              These are the independent lanes represented in the project index. They
              are meant to be browsable at a glance, with deeper proof linked from each
              project.
            </p>
          </div>
          <Link href="/projects">View all projects</Link>
        </div>
        <ul className="mt-[var(--space-5)] grid list-none gap-[var(--space-3)] pl-0 sm:grid-cols-2 xl:grid-cols-3">
          {projectLanes.map((lane) => (
            <li key={lane.id}>
              <Link
                href={`/projects?lane=${lane.id}`}
                className="block no-underline"
              >
                <span className="block font-medium text-ink">{lane.title}</span>
                <span className="meta mt-[var(--space-1)] block">{lane.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
