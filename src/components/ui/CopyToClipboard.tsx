"use client";
import { useState } from "react";

export default function CopyToClipboard({
  text,
  children,
  copiedLabel = "Copied",
  idleLabel = "Copy",
  className = "",
}: {
  text: string;
  children?: React.ReactNode;
  copiedLabel?: string;
  idleLabel?: string;
  className?: string;
}) {
  const [ok, setOk] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    } catch {
      // noop
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${className}`}
      aria-label={ok ? copiedLabel : idleLabel}
      title={ok ? copiedLabel : idleLabel}
    >
      {children ?? (ok ? copiedLabel : idleLabel)}
    </button>
  );
}