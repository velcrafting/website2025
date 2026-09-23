"use client";

// Theme preference model (Steven's visual review, item 7).
//
// Three preferences, with the visitor's operating system as the DEFAULT:
//
//   system (default) — follow prefers-color-scheme, and keep following it live
//   light            — an explicit override, remembered
//   dark             — an explicit override, remembered
//
// This supersedes the earlier two-state model, which removed "system" because its
// implementation resolved to light regardless of the OS while still attaching a media
// listener — a preference presented as OS-following when it was not. Here the state is
// genuine: with no saved choice the OS decides, and a change to the OS setting is picked up.
//
// Failure handling: storage can be absent, blocked (private mode, disabled cookies) or throw.
// Every read and write is guarded, and any failure degrades to "system" rather than throwing.
//
// Flash and hydration: this provider deliberately does NOT decide the theme during the first
// client render, because the server cannot know it — doing so would be a hydration mismatch.
// The decision is made once, before paint, by the inline script in the root layout, and the
// provider adopts it. `mounted` lets a consumer avoid asserting a state it cannot know yet.

import { useEffect, useState, createContext, useContext, useCallback } from "react";

import {
  THEME_DARK_QUERY as DARK_QUERY,
  THEME_STORAGE_KEY as STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme-script";

export type { ResolvedTheme, ThemePreference };

const ThemeCtx = createContext<{
  /** The visitor's stored choice. */
  preference: ThemePreference;
  /** What is actually on screen right now. */
  resolved: ResolvedTheme;
  /** True when no explicit override is stored. */
  isSystem: boolean;
  isDark: boolean;
  /** False until the client has read storage; consumers must not assert theme before this. */
  mounted: boolean;
  setPreference: (p: ThemePreference) => void;
  /** Flip between light and dark, leaving system mode (an explicit choice). */
  toggle: () => void;
} | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage unavailable or blocked — treat as "no choice made".
  }
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render agree: default preference, light resolved. The inline
  // script has already painted the correct class; this only adopts it.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // `resolved` is DERIVED, never stored. An earlier version kept it in state and let two
  // effects write it: the media listener fired with a stale "system" closure during the first
  // commit and overwrote the value the mount effect had just restored from storage — so a
  // stored light override rendered dark whenever the OS was dark. Deriving removes the race
  // entirely: there is exactly one expression that can decide the theme.
  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  // Adopt the stored preference after mount.
  useEffect(() => {
    setPreferenceState(readStoredPreference());
    setMounted(true);
  }, []);

  // Track the OS preference. Always subscribed, so the value is current whenever an override
  // is removed; it only affects the rendered theme while the preference is "system".
  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = () => setSystemDark(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Apply the resolved theme and persist the preference.
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Persisting is best-effort: the session still works, it just will not be remembered.
    }
  }, [resolved, preference, mounted]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const toggle = useCallback(() => {
    // An explicit flip is a deliberate override, so it leaves system mode. The next value is
    // computed from what is currently on screen.
    setPreferenceState((current) => {
      const currentResolved: ResolvedTheme =
        current === "system" ? (systemDark ? "dark" : "light") : current;
      return currentResolved === "dark" ? "light" : "dark";
    });
  }, [systemDark]);

  return (
    <ThemeCtx.Provider
      value={{
        preference,
        resolved,
        isSystem: preference === "system",
        isDark: resolved === "dark",
        mounted,
        setPreference,
        toggle,
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
