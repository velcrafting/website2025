// src/components/listing/FilterBar.tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Props = {
  allTags: string[];
  placeholder?: string;
};

/** Quiet control surface shared by the sort/view selects and the Apply/Reset buttons. */
const control =
  "rounded-[var(--radius-surface)] border border-rule bg-[var(--field-background)] px-2 py-1 text-xs text-ink transition-colors duration-[var(--motion-base)] hover:bg-paper-raised";

/** Filter chips: one API, two states, no raw colour. */
const chip =
  "rounded-[var(--radius-chip)] border px-[var(--space-2)] py-0.5 text-xs transition-colors duration-[var(--motion-base)]";

const chipOn = "border-transparent bg-[var(--accent)] text-[var(--on-accent)]";
const chipOff = "border-rule text-muted hover:bg-paper-raised";

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
    <div className="mt-[var(--space-5)] rounded-[var(--radius-surface)] border border-rule p-[var(--space-3)]">
      <div className="flex flex-col gap-[var(--space-3)] md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <Input
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApply({ q });
            }}
            aria-label="Search"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-[var(--space-2)] md:w-auto">
          <label htmlFor="sort" className="text-xs text-muted">
            Sort
          </label>
          <select
            id="sort"
            className={cn(control, "min-w-[120px]")}
            value={sort}
            onChange={(e) => onApply({ sort: e.target.value })}
          >
            <option value="new">Newest</option>
            <option value="alpha">A–Z</option>
            <option value="tags">Most tags</option>
          </select>
          <label htmlFor="view" className="ml-[var(--space-2)] text-xs text-muted">
            View
          </label>
          <select
            id="view"
            className={cn(control, "min-w-[110px]")}
            value={view}
            onChange={(e) => onApply({ view: e.target.value })}
          >
            <option value="grid">Grid</option>
            <option value="compact">Compact</option>
          </select>
          <button className={cn(control, "px-[var(--space-3)]")} onClick={() => onApply({ q })}>
            Apply
          </button>
          {pending ? (
            <span className="ml-[var(--space-1)] inline-flex items-center gap-[var(--space-1)] text-xs text-muted">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-rule border-t-transparent" />
              updating
            </span>
          ) : null}
          <button
            className={cn(control, "px-[var(--space-3)]")}
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
        <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
          <button
            onClick={() => onApply({ tag: null })}
            aria-pressed={!selected}
            className={cn(chip, selected ? chipOff : chipOn)}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => onApply({ tag: t })}
              aria-pressed={selected === t}
              className={cn(chip, selected === t ? chipOn : chipOff)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
