// src/components/ui/Testimonials.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react"; // ← type-only import fixes TS1484
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import clsx from "clsx";
import Card from "./Card";
import Separator from "./Separator";

export type Testimonial = {
  quote: string;
  author: string;
  role?: string;
  avatarUrl?: string;
  href?: string; // link to LinkedIn or site
};

type Props = {
  items: Testimonial[];
  autoPlayMs?: number;
  className?: string;
  accentClass?: string; // e.g. "from-emerald-400 to-green-500"
};

export default function Testimonials({
  items,
  autoPlayMs = 6000,
  className,
  accentClass = "from-[#1DB954] via-[#1ed760] to-[#1DB954]",
}: Props) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const next = () => setIndex((i) => (i + 1) % items.length);
  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);

  useEffect(() => {
    if (items.length <= 1) return;
    if (pausedRef.current) return;
    timerRef.current = window.setTimeout(next, autoPlayMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, autoPlayMs, items.length]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  }

  const active = items[index];

  return (
       <section
      className={clsx("", className)}
      aria-label="Testimonials"
      onKeyDown={onKeyDown}
    >
      <Card className="overflow-hidden">
        {/* Top accent bar */}
        <Separator variant="gradient" accentClass={accentClass} />

        <div
          className="relative px-5 py-6 sm:px-7 sm:py-8"
          onMouseEnter={() => (pausedRef.current = true)}
          onMouseLeave={() => {
            pausedRef.current = false;
            // trigger immediate progression after unpause
            setIndex((i) => i);
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.blockquote
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="text-base leading-relaxed text-neutral-700 dark:text-neutral-200"
            >
              <span className="select-none align-top text-2xl text-neutral-400 dark:text-neutral-500">“</span>
              {active.quote}
              <span className="select-none align-top text-2xl text-neutral-400 dark:text-neutral-500">”</span>

              <footer className="mt-4 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                {active.avatarUrl ? (
                  <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-neutral-300 dark:ring-neutral-800">
                    <Image
                      src={active.avatarUrl}
                      alt={active.author}
                      width={36}
                      height={36}
                    />
                  </div>
                ) : null}
                <div className="flex flex-col">
                  {active.href ? (
                    <a
                      href={active.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-neutral-900 hover:underline dark:text-white"
                    >
                      {active.author}
                    </a>
                  ) : (
                    <span className="font-medium text-neutral-900 dark:text-white">{active.author}</span>
                  )}
                  {active.role ? <span className="text-neutral-500 dark:text-neutral-400">{active.role}</span> : null}
                </div>
              </footer>
            </motion.blockquote>
          </AnimatePresence>

          {/* Controls */}
          {items.length > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Previous testimonial"
                  onClick={prev}
                  className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Next testimonial"
                  onClick={next}
                  className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  →
                </button>
              </div>

              <div className="flex items-center gap-2">
                {items.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Show testimonial ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={clsx(
                      "h-2.5 w-2.5 rounded-full transition",
                      i === index
                        ? "bg-neutral-900 dark:bg-white"
                        : "bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-500"
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
