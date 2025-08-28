import Link from "next/link";
import type { Doc, Frontmatter } from "@/types/content";

type Props = { doc: Doc<Frontmatter> };

export default function WritingCard({ doc }: Props) {
  const { slug, frontmatter } = doc;
  return (
    <Link
      href={`/writing/${slug}`}
      className="block rounded-lg border p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
    >
      <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{frontmatter.title ?? slug}</div>
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        {frontmatter.summary ?? ""}
      </div>
    </Link>
  );
}
