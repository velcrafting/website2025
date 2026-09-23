"use client";

// Accessible theme control (Steven's visual review, item 7).
//
// Two controls in one unit:
//
//   1. a real switch — role="switch", aria-checked, 44px target — that flips between light
//      and dark. Flipping is a DELIBERATE choice, so it leaves system mode.
//   2. a "Match system" reset, shown only while an explicit override is stored, which returns
//      the visitor to following their operating system. Without it there would be no way back
//      to System once a preference had been saved.
//
// While in system mode the control says so, in words, so the visitor can tell an OS-driven
// theme from their own choice.
//
// Hydration: `mounted` is false through the first client render, so the control does not
// assert a theme it cannot know yet (the server cannot know it). The switch state and the
// labels are only rendered once storage has been read — the pre-paint script in the root
// layout has already applied the correct colours, so there is still no flash.
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { isDark, isSystem, mounted, toggle, setPreference } = useTheme();

  return (
    <div className={`flex flex-wrap items-center gap-[var(--space-2)] ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={mounted ? isDark : false}
        onClick={toggle}
        className="inline-flex min-h-[44px] items-center gap-[var(--space-2)] rounded-[var(--radius-chip)] border border-rule bg-transparent px-[var(--space-3)] text-sm text-ink transition hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-7 rounded-full border border-rule transition-colors ${
            mounted && isDark ? "bg-plum" : "bg-paper"
          }`}
        >
          <span
            className={`mt-[1px] block h-3 w-3 rounded-full transition-transform ${
              mounted && isDark ? "translate-x-[14px] bg-paper" : "translate-x-[2px] bg-ink"
            }`}
          />
        </span>
        <span>Dark theme</span>
        <span className="meta">{mounted ? (isDark ? "on" : "off") : "·"}</span>
      </button>

      {mounted && !isSystem ? (
        <button
          type="button"
          onClick={() => setPreference("system")}
          className="meta inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] border border-rule px-[var(--space-3)] text-ink transition hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Match system
        </button>
      ) : null}
    </div>
  );
}
