// src/components/ui/Progress.tsx
//
// shadcn-backed shared Progress (docs/2026-refresh.md §4).
//
// This was NOT migrated in the previous batch although docs/components.md claimed it
// was — the file still used the retired neutral palette, and the component preview
// gallery renders it, so it is an active consumer (CODEX_REFRESH_REVIEW.md finding 5).
// It is migrated here rather than documented as done.
//
// Radix Progress supplies proper progressbar semantics; the public API is unchanged:
// { value, max, className }.
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

type Props = {
  value: number;
  max?: number;
  className?: string;
};

export default function Progress({ value, max = 100, className = "" }: Props) {
  // Guard a zero or negative max: the ratio would otherwise be NaN/Infinity and the
  // indicator would render at an undefined width.
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = (clamped / safeMax) * 100;

  return (
    <ProgressPrimitive.Root
      value={clamped}
      max={safeMax}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-[var(--radius-chip)] bg-rule/40",
        className
      )}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-[var(--accent)] transition-transform duration-[var(--motion-base)]"
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
