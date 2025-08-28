// src/components/contact/ContactForm.tsx
"use client";
import { useState } from "react";
import { Input, Button } from "@/components/ui";

export default function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

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
      <textarea
        name="message"
        placeholder="Message"
        rows={6}
        required
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