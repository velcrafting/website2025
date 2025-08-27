export default function Steps({ items, current = 0 }: { items: string[]; current?: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-3 text-sm">
      {items.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={i} className="flex items-center gap-2">
            <span
              className={[
                "flex size-6 items-center justify-center rounded-full border text-xs",
                done ? "bg-green-500 text-white border-green-500"
                : active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-transparent text-neutral-600 dark:text-neutral-300",
              ].join(" ")}
              aria-current={active ? "step" : undefined}
            >
              {i + 1}
            </span>
            <span className={done ? "text-neutral-800 dark:text-neutral-200" : "text-neutral-600 dark:text-neutral-400"}>
              {label}
            </span>
            {i < items.length - 1 && <span className="mx-1 h-px w-6 bg-neutral-300 dark:bg-neutral-700" />}
          </li>
        );
      })}
    </ol>
  );
}