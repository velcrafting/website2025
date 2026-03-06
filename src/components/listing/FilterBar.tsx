// src/components/listing/FilterBar.tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Input from "@/components/ui/Input";

type Props = {
  allTags: string[];
  placeholder?: string;
};

export default function FilterBar({ allTags, placeholder = "Search..." }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const selected = sp.get("tag")?.toLowerCase() || "";
  const sort = sp.get("sort") || "new"; // new | alpha | tags
  const view = sp.get("view") || "grid"; // grid | compact
  const [pending, setPending] = useState(false);

  // Ensure local state follows URL changes (e.g., back/forward)
  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setPending(false);
  }, [sp]);

  const onApply = useCallback(
    (next: { q?: string; tag?: string | null; sort?: string; view?: string }) => {
      const params = new URLSearchParams(Array.from(sp.entries()));
      if (next.q !== undefined) {
        if (next.q) params.set("q", next.q);
        else params.delete("q");
      }
      if (next.tag !== undefined) {
        if (next.tag) params.set("tag", next.tag);
        else params.delete("tag");
      }
      if (next.sort !== undefined) {
        if (next.sort) params.set("sort", next.sort);
        else params.delete("sort");
      }
      if (next.view !== undefined) {
        if (next.view) params.set("view", next.view);
        else params.delete("view");
      }
      const qs = params.toString();
      setPending(true);
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, sp]
  );

  const tags = useMemo(() => Array.from(new Set(allTags.map((t) => t.toLowerCase()))).sort(), [allTags]);

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <Input
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApply({ q });
            }}
            aria-label="Search"
            className="bg-white dark:bg-neutral-900"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
          <label htmlFor="sort" className="text-xs text-neutral-600 dark:text-neutral-400">Sort</label>
          <select
            id="sort"
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900 min-w-[120px]"
            value={sort}
            onChange={(e) => onApply({ sort: e.target.value })}
          >
            <option value="new">Newest</option>
            <option value="alpha">A–Z</option>
            <option value="tags">Most tags</option>
          </select>
          <label htmlFor="view" className="ml-2 text-xs text-neutral-600 dark:text-neutral-400">View</label>
          <select
            id="view"
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900 min-w-[110px]"
            value={view}
            onChange={(e) => onApply({ view: e.target.value })}
          >
            <option value="grid">Grid</option>
            <option value="compact">Compact</option>
          </select>
          <button
            className="rounded-md border px-3 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-800"
            onClick={() => onApply({ q })}
          >
            Apply
          </button>
          {pending ? (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-neutral-500">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
              updating
            </span>
          ) : null}
          <button
            className="rounded-md border px-3 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-800"
            onClick={() => {
              setQ("");
              onApply({ q: "", tag: null, sort: "new" });
            }}
          >
            Reset
          </button>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onApply({ tag: null })}
            className={[
              "rounded-full border px-2 py-0.5 text-xs",
              selected ? "text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800" :
                "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
            ].join(" ")}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => onApply({ tag: t })}
              className={[
                "rounded-full border px-2 py-0.5 text-xs",
                selected === t
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
                  : "text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800",
              ].join(" ")}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
