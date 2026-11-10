"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import Button from "@/components/ui/Button";
import type { IntakeReview } from "@/consulting/server/workspace-intake";

const subscribe = () => () => {};

export default function IntakeForm({ review, engagementId }: { review: IntakeReview; engagementId: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const request = useRef<{ key: string; selection: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState(false);
  if (!review.fields.length) return <p className="mt-3">This revision has no visitor statements eligible for this draft.</p>;

  return <form method="post" className="mt-4 grid gap-3" onSubmit={async (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget).getAll("fields").map(String).sort();
    if (!fields.length) { setNotice("Select at least one reviewed field."); return; }
    const selection = fields.join(",");
    if (request.current?.selection !== selection) request.current = { key: crypto.randomUUID(), selection };
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/consulting/workspace/intake", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          engagementId, intentId: review.intent_id, confirmationVersion: review.confirmation_version,
          bookingUid: review.booking_uid, briefId: review.brief_id, briefVersion: review.brief_version,
          briefSha256: review.brief_sha256, fields, retry: request.current.key,
        }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.itemId !== "string") throw new Error(result.error || "Workspace intake is unavailable.");
      setCreated(true);
      setNotice("Private Discovery draft saved. Review it before publishing.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workspace intake is unavailable.");
    } finally { setBusy(false); }
  }}>
    <fieldset disabled={!hydrated || busy || created} className="grid gap-3">
      <legend>Select visitor statements to import</legend>
      {review.fields.map(({ key, label, text }) => <label key={key} className="mt-2 block">
        <input type="checkbox" name="fields" value={key} /> {label}
        <span className="mt-1 block whitespace-pre-wrap break-words">{text}</span>
      </label>)}
      <div><Button>Create private Discovery draft</Button></div>
    </fieldset>
    <p aria-live="polite">{notice}</p>
    {created && <Link href={`/staff/${engagementId}`}>Open the engagement’s private drafts</Link>}
  </form>;
}
