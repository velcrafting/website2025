"use client";

// Concept 03 share control: feature-detect the native share sheet, invoke it only
// from an explicit click, and fall back to copying the canonical link. A share
// success means the share mechanism was handed the link — not that anyone
// received it, and the copy is announced, not assumed.

import { useEffect, useRef, useState } from "react";

const CANONICAL = "https://velcrafting.com/connect";
const SHARE_TITLE = "Steven Pajewski — you can call me Vel";

type ShareButtonProps = {
  label?: string;
  canonicalUrl?: string;
};

export default function ShareButton({ label = "Share", canonicalUrl = CANONICAL }: ShareButtonProps) {
  const [status, setStatus] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function announce(message: string) {
    setStatus(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 5000);
  }

  async function onShare() {
    setFallbackUrl("");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: SHARE_TITLE, url: canonicalUrl });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(canonicalUrl);
        announce("Link copied. Thanks for passing it on.");
        return;
      }
      setFallbackUrl(canonicalUrl);
      announce("Automatic copying is not available in this browser.");
    } catch (error) {
      // A cancelled share is not a failure and says nothing to the visitor.
      if (error instanceof Error && error.name === "AbortError") return;
      setFallbackUrl(canonicalUrl);
      announce("Automatic copying is not available in this browser.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-secondary btn-compact" onClick={onShare}>
        {label}
        <span aria-hidden="true">↗</span>
      </button>
      <p role="status" aria-live="polite" className="meta">
        {status}
      </p>
      {/*
        The fallback keeps its own label and persists after the announcement
        clears, so the address never appears as an unexplained orphan link. It is
        selectable text as well as a link, because "copy this address" is the
        action the visitor was trying to complete.
      */}
      {fallbackUrl ? (
        <p className="meta">
          Copy this address: <code className="[user-select:all]">{fallbackUrl}</code>
        </p>
      ) : null}
    </div>
  );
}
