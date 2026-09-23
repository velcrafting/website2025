"use client";

// src/components/listing/ToolEmbed.tsx
//
// Renders a tool from its own address so it reads as part of this page rather than as a scrollable
// box sitting inside it.
//
// The problem this solves: a cross-origin iframe cannot be measured from the outside. `scrollHeight`
// is not readable, and no CSS can make an iframe grow to fit content it is not allowed to inspect. So
// left alone, a tool in a frame always ends up with its own inner scrollbar and a fixed height — the
// "weird layer" Steven reported.
//
// The fix is a handshake. The tool posts its own height; this side listens and resizes. Nothing is
// guessed and no content is clipped.
//
// SECURITY: the only thing that can resize this frame is a message from the tool's own origin AND
// from this exact frame's window. A page can contain other frames; without both checks, any of them
// could resize this one. The tool posts with target "*" because it cannot know where it is embedded —
// that is normal and safe, because the trust decision is made here, on this side, not there.
//
// Until a tool posts a height, a generous default is used. That default is deliberately taller than a
// typical single-screen tool so the inner scrollbar does not appear in normal use. `overflow` stays
// auto so a tool that IS taller than the default remains reachable instead of being clipped.
//
// For a tool repository, this is the whole change needed:
//
//   const send = () => parent.postMessage(
//     { type: "tool-height", height: document.documentElement.scrollHeight }, "*");
//   addEventListener("load", send);
//   new ResizeObserver(send).observe(document.documentElement);
//
// Tools that do not send it still work: they simply keep the default height.

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title: string;
  /** Height used until the tool reports its own. Tall enough to avoid an inner scrollbar in practice. */
  defaultHeight?: number;
};

const MIN_HEIGHT = 320;
const MAX_HEIGHT = 8000;

export default function ToolEmbed({ src, title, defaultHeight = 900 }: Props) {
  const [reportedHeight, setReportedHeight] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const origin = (() => {
    try {
      return new URL(src).origin;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!origin) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;

      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== "tool-height") return;
      if (typeof data.height !== "number" || !Number.isFinite(data.height)) return;

      setReportedHeight(Math.min(Math.max(Math.round(data.height), MIN_HEIGHT), MAX_HEIGHT));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  const height = reportedHeight ?? defaultHeight;

  /*
    NO `loading="lazy"` — removed 2026-09-17. Read this before adding it back.

    WHY IT CAME OFF. It was the only deferral in this markup, so it was the only thing that could leave
    the frame un-navigated. The supervisor's pass on the proof build reported the iframe's
    accessibility subtree as `AXWebArea about:blank` and `Page.getFrameTree` giving the child frame a
    BLANK url — the document had never committed. Everything else was ruled out from the same build,
    not from memory: the frame's sole ancestor wrapper is visible (not inside the README `details`, not
    `hidden`), the embedding page sends NO CSP and NO X-Frame-Options, the sandbox token list permits
    navigation, and the framed URL returns 200 with no framing restriction when it is opened directly.

    Chrome does not load a lazy frame until it sits in the viewport OF A VISIBLE DOCUMENT. A pass that
    drives and inspects a tab that is not rendered/visible therefore sees precisely this signature:
    about:blank, blank child URL, while the same address works as a top-level tab.

    WHY THIS IS A FIX AND NOT PAPERING THE SYMPTOM. The tool IS this page's primary content, and since
    2026-09-17 it sits in the first viewport — deferring the thing the reader came for was backwards,
    and it made the load depend on how the page was measured rather than on the source. Eager loading
    makes the embed deterministic for every reader and every inspection.

    WHAT IS DELIBERATELY UNCHANGED: the sandbox tokens, the referrer policy, the direct-link fallback in
    ToolLaunch, and the rule that this component never reports a loading or loaded state — a
    cross-origin frame cannot be observed from the parent, so no such state exists to report. If a
    browser still shows a blank frame after this change, the block is in that browser context, not here.
  */
  return (
    <iframe
      ref={frameRef}
      title={title}
      src={src}
      className="w-full"
      style={{ height, border: 0, display: "block", background: "transparent" }}
      referrerPolicy="no-referrer"
      data-tool-embed-height={reportedHeight === null ? "default" : String(reportedHeight)}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
    />
  );
}
