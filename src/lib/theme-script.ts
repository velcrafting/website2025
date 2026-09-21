// src/lib/theme-script.ts
//
// Theme storage contract, in ONE place, shared by the pre-paint script in the root layout and
// the ThemeProvider that must agree with it.
//
// Why this is not in the provider file: ThemeProvider is a "use client" module, and a server
// component (the root layout) cannot reliably read a plain value export from a client module —
// the import becomes a client reference. A neutral module keeps the constant a real string on
// both sides and keeps the two halves from drifting.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** localStorage key holding the visitor's choice: "system" | "light" | "dark". */
export const THEME_STORAGE_KEY = "theme";

/** The media query that decides the theme when the preference is "system". */
export const THEME_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The pre-paint initialiser. Runs synchronously, before the rest of the document is painted,
 * and must therefore stay dependency-free and side-effect-only.
 *
 * Order of resolution: a stored explicit choice wins; otherwise the operating system decides.
 * Every read is guarded, so blocked or absent storage degrades to the system preference
 * instead of throwing. It never writes — persistence belongs to the provider.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=null;try{s=window.localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var d=false;try{d=window.matchMedia("${THEME_DARK_QUERY}").matches}catch(e){}var t=(s==="light"||s==="dark")?s:(d?"dark":"light");var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t)}catch(e){}})();`;
