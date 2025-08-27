"use client";
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  side?: "right" | "left";
  title?: string;
  children: React.ReactNode;
};

export default function Drawer({ open, onClose, side = "right", title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActive = useRef<Element | null>(null);

  // Lock body scroll and manage focus
  useEffect(() => {
    if (open) {
      lastActive.current = document.activeElement;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // focus the panel (or first focusable) on open
      const t = window.setTimeout(() => {
        const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        (firstFocusable ?? panelRef.current)?.focus();
      }, 0);
      return () => {
        document.body.style.overflow = prev;
        window.clearTimeout(t);
        if (lastActive.current instanceof HTMLElement) lastActive.current.focus();
      };
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const origin = side === "right" ? "right-0" : "left-0";
  const off = side === "right" ? "translate-x-full" : "-translate-x-full";
  const borderSide = side === "right" ? "border-l" : "border-r";

  const panelTranslate = open ? "translate-x-0" : off;
  const backdropState = open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none";

  return (
    <div
      className="fixed inset-0 z-50"
      aria-hidden={!open}
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${backdropState}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Drawer"}
        ref={panelRef}
        tabIndex={-1}
        className={`absolute top-0 ${origin} h-full w-[28rem] max-w-[90vw] transform transition-transform duration-300 ${panelTranslate} outline-none`}
      >
        <div className={`h-full overflow-y-auto ${borderSide} bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900`}>
          {title && <div className="mb-2 text-base font-semibold">{title}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}