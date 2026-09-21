// StickyTOC.tsx
//
// Concept 03: token colours. Also respects reduced-motion for the in-page jump —
// a smooth scroll is decorative movement and should not override a visitor's
// stated preference.
"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type TocHead = { id: string; text: string; level: 2 | 3 };

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function StickyTOC() {
  const [heads, setHeads] = useState<TocHead[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let raf: number | null = null;

    const tryInit = () => {
      const root = document.querySelector<HTMLElement>("[data-toc-root]");
      if (!root) {
        raf = window.requestAnimationFrame(tryInit);
        return;
      }

      const collect = (): TocHead[] => {
        const nodes = Array.from(root.querySelectorAll<HTMLElement>("h2"));
        return nodes
          .map((el) => {
            const text = el.textContent?.trim() ?? "";
            if (!text) return null;
            if (!el.id) el.id = slugify(text);
            // H2 only, by default (docs/2026-refresh.md §5: "TOC too dense —
            // H2-only navigation by default; retain semantic H3s in article
            // content"). H3s stay in the article; they just do not become menu
            // entries. The level field is kept so a caller can opt into depth later.
            const level = Number(el.tagName.substring(1)) as 2 | 3;
            return { id: el.id, text, level };
          })
          .filter((x): x is TocHead => x !== null);
      };

      setHeads(collect());

      const mo = new MutationObserver(() => setHeads(collect()));
      mo.observe(root, { childList: true, subtree: true });

      const io = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]?.target) setActiveId((visible[0].target as HTMLElement).id);
        },
        { root: null, rootMargin: "0px 0px -70% 0px", threshold: 0 }
      );
      Array.from(root.querySelectorAll<HTMLElement>("h2")).forEach((el) => io.observe(el));

      const onHash = () => setActiveId(location.hash.replace(/^#/, "") || null);
      window.addEventListener("hashchange", onHash);

      cleanup = () => {
        mo.disconnect();
        io.disconnect();
        window.removeEventListener("hashchange", onHash);
      };
    };

    tryInit();
    return () => {
      if (cleanup) cleanup();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  if (heads.length === 0) return null;

  const onClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

  return (
    <nav>
      <ul className="flex list-none flex-col gap-[var(--space-1)] pl-0">
        {heads.map((h) => {
          const active = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={onClick(h.id)}
                aria-current={active ? "location" : undefined}
                className={[
                  "block rounded-[var(--radius-chip)] px-[var(--space-2)] py-[var(--space-1)] text-sm no-underline transition-colors",
                  h.level === 3 ? "pl-[var(--space-5)] text-muted" : "",
                  active ? "bg-rule text-ink" : "text-ink hover:bg-paper-raised",
                ].join(" ")}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
