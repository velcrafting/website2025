import Link from "next/link";
import type { Doc, Frontmatter } from "@/types/content";

type Props = { doc: Doc<Frontmatter> };

export default function ProjectCard({ doc }: Props) {
  const { slug, frontmatter } = doc;
  return (
    <Link
      href={`/projects/${slug}`}
      className="block rounded-lg border p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      <div className="text-base font-semibold">{frontmatter.title ?? slug}</div>
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        {frontmatter.summary ?? ""}
      </div>
    </Link>
  );
}