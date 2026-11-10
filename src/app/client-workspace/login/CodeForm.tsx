"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

export default function CodeForm({ prospect = false, onVerified }: { prospect?: boolean; onVerified?: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(action: "send" | "verify") {
    setBusy(true);
    try {
      const options = { method: "POST", headers: { "Content-Type": "application/json" } };
      if (prospect) {
        const session = await fetch("/api/consulting/session", { ...options, body: "{}" });
        if (!session.ok) throw new Error("Online saving is unavailable.");
      }
      const result = await fetch("/api/consulting/auth", { ...options, body: JSON.stringify({ action, email, code }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      if (action === "send") { setSent(true); setNotice(data.message); }
      else if (prospect) { onVerified?.(email.trim().toLowerCase()); setNotice("Email verified for this exploration."); }
      else window.location.assign("/");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-in is unavailable.");
    } finally { setBusy(false); }
  }
  return <form className="mt-4 grid max-w-md gap-3" onSubmit={(event) => { event.preventDefault(); void submit(sent ? "verify" : "send"); }}>
    <label>Email address<input className="field mt-1 w-full" type="email" autoComplete="email" required value={email}
      onChange={(event) => { setEmail(event.target.value); setSent(false); setCode(""); }} /></label>
    {sent && <label>Email code<input className="field mt-1 w-full" autoComplete="one-time-code" inputMode="numeric"
      required value={code} onChange={(event) => setCode(event.target.value)} /></label>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy}>{sent ? "Verify code" : "Send a code"}</Button>
      {sent && <Button type="button" variant="outline" disabled={busy} onClick={() => void submit("send")}>Resend code</Button>}
    </div>
    <p role="status">{notice}</p>
  </form>;
}
