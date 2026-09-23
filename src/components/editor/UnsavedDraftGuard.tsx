"use client";

// Unsaved-writing recovery for the issue editor.
//
// The save action redirects on failure, and a redirect re-renders this page from stored
// state — which destroyed the paragraph an author had just typed and explained only that
// "nothing was saved". Observed on the isolated fixture: after a validation failure the
// textarea held the previously stored text, not the submitted text.
//
// This guard mirrors the form into sessionStorage at submit time and, when a failed
// status comes back, puts the author's own words back into the fields and says so. It is
// deliberately narrow: same tab, same item, cleared after a successful save, and
// discardable in one click. It writes nothing to the store, the database or the network.

import { useEffect, useState } from "react";

import { FORM_STATE_EVENT } from "@/editor/forms/draft-baseline";

/** Statuses that mean the submitted writing never reached storage. */
const LOSS_STATUSES = new Set([
  "VALIDATION_FAILED",
  "CONFLICT_STALE_REVISION",
  "DUPLICATE_REVISION",
  "INTERNAL",
]);

/** Statuses that mean the writing is safely stored, so the mirror must be dropped. */
const SAVED_STATUSES = new Set(["saved", "saved_approval_invalidated", "preserved_locked"]);

type Props = {
  itemId: string;
  status?: string | null;
};

export default function UnsavedDraftGuard({ itemId, status }: Props) {
  const key = `editor-unsaved:${itemId}`;
  const [recoveredAt, setRecoveredAt] = useState<string | null>(null);

  // Mirror every submission. Best-effort: a browser that refuses sessionStorage must never
  // be the reason a save fails.
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form[data-unsaved-guard]");
    if (!form) return;
    const capture = () => {
      try {
        const out: Record<string, string | boolean> = {};
        new FormData(form).forEach((value, name) => {
          if (name.startsWith("$ACTION")) return;
          // `__`-prefixed fields are the server's own state (the saved-draft baseline), not the
          // author's writing, so a restore must never put them back.
          if (name.startsWith("__")) return;
          out[name] = typeof value === "string" ? value : true;
        });
        out.__capturedAt = new Date().toISOString();
        sessionStorage.setItem(key, JSON.stringify(out));
      } catch {
        /* no storage: recovery unavailable, saving unaffected */
      }
    };
    form.addEventListener("submit", capture);
    // A native or otherwise unusual submission can bypass the `submit` event entirely, so
    // snapshot when the submit control is pressed as well. Preserving the writing must not
    // depend on how the browser decided to send it.
    const onPress = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button[type='submit'], input[type='submit']")) capture();
    };
    form.addEventListener("click", onPress, true);
    return () => {
      form.removeEventListener("submit", capture);
      form.removeEventListener("click", onPress, true);
    };
  }, [key]);

  // On a failed round trip, restore the submitted values and report that they were restored.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;

    const isFailure = Boolean(status) && LOSS_STATUSES.has(status as string);
    if (!isFailure) {
      if (status && SAVED_STATUSES.has(status)) {
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const form = document.querySelector<HTMLFormElement>("form[data-unsaved-guard]");
    if (!form) return;

    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    for (const [name, value] of Object.entries(draft)) {
      if (name.startsWith("__")) continue;
      const nodes = form.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(`[name="${CSS.escape(name)}"]`);
      nodes.forEach((node) => {
        if (node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio")) {
          node.checked = Boolean(value);
        } else {
          node.value = String(value);
        }
      });
    }

    // The restore wrote values straight into the fields, which the browser does not report as
    // input. Say so explicitly, so the panel re-measures against the SAVED baseline and shows the
    // returned writing as unsaved instead of claiming it matches the saved revision.
    form.dispatchEvent(new CustomEvent(FORM_STATE_EVENT, { bubbles: true }));

    setRecoveredAt(typeof draft.__capturedAt === "string" ? draft.__capturedAt : "earlier");
  }, [key, status]);

  if (!recoveredAt) return null;

  const when =
    recoveredAt === "earlier"
      ? "from earlier in this tab"
      : `${new Date(recoveredAt).toLocaleTimeString()} today`;

  return (
    <div
      role="status"
      className="mb-4 rounded-[var(--radius-surface)] border border-[var(--accent)] bg-paper-raised p-3"
    >
      <p className="font-medium text-ink">
        Your unsaved writing has been put back in the form.
      </p>
      <p className="meta mt-1">
        Captured {when}. It was never saved, and the rejected attempt did not change the
        stored revision. Review it and save again, or discard it.
      </p>
      <button
        type="button"
        className="rounded-[var(--radius-surface)] border border-[var(--input)] px-3 py-1 text-sm text-ink hover:bg-paper-raised"
        onClick={() => {
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* ignore */
          }
          location.reload();
        }}
      >
        Discard my unsaved writing
      </button>
    </div>
  );
}
