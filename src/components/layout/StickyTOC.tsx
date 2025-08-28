// StickyTOC.tsx
"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type TocHead = { id: string; text: string; level: 2 | 3 };

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
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
        const nodes = Array.from(root.querySelectorAll<HTMLElement>("h2, h3"));
        return nodes
          .map((el) => {
            const text = el.textContent?.trim() ?? "";
            if (!text) return null;
            if (!el.id) el.id = slugify(text);
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
      Array.from(root.querySelectorAll<HTMLElement>("h2, h3")).forEach((el) => io.observe(el));

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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

 return (
    <nav className="text-md">
      <ul className="space-y-1">
        {heads.map((h) => {
          const active = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={onClick(h.id)}
                className={[
                  "block rounded px-2 py-1 transition-colors",
                  h.level === 3
                    ? "pl-5 text-neutral-500 dark:text-neutral-400"
                    : "pl-2",
                  active
                    ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
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