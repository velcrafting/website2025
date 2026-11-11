"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import {
  briefMarkdown, briefSections, briefText, fieldLabels, maxFieldLength, parseService, reviseBrief,
  scopeChoices, services, type BriefRevision, type Service,
} from "@/consulting/brief";
import { parseExplorerBlock } from "@/consulting/catalog";
import { exampleBrief, examples } from "@/consulting/fixtures";
import {
  chooseDeskEntry, draftFromRevision, fields, guideSteps, newDesk, readDesk, scopeKeys, writeDesk,
  type DeskState, type GuideStep,
} from "@/consulting/desk-storage";

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

const prompts = {
  problem: { label: "Problem", question: "What keeps getting stuck?", hint: "Tell Steven where the work slows down, gets repeated, or falls through the cracks.", placeholder: "We review the same requests in email and a spreadsheet…" },
  outcome: { label: "Outcome", question: "What would better look like?", hint: "Describe what should be easier for you or your team.", placeholder: "One place to see what needs a decision…" },
  audience: { label: "People", question: "Who needs this to work?", hint: "Think about the people doing the work and anyone who needs to approve it.", placeholder: "Our operations team and the people sending requests…" },
  constraints: { label: "Constraints", question: "What should Steven work around?", hint: "Add any tools, deadlines, or requirements you already know about.", placeholder: "We need to keep using our existing inbox…" },
  review: { label: "Review", question: "Does this capture what you need?", hint: "Go back to change an answer, or save the brief as it is." },
} as const;

