"use client";
import { useMemo } from "react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();

  const label = useMemo(() => (resolved === "light" ? "Light" : "Dark"), [resolved]);

  function onClick() {
    // Start from system but toggle explicitly between light/dark based on resolved
    const next = resolved === "light" ? "dark" : "light";
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Toggle theme (${label})`}
      title={`Theme: ${label}`}
      className={`relative h-7 w-12 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-purple-400 border-neutral-300 bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 ${className}`}
    >
      <div
        className={
          "absolute inset-0 rounded-full transition-colors " +
          (resolved === "light" ? "bg-orange-500/80" : "bg-purple-600/80")
        }
        aria-hidden
      />
      <div
        className="absolute top-0.5 h-6 w-6 transform rounded-full bg-white transition-all will-change-transform"
        style={{ left: resolved === "light" ? 2 : 22 }}
        aria-hidden
      >
        <span className="grid h-full w-full place-items-center">
          {resolved === "light" ? <SunIcon /> : <MoonIcon />}
        </span>
      </div>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="12" r="4.5" fill="white" stroke="rgba(0,0,0,0.5)" strokeWidth="0.7" />
      <g stroke="white" strokeWidth="2.2" strokeLinecap="round" filter="url(#sunShadow)">
        <path d="M12 2.5v3" />
        <path d="M12 18.5v3" />
        <path d="M21.5 12h-3" />
        <path d="M5.5 12h-3" />
        <path d="M18.364 5.636l-2.121 2.121" />
        <path d="M7.757 16.243l-2.121 2.121" />
        <path d="M18.364 18.364l-2.121-2.121" />
        <path d="M7.757 7.757L5.636 5.636" />
      </g>
      <defs>
        <filter id="sunShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="0.6" floodColor="rgba(0,0,0,0.5)" />
        </filter>
      </defs>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M21 12.5A8.5 8.5 0 0111 3a8.5 8.5 0 1010 9.5z" fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="1.1" />
    </svg>
  );
}
