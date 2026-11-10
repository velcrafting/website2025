"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";

type Candidate = { item_id: string; version: number; prior: number; title: string; stage: string; sections: {label:string;text:string}[]; terms?: string };
type Choice = { value: string; label: string; sections: readonly string[] };

export default function DraftForm({ id, stages, drafts, capabilities, baseline }: {
  id: string; stages: Choice[]; drafts: Candidate[]; capabilities: string[]; baseline?: {item_id:string;version:number};
}) {
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [kind, setKind] = useState(stages[0].value);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const sections = stages.find(({value}) => value === kind)?.sections ?? [];
  const post = async (payload: unknown, endpoint = "/api/consulting/workspace") => {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(false); }
  };
  return <div className="mt-5 grid max-w-3xl gap-5">
    <label>Saved drafts<select className="field mt-1 w-full" onChange={(event) => {
      const candidate = drafts.find(({item_id}) => item_id === event.target.value) ?? null;
      setSelected(candidate); setKind(candidate?.stage ?? stages[0].value); setPreview(false); setCommercial(false);
    }}><option value="">New draft</option>{drafts.map((draft) =>
      <option key={draft.item_id} value={draft.item_id}>{draft.title} · v{draft.version}</option>)}</select></label>
    {capabilities.includes("draft") && <form key={selected?.item_id ?? "new"} className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const terms = String(form.get("terms") ?? "").trim();
      void post({ engagementId: id, itemId: selected?.item_id ?? crypto.randomUUID(), expected: selected?.version ?? 0,
        stage: kind, title: form.get("title"), sections: sections.map((label) => ({ label, text: String(form.get(label) ?? "").trim() })).filter(({text}) => text),
        ...(terms ? { terms } : {}) });
    }}>
      <label>Stage<select className="field mt-1 w-full" value={kind} disabled={!!selected} onChange={(event) => setKind(event.target.value)}>
        {stages.map(({value,label}) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Title<input name="title" required maxLength={180} defaultValue={selected?.title} className="field mt-1 w-full"/></label>
      {sections.map((label) => <label key={label}>{label}<textarea name={label} rows={3} maxLength={1800} className="field mt-1 w-full"
        defaultValue={selected?.sections.find((entry) => entry.label === label)?.text}/></label>)}
      {capabilities.includes("issue") && ["proposal","quote"].includes(kind) &&
        <label>Private commercial terms<textarea name="terms" rows={3} maxLength={4000} defaultValue={selected?.terms} className="field mt-1 w-full" /></label>}
      <div><Button disabled={busy}>Save new revision</Button></div>
    </form>}
    {selected && <div className="border-t border-rule pt-4">
      <Button type="button" variant="outline" onClick={() => setPreview(!preview)}>Preview saved revision {selected.version}</Button>
      {preview && <section className="my-4 border border-rule p-4">
        <h2>{selected.title} · v{selected.version}</h2>
        {selected.terms && <label className="my-3 block"><input type="checkbox" checked={commercial} onChange={(event) => setCommercial(event.target.checked)} /> Preview commercial audience</label>}
        <dl className="grid gap-3">{selected.sections.map(({label,text}) => <div key={label}><dt>{label}</dt><dd className="whitespace-pre-wrap">{text}</dd></div>)}</dl>
        {commercial && selected.terms && <p className="mt-3 whitespace-pre-wrap">{selected.terms}</p>}
        {capabilities.includes("publish") && selected.prior < selected.version && <Button className="mt-4" type="button" disabled={busy}
          onClick={() => void post({ action: "publish", engagementId: id, itemId: selected.item_id,
            version: selected.version, prior: selected.prior, retry: crypto.randomUUID() })}>Publish this revision</Button>}
      </section>}
      {capabilities.includes("publish") && selected.prior > 0 &&
        <form className="mt-5 grid gap-3" onSubmit={async (event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          const file = form.get("file");
          if (!(file instanceof File) || !file.size || file.size > 3_000_000) {
            setNotice("Select a file no larger than 3 MB."); return;
          }
          const media = file.name.toLowerCase().endsWith(".md") ? "text/markdown" : file.type;
          if (!["application/pdf","text/plain","text/markdown"].includes(media)) {
            setNotice("Choose a PDF, plain text, or Markdown file."); return;
          }
          const data = new Uint8Array(await file.arrayBuffer());
          const parts: string[] = [];
          for (let offset=0;offset<data.length;offset+=32768) parts.push(String.fromCharCode(...data.subarray(offset,offset+32768)));
          void post({ engagementId: id, itemId: selected.item_id, version: selected.prior,
            name:file.name, media, bytes:btoa(parts.join("")), commercial:form.get("commercial") === "on" }, "/api/consulting/workspace/files");
        }}>
          <h3>Attach a private file to issued version {selected.prior}</h3>
          <label>File<input className="field mt-1 w-full" name="file" type="file" accept=".pdf,.md,.txt" required /></label>
          {capabilities.includes("issue") && <label><input name="commercial" type="checkbox" /> Commercial viewers only</label>}
          <div><Button disabled={busy}>Store private file</Button></div>
        </form>}
      {capabilities.includes("record_agreement") && selected.stage === "proposal" && selected.prior > 0 &&
        <form className="mt-5 grid gap-3" onSubmit={(event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          const time = new Date(String(form.get("time")));
          if (!Number.isFinite(time.getTime())) return;
          void post({ action: "agreement", engagementId: id, itemId: selected.item_id, version: selected.prior,
            authorityId: form.get("authority"), evidence: form.get("evidence"), acceptedAt: time.toISOString(),
            parent: baseline ? { itemId: baseline.item_id, version: baseline.version } : null });
        }}>
          <h3>Record external agreement for issued version {selected.prior}</h3>
          <p>Use the named authority record and evidence of explicit agreement. Acknowledgment alone does not qualify.</p>
          <label>Authority record ID<input className="field mt-1 w-full" name="authority" required /></label>
          <label>Agreement time (your local time)<input className="field mt-1 w-full" name="time" type="datetime-local" required /></label>
          <label>Private evidence reference<input className="field mt-1 w-full" name="evidence" required maxLength={1000} /></label>
          <div><Button disabled={busy}>Record external agreement</Button></div>
        </form>}
    </div>}
    <p role="status">{notice}</p>
  </div>;
}
