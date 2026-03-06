export default function Progress({ value, max = 100, className = "" }: { value: number; max?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800 ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-neutral-900 transition-[width] duration-300 dark:bg-white" style={{ width: `${pct}%` }} />
    </div>
  );
}