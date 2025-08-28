// src/components/home/LatestStrip.tsx
import Link from "next/link";
import type { Doc, Frontmatter } from "@/types/content";
import { Card } from "../ui";

type Props = {
  projects: Doc<Frontmatter>[];
  writing: Doc<Frontmatter>[];
  labs: Doc<Frontmatter>[];
  limit?: number;
};

function timestampFromDate(date?: string): number {
  if (!date) return 0;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : 0;
}

function sortLatest<T extends Doc<Frontmatter>>(docs: T[]): T[] {
  return docs
    .slice()
    .sort(
      (a, b) =>
        timestampFromDate(b.frontmatter?.date) -
        timestampFromDate(a.frontmatter?.date)
    );
}

function formatDate(date?: string): string | null {
  const ts = timestampFromDate(date);
  if (!ts) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ts));
}

function Column({
  title,
  hrefPrefix,
  docs,
}: {
  title: string;
  hrefPrefix: "/projects" | "/writing" | "/labs";
  docs: Doc<Frontmatter>[];
}) {
  return (
    <Card>
    <div>
      <h3 className="mb-3 text-sm font-semibold tracking-wide text-neutral-400">
        {title}
      </h3>
      <ul className="space-y-3">
        {docs.length === 0 ? (
          <li className="text-sm text-neutral-500">Nothing here yet.</li>
        ) : (
          docs.map(({ slug, frontmatter }) => {
            const href = `${hrefPrefix}/${slug}`;
            const titleText = frontmatter.title ?? slug;
            const summary = frontmatter.summary ?? "";
            const dateText = formatDate(frontmatter.date);
            return (
              <li key={slug}>
                <Link
                  href={href}
                  className="block rounded-xl border p-4 transition bg-white hover:bg-neutral-100 border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:bg-neutral-800/70 text-left"
                >
                  <div className="text-base font-semibold text-neutral-900 dark:text-white leading-snug">
                    {titleText}
                  </div>
                  {dateText ? (
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {dateText}
                    </div>
                  ) : null}
                  {summary ? (
                    <div className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                      {summary}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
    </Card>
  );
}

export default function LatestStrip({
  projects,
  writing,
  labs,
  limit,
}: Props) {
  const proj = sortLatest(projects).slice(0, limit ?? projects.length);
  const write = sortLatest(writing).slice(0, limit ?? writing.length);
  const lab = sortLatest(labs).slice(0, limit ?? labs.length);

  return (
    <section className="mt-4">
      <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">Latest</h2>
      <div className="mt-6 grid gap-6 lg:grid-cols-3 text-center">
        <Column title="Projects" hrefPrefix="/projects" docs={proj} />
        <Column title="Writing" hrefPrefix="/writing" docs={write} />
        <Column title="Labs" hrefPrefix="/labs" docs={lab} />
      </div>
    </section>
  );
}
