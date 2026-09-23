// src/components/contact/NewsletterForm.tsx
//
// Concept 03: token-based field and announced status. Behaviour is unchanged
// (posts to /api/newsletter with the same payload).
//
// Consent note: newsletter signup stays separate from saving contact or joining
// the community. There is no bundled consent and no checkbox that silently
// enrols a contributor.
//
// D1: this control now renders on /connect beside the message form. It is a
// deliberate secondary — an outline button, not a filled one — so the page keeps a
// single primary action ("Send"). Consent behaviour is untouched.
"use client";
import { useState } from "react";
import { Input, Button } from "@/components/ui";

export default function NewsletterForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();

    if (!email) {
      setState("error");
      return;
    }

    try {
      setState("sending");
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "sent" : "error");
      if (res.ok) (e.target as HTMLFormElement).reset();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-[var(--space-3)]">
      <label className="meta block" htmlFor="newsletter-email">
        Email
      </label>
      <Input
        id="newsletter-email"
        name="email"
        placeholder="you@example.com"
        type="email"
        required
        autoComplete="email"
      />
      {/* The page's primary action. /connect used to have one because the message form's Send button
          sat here; that form was removed on 2026-09-16 and left the page with no primary at all.
          Steven calls the newsletter the prime, low-lift call to action, so this is it: one primary
          per page, and it is the one that asks least. The "Save my contact" and "Schedule a chat"
          actions stay outline secondaries, which is what their comment in /connect already says. */}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Subscribing…" : "Subscribe"}
      </Button>
      <p role="status" aria-live="polite" className="meta">
        {state === "sent" ? (
          <span style={{ color: "var(--success-ink)" }}>
            Thanks, your signup was received.
          </span>
        ) : null}
        {state === "error" ? (
          <span style={{ color: "var(--danger-ink)" }}>
            That did not go through. Check the address and try again.
          </span>
        ) : null}
      </p>
    </form>
  );
}