export default function BriefDesk({ initialService }: { initialService: Service }) {
  const [desk, setDesk] = useState(() => newDesk(initialService));
  const [storage, setStorage] = useState<"loading" | "available" | "unavailable">("loading");
  const [notice, setNotice] = useState("");
  const { brief, dirty, draft, example } = desk;
  const ready = storage !== "loading";
  const step = desk.step ?? "problem";
  const stepIndex = guideSteps.indexOf(step);
  const nextStep = guideSteps[stepIndex + 1];
  const previousStep = guideSteps[stepIndex - 1];
  const heading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);

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

  useEffect(() => {
    if (focusQuestion.current) {
      focusQuestion.current = false;
      heading.current?.focus();
    }
  }, [step]);

  function goTo(next: GuideStep) {
    if (next === step) return;
    focusQuestion.current = true;
    updateDesk({ ...desk, step: next });
  }

  function loadExample(key: keyof typeof examples) {
    const next = exampleBrief(key, stamp());
    if (step !== "review") focusQuestion.current = true;
    updateDesk({ ...desk, brief: next, example: key, draft: draftFromRevision(next.service, next), dirty: false, step: "review" });
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
    <section id="explorer" aria-labelledby="explorer-title" className="scroll-mt-6 border-y border-rule py-8 md:py-10">
      <h2 id="explorer-title">Let’s shape your project</h2>
      <p className="mt-2 max-w-prose">Put the problem and the result you need into a brief you can bring to Steven. Skip anything you’re unsure about.</p>
      {storage === "unavailable" && (
        <p role="status" className="mt-3">Browser storage is unavailable. Keep this page open or save a revision and export a copy before leaving.</p>
      )}
      <noscript><p className="mt-4">Brief editing and downloads require JavaScript. You can still explore the stages and schedule a conversation.</p></noscript>

      <div className="mt-5 grid min-w-0 rounded-[var(--radius-surface)] border border-rule bg-paper-raised lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div id="brief-editor" className="min-w-0 scroll-mt-6 p-4 sm:p-6 lg:p-8">
          <nav aria-label="Brief steps">
            <ol className="flex flex-wrap gap-2">
              {guideSteps.map((key, index) => (
                <li key={key}>
                  <button
                    type="button"
                    disabled={!ready}
                    aria-current={key === step ? "step" : undefined}
                    onClick={() => goTo(key)}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-chip)] border px-2.5 text-sm font-semibold ${
                      key === step ? "border-accent bg-accent text-[color:var(--on-accent)]" : "border-rule text-ink hover:border-ink"
                    }`}
                  >
                    <span aria-hidden="true">{index + 1}</span> {prompts[key].label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <h3 id="brief-question" ref={heading} tabIndex={-1} className="mt-5">{prompts[step].question}</h3>
          <p id="brief-question-hint" className="mt-2">{prompts[step].hint}</p>

          <form method="post" onSubmit={save} className="mt-4">
            <fieldset disabled={!ready} className="min-w-0">
              {guideSteps.map((key) => key !== "review" && (
                <div key={key} hidden={step !== key}>
                  <label htmlFor={`guide-${key}`} className="sr-only">{fieldLabels[key]}</label>
                  <textarea
                    id={`guide-${key}`}
                    name={key}
                    rows={4}
                    maxLength={maxFieldLength}
                    className={control}
                    value={draft.fields[key] ?? ""}
                    placeholder={prompts[key].placeholder}
                    aria-describedby="brief-question-hint"
                    onChange={changeDraft}
                  />
                </div>
              ))}

              <div hidden={step !== "review"} className="space-y-4">
                <label className="grid gap-1">Service starting point
                  <select name="service" value={draft.service} onChange={changeDraft} className={control}>
                    {Object.entries(services).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <details className="border-y border-rule">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold">Add more context or scope choices</summary>
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
                        <span id={`effect-${key}`} className="text-sm text-muted">{block?.text}</span>
                      </label>;
                    })}
                  </div>
                </details>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {nextStep && <Button type="button" onClick={() => goTo(nextStep)}>
                  {nextStep === "review" ? "Review brief" : `Next: ${prompts[nextStep].label.toLowerCase()}`}
                  <span aria-hidden="true">→</span>
                </Button>}
                {previousStep && <Button type="button" variant="outline" onClick={() => goTo(previousStep)}>Back</Button>}
                <Button type="submit" value="save" variant={step === "review" ? "default" : "outline"} disabled={!!brief && !dirty}>Save draft revision</Button>
                {step === "review" && <Button type="submit" value="review" variant="outline" disabled={!dirty && brief?.state === "reviewed"}>Mark reviewed</Button>}
              </div>
            </fieldset>
          </form>
          {!brief && !dirty && (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Try a fictional example</summary>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(examples) as (keyof typeof examples)[]).map((key) => (
                  <Button key={key} type="button" variant="outline" size="sm" disabled={!ready} onClick={() => loadExample(key)}>
                    {examples[key].title}
                  </Button>
                ))}
              </div>
            </details>
          )}
          <p role="status" className="mt-3">{notice}</p>
        </div>

        <aside id="your-brief" aria-labelledby="brief-preview-title" className="min-w-0 scroll-mt-6 rounded-b-[var(--radius-surface)] bg-accent p-4 sm:p-6 lg:rounded-bl-none lg:rounded-tr-[var(--radius-surface)] lg:p-8">
          <div className="rounded-[var(--radius-surface)] bg-paper-raised p-4 sm:p-5">
            <h3 id="brief-preview-title">Your brief</h3>
            <p className="mt-1 text-sm text-muted">{services[draft.service][0]}{example ? " · Fictional example" : ""}</p>
            {guideSteps.some((key) => key !== "review" && draft.fields[key]?.trim()) ? (
              <dl className="mt-4 divide-y divide-rule border-y border-rule">
                {guideSteps.map((key) => key !== "review" && draft.fields[key]?.trim() && (
                  <div key={key} className="py-2">
                    <dt className="font-semibold">{prompts[key].label}</dt>
                    <dd className={`whitespace-pre-wrap break-words ${step === "review" ? "" : "line-clamp-3"}`}>{draft.fields[key]}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="mt-4">Your answers appear here as you go.</p>}
            <p className="mt-4 text-sm">{dirty ? "Unsaved changes. Save a revision before exporting." : brief ? `Revision ${brief.version} ready to export.` : "You can save a partial brief at any point."}</p>
            {brief && <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">See saved revision</summary>
              <dl className="grid gap-3">
                {briefSections(brief).map(([label, text]) => <div key={label}>
                  <dt className="font-semibold">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{text}</dd>
                </div>)}
              </dl>
            </details>}
            <div className="mt-3 flex flex-wrap gap-2">
              {([["pdf", "Download PDF"], ["md", "Download Markdown"], ["copy", "Copy brief"]] as const).map(([format, label]) =>
                <Button key={format} type="button" variant="outline" size="sm" disabled={!brief || dirty} onClick={() => void exportBrief(format)}>{label}</Button>
              )}
            </div>
            {storage === "available" && <p className="mt-3 text-sm">Your answers stay in this tab, even if you refresh. Export a copy before closing it.</p>}
          </div>
        </aside>
      </div>
      <p className="mt-4"><a href="#schedule">Prefer to talk it through? Schedule a conversation.</a></p>
    </section>
  );
}
