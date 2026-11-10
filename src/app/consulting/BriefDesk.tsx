"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  briefMarkdown, briefSections, briefText, fieldLabels, maxFieldLength, parseService, reviseBrief,
  scopeChoices, services, type BriefRevision, type Service,
} from "@/consulting/brief";
import { assistedShaping } from "@/consulting/availability";
import { parseExplorerBlock } from "@/consulting/catalog";
import { exampleBrief, examples } from "@/consulting/fixtures";
import { chooseDeskEntry, draftFromRevision, fields, newDesk, readDesk, scopeKeys, writeDesk, type DeskState } from "@/consulting/desk-storage";

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

export default function BriefDesk({ initialService }: { initialService: Service }) {
  const [desk, setDesk] = useState(() => newDesk(initialService));
  const [storage, setStorage] = useState<"loading" | "available" | "unavailable">("loading");
  const [notice, setNotice] = useState("");
  const { brief, dirty, draft, example } = desk;
  const ready = storage !== "loading";

  const updateDesk = useCallback((next: DeskState) => {
    setDesk(next);
    try {
      writeDesk(window.sessionStorage, next);
      setStorage("available");
    } catch {
      setStorage("unavailable");
    }
  }, []);

  useEffect(() => {
    try {
      const stored = readDesk(window.sessionStorage);
      if (stored) setDesk(stored);
      setStorage("available");
    } catch {
      setStorage("unavailable");
    }
  }, []);

  useEffect(() => {
    if (ready && desk.entry !== initialService) updateDesk(chooseDeskEntry(desk, initialService));
  }, [desk, initialService, ready, updateDesk]);

  const question = parseExplorerBlock({ kind: "question", text: example ? examples[example].question : "What would you like to make easier, clearer or possible?" });

  function loadExample(key: keyof typeof examples) {
    const next = exampleBrief(key, stamp());
    updateDesk({ ...desk, brief: next, example: key, draft: draftFromRevision(next.service, next), dirty: false });
    setNotice("Fictional example loaded as revision 1.");
  }

  function changeDraft(event: ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) {
    if (!event.currentTarget.form) return;
    const form = new FormData(event.currentTarget.form);
    updateDesk({
      ...desk,
      dirty: true,
      draft: {
        service: parseService(form.get("service")),
        fields: Object.fromEntries(fields.map((key) => [key, String(form.get(key) ?? "")])),
        scope: Object.fromEntries(scopeKeys.map((key) => [key, String(form.get(`scope-${key}`) ?? "")])) as BriefRevision["scope"],
      },
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const review = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "review";
    try {
      const next = reviseBrief(brief, brief?.version ?? 0, { ...draft, review }, stamp());
      updateDesk({ ...desk, brief: next, draft: draftFromRevision(next.service, next), dirty: false });
      setNotice(`Revision ${next.version} ${review ? "marked reviewed" : "saved"}.`);
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
        const { briefPdf, briefPdfFontFiles } = await import("@/consulting/pdf");
        const bytes = await briefPdf(brief, async (font) => {
          const response = await fetch(`/consulting-fonts/${briefPdfFontFiles[font]}`, { redirect: "error" });
          if (!response.ok) throw new Error("A PDF font could not load. Download Markdown or copy the brief.");
          return new Uint8Array(await response.arrayBuffer());
        });
        download(bytes, "application/pdf", `${name}.pdf`);
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
      <p className="mt-3 max-w-prose">{assistedShaping.message}</p>
      {storage === "available" && <p className="meta mt-3">Your saved brief and unsaved edits stay in this tab’s browser session, including after a refresh. Export a copy before closing this tab.</p>}
      <nav aria-label="Project explorer" className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href="#brief-editor">Edit brief</a></Button>
        <Button asChild variant="outline" size="sm"><a href="#your-brief">Your brief</a></Button>
        <Button asChild variant="outline" size="sm"><a href="#schedule">Scheduling options</a></Button>
      </nav>
      {storage === "unavailable" && <p role="status" className="meta mt-3">Browser storage is unavailable. Keep this page open or save a revision and export a copy before leaving.</p>}
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
          <form onSubmit={save} className="mt-3">
            <fieldset disabled={!ready} className="grid min-w-0 gap-4">
              <label className="grid gap-1">Service starting point
                <select name="service" value={draft.service} onChange={changeDraft} className={control}>
                  {Object.entries(services).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              {fields.slice(0, 4).map((key) => (
                <label key={key} className="grid gap-1">{fieldLabels[key]}
                  <textarea name={key} rows={key === "problem" ? 3 : 2} maxLength={maxFieldLength} className={control} value={draft.fields[key] ?? ""} onChange={changeDraft} />
                </label>
              ))}
              <details className="border-y border-rule">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">More context and scope choices</summary>
                <div className="grid gap-4 pb-4">
                  {fields.slice(4).map((key) => (
                    <label key={key} className="grid gap-1">{fieldLabels[key]}
                      <textarea name={key} rows={2} maxLength={maxFieldLength} className={control} value={draft.fields[key] ?? ""} onChange={changeDraft} />
                    </label>
                  ))}
                  {scopeKeys.map((key) => {
                    const { label, choices, effect } = scopeChoices[key];
                    const block = parseExplorerBlock({ kind: "scope_effect", text: effect });
                    return <label key={key} className="grid gap-1">{label}
                      <select name={`scope-${key}`} value={draft.scope[key]} onChange={changeDraft} className={control} aria-describedby={`effect-${key}`}>
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
            <p className="meta mt-2">{dirty ? "Unsaved changes. Save a revision before exporting." : brief ? "Revision ready to export." : "Save your first revision or load a fictional example."}</p>
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
