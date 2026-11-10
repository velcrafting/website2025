"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  briefMarkdown, briefSections, briefText, fieldLabels, maxFieldLength, parseService, reviseBrief,
  scopeChoices, services, type BriefRevision, type FieldKey, type Service,
} from "@/consulting/brief";
import { assistedShaping } from "@/consulting/availability";
import { parseExplorerBlock } from "@/consulting/catalog";
import { exampleBrief, examples } from "@/consulting/fixtures";

const fields = Object.keys(fieldLabels) as FieldKey[];
const scopeKeys = Object.keys(scopeChoices) as (keyof typeof scopeChoices)[];
const stamp = () => ({ id: crypto.randomUUID(), now: new Date().toISOString() });

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const control = "block w-full rounded-[var(--radius-surface)] border border-rule bg-paper px-3 py-2 text-ink";

const subscribe = () => () => {};

export default function BriefDesk({ initialService }: { initialService: Service }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [brief, setBrief] = useState<BriefRevision | null>(null);
  const [dirty, setDirty] = useState(false);
  const [entry, setEntry] = useState(initialService);
  const [service, setService] = useState(initialService);
  if (entry !== initialService) {
    setEntry(initialService);
    setService(initialService);
    if (brief) setDirty(true);
  }
  const [notice, setNotice] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [example, setExample] = useState<keyof typeof examples | null>(null);
  const question = parseExplorerBlock({ kind: "question", text: example ? examples[example].question : "What would you like to make easier, clearer or possible?" });

  function loadExample(key: keyof typeof examples) {
    setBrief(exampleBrief(key, stamp()));
    setExample(key);
    setService(examples[key].service);
    setDirty(false);
    setFormKey((previous) => previous + 1);
    setNotice("Fictional example loaded as revision 1.");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const review = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "review";
    try {
      const next = reviseBrief(brief, brief?.version ?? 0, {
        service: parseService(form.get("service")),
        fields: Object.fromEntries(fields.map((key) => [key, String(form.get(key) ?? "")])),
        scope: Object.fromEntries(scopeKeys.map((key) => [key, String(form.get(`scope-${key}`) ?? "")])) as BriefRevision["scope"],
        review,
      }, stamp());
      setBrief(next);
      setDirty(false);
      setNotice(`Revision ${next.version} ${review ? "marked reviewed" : "saved on this page"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save this revision.");
    }
  }

  async function exportBrief(format: "pdf" | "md" | "copy") {
    if (!brief || dirty) return;
    const name = `velcrafting-brief-v${brief.version}`;
    try {
      if (format === "copy") {
        await navigator.clipboard.writeText(briefText(brief));
        setNotice(`Copied revision ${brief.version}.`);
      } else if (format === "md") {
        download(briefMarkdown(brief), "text/markdown;charset=utf-8", `${name}.md`);
        setNotice(`Markdown for revision ${brief.version} prepared.`);
      } else {
        const { briefPdf } = await import("@/consulting/pdf");
        download(briefPdf(brief), "application/pdf", `${name}.pdf`);
        setNotice(`PDF for revision ${brief.version} prepared.`);
      }
    } catch (error) {
      setNotice(format === "pdf" && error instanceof Error ? error.message : "Export failed. Your brief is still here; try Download Markdown.");
    }
  }

  return (
    <section id="explorer" aria-labelledby="explorer-title" className="section-gap scroll-mt-6">
      <p className="meta">Project explorer</p>
      <h2 id="explorer-title" className="mt-2">Shape a discussion brief</h2>
      <p className="mt-3 max-w-prose">{assistedShaping.message} Work stays in this tab until you download or copy it. Reloading clears it.</p>
      <nav aria-label="Project explorer" className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href="#brief-editor">Edit brief</a></Button>
        <Button asChild variant="outline" size="sm"><a href="#your-brief">Your brief</a></Button>
        <Button asChild variant="outline" size="sm"><a href="#schedule">Scheduling options</a></Button>
      </nav>
      <noscript><p className="mt-4">Brief editing and downloads require JavaScript. You can still explore the stages and schedule a conversation.</p></noscript>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div id="brief-editor" className="min-w-0 scroll-mt-6">
          <p className="meta">Fictional examples</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(examples) as (keyof typeof examples)[]).map((key) =>
              <Button key={key} type="button" variant="outline" size="sm" disabled={!ready || !!brief || dirty} onClick={() => loadExample(key)}>
                {examples[key].title}
              </Button>)}
          </div>
          <p className="meta mt-2">Choose an example before editing to keep your work intact.</p>
          {question && <p className="mt-5 font-semibold">{question.text}</p>}
          <form key={formKey} onSubmit={save} onChange={() => setDirty(true)} className="mt-3">
            <fieldset disabled={!ready} className="grid min-w-0 gap-4">
              <label className="grid gap-1">Service starting point
                <select name="service" value={service} onChange={(event) => setService(parseService(event.target.value))} className={control}>
                  {Object.entries(services).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              {fields.slice(0, 4).map((key) => (
                <label key={key} className="grid gap-1">{fieldLabels[key]}
                  <textarea name={key} rows={key === "problem" ? 3 : 2} maxLength={maxFieldLength} className={control} defaultValue={brief?.fields[key]?.text} />
                </label>
              ))}
              <details className="border-y border-rule">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">More context and scope choices</summary>
                <div className="grid gap-4 pb-4">
                  {fields.slice(4).map((key) => (
                    <label key={key} className="grid gap-1">{fieldLabels[key]}
                      <textarea name={key} rows={2} maxLength={maxFieldLength} className={control} defaultValue={brief?.fields[key]?.text} />
                    </label>
                  ))}
                  {scopeKeys.map((key) => {
                    const { label, choices, effect } = scopeChoices[key];
                    const block = parseExplorerBlock({ kind: "scope_effect", text: effect });
                    return <label key={key} className="grid gap-1">{label}
                      <select name={`scope-${key}`} defaultValue={brief?.scope[key] ?? ""} className={control} aria-describedby={`effect-${key}`}>
                        <option value="">Not sure yet</option>
                        {choices.map((choice) => <option key={choice}>{choice}</option>)}
                      </select>
                      <span id={`effect-${key}`} className="meta">{block?.text}</span>
                    </label>;
                  })}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" value="save" disabled={!!brief && !dirty}>Save draft revision</Button>
                <Button type="submit" value="review" variant="outline" disabled={!dirty && brief?.state === "reviewed"}>Mark reviewed</Button>
              </div>
            </fieldset>
          </form>
        </div>
        <div id="your-brief" className="min-w-0 scroll-mt-6">
          <Card hoverLift={false} className="mt-0">
            <h3>Your brief</h3>
            <p className="meta mt-2">{dirty ? "Unsaved changes. Save a revision before exporting." : brief ? "Saved on this page." : "Save your first revision or load a fictional example."}</p>
            {brief && <dl className="mt-4 grid gap-3">
              {briefSections(brief).map(([label, text]) => <div key={label}>
                <dt className="font-semibold">{label}</dt>
                <dd className="whitespace-pre-wrap break-words">{text}</dd>
              </div>)}
            </dl>}
            <div className="mt-5 flex flex-wrap gap-2">
              {([["pdf", "Download PDF"], ["md", "Download Markdown"], ["copy", "Copy brief"]] as const).map(([format, label]) =>
                <Button key={format} type="button" variant="outline" size="sm" disabled={!brief || dirty} onClick={() => void exportBrief(format)}>{label}</Button>
              )}
            </div>
          </Card>
        </div>
      </div>
      <p role="status" className="mt-3">{notice}</p>
    </section>
  );
}
