"use client";
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type ToastItem = { id: number; msg: string; variant?: "default" | "success" | "error"; duration?: number };
type Ctx = { toast: (msg: string, opts?: { variant?: ToastItem["variant"]; duration?: number }) => void };

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const timeouts = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    // Client-only: bind the portal target
    setPortalRoot(document.body);

    // Snapshot the current map so cleanup doesn't chase a moving ref
    const timeoutsMap = timeouts.current;

    return () => {
      timeoutsMap.forEach(t => clearTimeout(t));
      timeoutsMap.clear();
    };
  }, []);

  const remove = useCallback((id: number) => {
    setItems(xs => xs.filter(x => x.id !== id));
    const t = timeouts.current.get(id);
    if (t) {
      clearTimeout(t);
      timeouts.current.delete(id);
    }
  }, []);

  const toast = useCallback<Ctx["toast"]>((msg, opts) => {
    const id = Date.now() + Math.random();
    const item: ToastItem = {
      id,
      msg,
      variant: opts?.variant ?? "default",
      duration: Math.max(1000, opts?.duration ?? 3000),
    };
    setItems(xs => [...xs, item]);
    const t = window.setTimeout(() => remove(id), item.duration);
    timeouts.current.set(id, t);
  }, [remove]);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {portalRoot &&
        createPortal(
          <div
            className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2 md:right-6 md:bottom-6"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            aria-live="polite"
            aria-atomic="true"
          >
            {items.map(i => (
              <ToastCard key={i.id} item={i} onClose={() => remove(i.id)} />
            ))}
          </div>,
          portalRoot
        )}
    </ToastCtx.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      role="status"
      className={[
        "pointer-events-auto select-none rounded-md border px-3 py-2 text-sm shadow transition",
        "bg-white dark:bg-neutral-900 dark:border-neutral-800",
        item.variant === "success" && "border-green-600/40",
        item.variant === "error" && "border-red-600/40",
      ].filter(Boolean).join(" ")}
      style={{
        opacity: 1,
        transform: prefersReduced ? undefined : "translateY(0)",
        animation: prefersReduced ? undefined : "toast-in 120ms ease-out",
      }}
      onClick={onClose}
      title="Dismiss"
    >
      {item.msg}
      <style jsx>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}
