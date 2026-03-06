// src/components/contact/NewsletterForm.tsx
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
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        name="email"
        placeholder="Email"
        type="email"
        required
        autoComplete="email"
      />
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Subscribing..." : "Subscribe"}
      </Button>
      {state === "sent" && (
        <div className="text-green-600 text-sm">Subscribed!</div>
      )}
      {state === "error" && (
        <div className="text-red-600 text-sm">Error. Try again.</div>
      )}
    </form>
  );
}