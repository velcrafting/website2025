"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function SignOut() {
  const [error, setError] = useState(false);
  return <div><Button variant="outline" type="button" onClick={async () => {
    try {
      const result = await fetch("/api/consulting/auth", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: '{"action":"logout"}',
      });
      if (result.ok) window.location.assign("/login");
      else setError(true);
    } catch { setError(true); }
  }}>Sign out</Button>{error && <p role="status">Could not sign out. Try again.</p>}</div>;
}
