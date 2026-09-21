"use client";

// The unsaved reader preview, beside the writing.
//
// It renders the form's CURRENT contents through the sanctioned bundle renderer, without
// saving: the request only validates and renders, so a preview never creates a revision,
// bundle or approval, and never touches already-approved bytes.
//
// Three properties this component exists to get right:
//
//   1. The draft is never disturbed. Nothing here writes to the form; a failed or pending
//      preview only ever changes this panel.
//   2. A stale response can never win. Requests carry a sequence number, a newer request
//      aborts the one before it, and any response that is not the newest is dropped — so a
//      slow earlier render cannot overwrite a faster later one.
//   3. Failure is visible but not destructive. On error the last good preview stays on
//      screen, clearly marked as out of date, and the reason is stated in words.
//
// The rendered HTML is produced by the same escaped-text renderer the published bundle uses
// (every field through escapeHtml, local asset paths validated at the boundary), so injecting
// it is injecting our own output, not author-supplied markup.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BASELINE_FIELD,
  FORM_STATE_EVENT,
  isContentControl,
  snapshotFromForm,
} from "@/editor/forms/draft-baseline";
import { rendererCss } from "@/editor/render/styles";

type Status = "idle" | "pending" | "ready" | "out-of-date";

const DEBOUNCE_MS = 600;

/**
 * `savedPreviewHref` points at the protected preview of the stored revision — the exact saved
 * output. The live panel shows what a save WOULD produce; it is not that artifact, and the author
 * is given a one-click way to see the difference.
 */
type Props = { savedPreviewHref?: string | null };

