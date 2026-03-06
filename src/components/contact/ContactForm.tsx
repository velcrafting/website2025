// src/components/contact/ContactForm.tsx
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
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Honeypot */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <Input name="name" placeholder="Your name" autoComplete="name" />
      <Input name="email" placeholder="Email" type="email" required autoComplete="email" />
      <Input name="subject" placeholder="Subject (optional)" ref={subjectRef} />
      <div className="flex items-center justify-between">
        <label htmlFor="message" className="text-sm text-neutral-600 dark:text-neutral-400">Message</label>
        <button type="button" onClick={insertTemplate} className="text-xs underline text-neutral-700 dark:text-neutral-300">
          Help me write
        </button>
      </div>
      <textarea
        name="message"
        id="message"
        placeholder="Message"
        rows={6}
        required
        ref={messageRef}
        className="w-full rounded-md border px-3 py-2 bg-transparent focus:outline-white focus:ring-2 focus:ring-neutral-700"
      />

      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Send"}
      </Button>

      {state === "sent" && <div className="text-green-600 text-sm">Sent.</div>}
      {state === "error" && <div className="text-red-600 text-sm">Error. Try again.</div>}
    </form>
  );
}
