// src/components/contact/ContactForm.tsx
//
// Concept 03: token-based fields and status text. Behaviour is unchanged
// PARKED AND NOT WIRED — read this before importing it.
//
// The /api/contact route was removed on 2026-09-16. It was an open, unauthenticated endpoint that
// called resend.emails.send, so anyone could spend Steven's sending reputation. Steven: "i do not want
// open endpoints that could be abused like that.. so lets kill how the api is set."
//
// This component still posts to that path, so importing it as-is would fail at runtime with a 404.
// To bring the form back, do BOTH: restore the route from /tmp/removed-20260916/contact-route.ts, and
// add rate limiting to it first. See §7.15 of docs/implementation_plan_Sep16.md — the same KV limiter
// that src/app/api/event/route.ts already uses is the pattern.
//
// (honeypot, validation, /api/contact), so the existing endpoint contract and
// failure handling stay exactly as they were.
//
// LAYOUT (Phase 2 / D1): this is now the single primary action on /connect, so it is
// laid out to cost one row on a wide screen rather than four. The three short fields
// share a row from sm up; the message keeps the 60–70 character reading measure and
// five visible rows. No behaviour, validation, honeypot, endpoint or status-announcement
// change — only the arrangement of the same controls.
"use client";
import { useRef, useState } from "react";
import { Input, Button } from "@/components/ui";

export default function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  function insertTemplate() {
    const tpl = `Hi Steven,\n\nI'm reaching out about [topic].\n\n- Project overview:\n- Goals / success criteria:\n- Timeline:\n- Budget range:\n- Links / examples:\n- Preferred contact:\n\nThanks,\n[Your name]`;
    const current = messageRef.current?.value?.trim();
    if (current && !window.confirm("Replace your message with a helpful template?")) return;
    if (messageRef.current) messageRef.current.value = tpl;
    if (subjectRef.current && !subjectRef.current.value) subjectRef.current.value = "Project inquiry";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // Honeypot: bots fill hidden "company" field
    if ((fd.get("company") as string | null)?.trim()) {
      setState("sent");
      return;
    }

    const body = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      subject: String(fd.get("subject") || ""),
      message: String(fd.get("message") || ""),
    };

    if (!body.email || !body.message) {
      setState("error");
      return;
    }

    try {
      setState("sending");
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setState(res.ok ? "sent" : "error");
      if (res.ok) (e.target as HTMLFormElement).reset();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-[var(--space-3)]">
      {/* Honeypot */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      {/* Tab order follows this source order: name → email → subject → message → send.
          Two-up from sm, three-up from lg, one column on a phone. */}
      <div className="grid gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="meta block" htmlFor="contact-name">
            Your name
          </label>
          <Input id="contact-name" name="name" placeholder="Your name" autoComplete="name" />
        </div>
        <div>
          <label className="meta block" htmlFor="contact-email">
            Email <span aria-hidden="true">*</span>
          </label>
          <Input
            id="contact-email"
            name="email"
            placeholder="you@example.com"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="meta block" htmlFor="contact-subject">
            Subject (optional)
          </label>
          <Input id="contact-subject" name="subject" placeholder="Subject (optional)" ref={subjectRef} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-[var(--space-3)]">
        <label htmlFor="message" className="meta">
          Message <span aria-hidden="true">*</span>
        </label>
        <button
          type="button"
          onClick={insertTemplate}
          className="meta underline"
        >
          Help me write
        </button>
      </div>
      <textarea
        name="message"
        id="message"
        placeholder="Message"
        rows={5}
        required
        ref={messageRef}
        className="field field-mono max-w-[var(--measure-prose)]"
      />

      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send"}
      </Button>

      {/* Status is announced, not colour-only. */}
      <p role="status" aria-live="polite" className="meta">
        {state === "sent" ? (
          <span style={{ color: "var(--success-ink)" }}>Sent.</span>
        ) : null}
        {state === "error" ? (
          <span style={{ color: "var(--danger-ink)" }}>
            That did not send. Check the email address and try again.
          </span>
        ) : null}
      </p>
    </form>
  );
}
