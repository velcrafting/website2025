"use client";

// Prepare another draft from the SAVED revision.
//
// The action copies the author's own saved writing — title, summary, byline, sections and pinned
// sources — into a new independent draft. It is reuse, not generation: nothing is rewritten and no
// facts are invented.
//
// Two things this control has to be honest about, and both come from the same measurement:
//
//   1. It copies the SAVED revision, not what is currently on screen. The label says so.
//   2. It then navigates to the new draft. If there were unsaved edits, moving on would leave them
//      behind — so the control refuses to act while the form differs from the saved draft and says
//      why. The measurement reuses the editor's existing canonical snapshot, so "unsaved" means here
//      exactly what it means in the preview panel; there is no second definition.

import { useEffect, useState } from "react";

import {
  BASELINE_FIELD,
  FORM_STATE_EVENT,
  isContentControl,
  snapshotFromForm,
} from "@/editor/forms/draft-baseline";

type Props = {
  itemId: string;
  revisionId: string;
  action: (formData: FormData) => Promise<void>;
};

export default function PrepareAnotherDraft({ itemId, revisionId, action }: Props) {
  const [unsaved, setUnsaved] = useState(false);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const target = document.querySelector<HTMLFormElement>("form[data-unsaved-guard]");
    if (!target) return;

    const measure = () => {
      const saved = target.elements.namedItem(BASELINE_FIELD);
      if (!saved || saved instanceof RadioNodeList) return;
      setUnsaved(snapshotFromForm(target) !== (saved as HTMLInputElement).value);
      setMeasured(true);
    };
    const onContent = (event: Event) => {
      if (isContentControl(event.target)) measure();
    };

    target.addEventListener("input", onContent, true);
    target.addEventListener("change", onContent, true);
    target.addEventListener(FORM_STATE_EVENT, measure);
    measure();

    return () => {
      target.removeEventListener("input", onContent, true);
      target.removeEventListener("change", onContent, true);
      target.removeEventListener(FORM_STATE_EVENT, measure);
    };
  }, []);

  const blocked = unsaved;

  return (
    <form action={action} className="mt-3 space-y-2" data-prepare-another-draft>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <p className="meta">
        Copies your <strong>saved</strong> revision — title, summary, byline, sections and pinned
        sources — into a new independent draft. Nothing is rewritten, and the saved draft and any
        approval stay exactly as they are.
      </p>
      <button
        type="submit"
        disabled={blocked}
        aria-disabled={blocked}
        className="rounded-[var(--radius-surface)] border border-[var(--input)] px-4 py-2 text-sm text-ink hover:bg-paper-raised disabled:opacity-50"
      >
        Prepare another draft
      </button>
      {blocked ? (
        <p className="meta" role="status" data-prepare-blocked="true">
          Save your changes first. This copies the saved revision, and opening the new draft now would
          leave your unsaved edits behind.
        </p>
      ) : measured ? (
        <p className="meta" data-prepare-blocked="false">
          Ready — this matches the saved revision.
        </p>
      ) : null}
    </form>
  );
}
