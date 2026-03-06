"use client";
import { useMemo, useState } from "react";

type SortDir = "asc" | "desc";

export type Column<T> = {
  key: keyof T;
  header: string;
  width?: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
};

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  initialSort,
  className = "",
}: {
  columns: Array<Column<T>>;
  rows: T[];
  initialSort?: { key: keyof T; dir: SortDir };
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: keyof T; dir: SortDir } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;

    const list = [...rows];

    list.sort((a, b) => {
      const av = a[sort.key] as unknown;
      const bv = b[sort.key] as unknown;

      if (av === bv) return 0;
      if (av == null) return -1; // nullish first
      if (bv == null) return 1;

      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }

      const as = String(av);
      const bs = String(bv);
      return sort.dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });

    return list;
  }, [rows, sort]);

  function toggle(col: Column<T>) {
    if (!col.sortable) return;
    setSort((s) => (!s || s.key !== col.key ? { key: col.key, dir: "asc" } : { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }));
  }

  return (
    <div className={`overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 ${className}`}>
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                style={{ width: c.width }}
                className={`px-3 py-2 text-left font-medium ${c.sortable ? "cursor-pointer select-none" : ""}`}
                onClick={() => toggle(c)}
              >
                {c.header}
                {sort?.key === c.key && <span className="ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} className="border-t border-neutral-200 dark:border-neutral-800">
              {columns.map((c) => {
                const value = row[c.key] as T[keyof T];
                return (
                  <td key={String(c.key)} className="px-3 py-2">
                    {c.render ? c.render(value, row) : String(value ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