export default function UnsavedPreview({ savedPreviewHref = null }: Props) {
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [rendererVersion, setRendererVersion] = useState<string | null>(null);
  /** Whether the live draft differs from the saved snapshot the server rendered. */
  const [dirty, setDirty] = useState(false);

  /**
   * Compare the form against the SAVED snapshot and report the result.
   *
   * The baseline comes from a hidden field the server filled with the stored revision, so it is
   * saved data by construction. That matters most after a rejected save: the recovery guard puts
   * the author's unsaved words back into the form, and comparing those against saved data correctly
   * says "unsaved changes" — whereas a baseline captured after a restore would have called the
   * restored text the saved state.
   */
  const refreshDirty = useCallback(() => {
    const target = form.current;
    if (!target) return;
    const saved = target.elements.namedItem(BASELINE_FIELD);
    if (!saved || saved instanceof RadioNodeList) return;
    const savedValue = (saved as HTMLInputElement).value;
    setDirty(snapshotFromForm(target) !== savedValue);
  }, []);

  const sequence = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<number | null>(null);
  const form = useRef<HTMLFormElement | null>(null);

  const render = useCallback(async () => {
    const target = form.current;
    if (!target) return;

    const mine = ++sequence.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    /**
     * Whether this request is still the newest one.
     *
     * Checked after EVERY await, not just once before parsing: a newer request can finish while
     * this one is still reading its body, and an unguarded state update after that point would put
     * an older render on screen over a newer one.
     */
    const isCurrent = () => mine === sequence.current && !controller.signal.aborted;

    setStatus("pending");
    setProblem(null);

    try {
      const response = await fetch("/api/editor/preview/draft", {
        method: "POST",
        body: new FormData(target),
        signal: controller.signal,
      });

      // Parse first, decide after: the sequence is re-checked below, once nothing else is pending.
      const payload = (await response.json().catch(() => null)) as {
        html?: unknown;
        blockCount?: unknown;
        rendererVersion?: unknown;
        error?: string;
      } | null;

      if (!isCurrent()) return;

      if (!response.ok) {
        setStatus("out-of-date");
        setProblem(payload?.error ?? `The preview could not be rendered (${response.status}).`);
        return;
      }

      setHtml(typeof payload?.html === "string" ? payload.html : "");
      setBlockCount(typeof payload?.blockCount === "number" ? payload.blockCount : null);
      setRendererVersion(
        typeof payload?.rendererVersion === "string" ? payload.rendererVersion : null,
      );
      setStatus("ready");
    } catch (error) {
      // An aborted request was superseded on purpose and is not a failure to report.
      if ((error as Error)?.name === "AbortError") return;
      if (!isCurrent()) return;
      setStatus("out-of-date");
      setProblem("The preview could not be rendered. Your writing is untouched.");
    }
  }, []);

  useEffect(() => {
    const target = document.querySelector<HTMLFormElement>("form[data-unsaved-guard]");
    if (!target) return;
    form.current = target;

    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void render(), DEBOUNCE_MS);
    };

    // Both handlers recompute from the snapshot rather than raising a flag, so the state can go
    // back to clean and so a change that fires no event is still noticed.
    const onContentChange = (event: Event) => {
      if (!isContentControl(event.target)) return;
      refreshDirty();
      schedule();
    };
    const onFormState = () => {
      refreshDirty();
      schedule();
    };

    target.addEventListener("input", onContentChange, true);
    target.addEventListener("change", onContentChange, true);
    target.addEventListener(FORM_STATE_EVENT, onFormState);
    // Show the current state straight away: on load the form IS the saved data, so this starts
    // clean, and a restore that ran first is compared against the saved baseline rather than
    // against itself.
    refreshDirty();
    void render();

    return () => {
      target.removeEventListener("input", onContentChange, true);
      target.removeEventListener("change", onContentChange, true);
      target.removeEventListener(FORM_STATE_EVENT, onFormState);
      if (timer.current) window.clearTimeout(timer.current);
      inFlight.current?.abort();
    };
  }, [refreshDirty, render]);

  const statusText =
    status === "pending"
      ? "Updating the preview…"
      : status === "out-of-date"
        ? "The preview below may be out of date."
        : status === "ready"
          ? "Preview reflects what you have typed."
          : "Waiting for your writing.";

  return (
    <aside
      className="mt-6 lg:mt-0"
      data-unsaved-preview
      aria-labelledby="unsaved-preview-heading"
    >
      <div className="rounded-[var(--radius-surface)] border border-rule bg-paper-raised p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="unsaved-preview-heading" className="text-lg font-semibold text-ink">
            Reader preview
          </h2>
          <button
            type="button"
            className="rounded-[var(--radius-surface)] border border-[var(--input)] px-3 py-1 text-sm text-ink hover:bg-paper"
            onClick={() => void render()}
          >
            Refresh preview
          </button>
        </div>

        <p className="meta mt-1">
          The complete output — title, summary, byline, sources and body — as it stands right now.
        </p>

        {savedPreviewHref ? (
          <p className="meta mt-1">
            <a className="underline" href={savedPreviewHref}>
              Review saved draft
            </a>{" "}
            — the exact bytes of the current saved revision.
          </p>
        ) : null}

        {/* Pending and failure are announced, so a screen reader learns the state changed. */}
        <p
          className="meta mt-2"
          role="status"
          aria-live="polite"
          data-preview-status={status}
        >
          {statusText}
        </p>

        <p className="meta mt-1" data-preview-dirty={dirty ? "true" : "false"}>
          {dirty
            ? "Unsaved changes — this preview is ahead of the saved revision."
            : "No unsaved changes — this preview matches the saved revision."}
        </p>

        {problem ? (
          <p className="mt-2 rounded-[var(--radius-chip)] border border-rule p-2 text-sm text-ink">
            {problem}
          </p>
        ) : null}

        <div
          className="prose mt-3 max-h-[36rem] overflow-y-auto rounded-[var(--radius-surface)] border border-rule bg-paper p-3"
          data-preview-block-count={blockCount ?? ""}
          data-preview-renderer={rendererVersion ?? ""}
          // Our own renderer's escaped output for this revision's blocks, not author markup.
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {rendererVersion ? (
          <details className="mt-2">
            <summary className="meta cursor-pointer">Details</summary>
            <p className="meta mt-1">
              Rendered by <code>{rendererVersion}</code>
              {blockCount === null ? "" : ` · ${blockCount} block${blockCount === 1 ? "" : "s"}`} ·
              the same renderer the published bundle uses.
            </p>
          </details>
        ) : null}
      </div>
      <style>{rendererCss}</style>
    </aside>
  );
}
