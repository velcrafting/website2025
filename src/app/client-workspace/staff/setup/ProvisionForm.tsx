"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import Button from "@/components/ui/Button";

type Option = { id: string; title: string; client: string; canGrantCommercial: boolean };
type Choice = [string, string];
const subscribe = () => () => {};
const field = "field mt-1 w-full";

export default function ProvisionForm({ canCreate, engagements, templates, actions }: {
  canCreate: boolean; engagements: Option[]; templates: Choice[]; actions: Choice[];
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [operation, setOperation] = useState("membership_grant");
  const retry = useRef<{ key: string; details: string } | null>(null);
  const allowsCommercial = engagements.find(({ id }) => id === selected)?.canGrantCommercial;

  async function submit(body: object) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/consulting/workspace/provision", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Workspace setup is unavailable.");
      if (typeof result.engagementId === "string") {
        setCreated(result.engagementId);
        setNotice("Engagement ready. Review its private discovery draft before publishing.");
        router.refresh();
      } else setNotice(result.disposition === "changed" ? "Access updated." : "Access was already set this way.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workspace setup is unavailable.");
    } finally { setBusy(false); }
  }

  return <div className="mt-6 grid max-w-3xl gap-6">
    {canCreate && <form method="post" className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const fields = Object.fromEntries(["client", "project", "engagement", "template", "objective"].map((name) => [name, String(form.get(name) ?? "").trim()]));
      const details = JSON.stringify(fields);
      if (retry.current?.details !== details) retry.current = { details, key: crypto.randomUUID() };
      void submit({ action: "create", retry: retry.current.key, ...fields });
    }}>
      <fieldset className="contents" disabled={!ready}>
        <h2>Create an engagement</h2>
        <p>This creates a client, a project and one engagement. The discovery draft stays private until you publish it. Clients can see the engagement name and objective only after you grant access.</p>
        <label>Client name<input name="client" required maxLength={180} className={field} /></label>
        <label>Project title<input name="project" required maxLength={180} className={field} /></label>
        <label>Engagement title<input name="engagement" required maxLength={180} className={field} /></label>
        <label>Workflow template<select name="template" className={field} required>
          {templates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Objective<textarea name="objective" required maxLength={1800} rows={4} className={field} /></label>
        <div><Button disabled={busy}>Create private engagement</Button></div>
        {created && <p><Link href={`/staff/${created}`}>Review the private discovery draft</Link></p>}
      </fieldset>
    </form>}

    {!!engagements.length && <form method="post" className="grid gap-3 border-t border-rule pt-5" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void submit({ action: "access", engagementId: selected, subjectId: String(form.get("subject") ?? "").trim(),
        operation, commercial: form.get("commercial") === "on" });
    }}>
      <fieldset className="contents" disabled={!ready}>
        <h2>Manage access</h2>
        <p>Use the person’s verified account ID. Membership and engagement access are separate approvals.</p>
        <label>Engagement<select className={field} required value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Select an engagement</option>
          {engagements.map(({ id, title, client }) => <option key={id} value={id}>{client} · {title}</option>)}
        </select></label>
        <label>Verified account ID<input className={field} name="subject" required maxLength={36} autoComplete="off" /></label>
        <label>Action<select className={field} value={operation} onChange={(event) => setOperation(event.target.value)}>
          {actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {operation === "engagement_grant" && allowsCommercial &&
          <label><input type="checkbox" name="commercial" /> Include separately authorized commercial terms</label>}
        {operation === "membership_revoke" &&
          <label><input type="checkbox" required /> Confirm this removes every engagement grant for this person at this client</label>}
        <div><Button disabled={busy}>Apply access change</Button></div>
      </fieldset>
    </form>}
    <p role="status">{notice}</p>
  </div>;
}
