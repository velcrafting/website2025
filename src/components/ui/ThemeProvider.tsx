"use client";
import { useEffect, useState, createContext, useContext } from "react";

type Theme = "light" | "dark" | "system";
const ThemeCtx = createContext<{
  theme: Theme;                 // user preference (may be "system")
  resolved: Exclude<Theme, "system">; // actual applied theme
  toggle: () => void;
  setTheme: (t: Theme) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [resolved, setResolved] = useState<Exclude<Theme, "system">>("dark");

  // initialize from localStorage
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setTheme(stored);
    }
  }, []);

  // apply class to <html>
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.classList.remove("light", "dark");
      const t: Exclude<Theme, "system"> = theme === "system" ? (mql.matches ? "dark" : "light") : theme;
      setResolved(t);
      if (t === "light") root.classList.add("light");
      if (t === "dark") root.classList.add("dark");
    };
    apply();
    localStorage.setItem("theme", theme);
    if (theme === "system") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  }

  return <ThemeCtx.Provider value={{ theme, resolved, toggle, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
