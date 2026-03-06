"use client";
import { useEffect } from "react";

type Props = { open: boolean; onClose: () => void; title?: string; children: React.ReactNode };

export default function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg border bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          {title && <div className="mb-2 text-base font-semibold">{title}</div>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}