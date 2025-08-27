"use client";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${className}`}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
