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
  problem: { question: "What keeps getting stuck?", hint: "Tell Steven where the work slows down, gets repeated, or falls through the cracks.", placeholder: "We review the same requests in email and a spreadsheet…" },
  outcome: { question: "What would better look like?", hint: "Describe what should be easier for you or your team.", placeholder: "One place to see what needs a decision…" },
  audience: { question: "Who needs this to work?", hint: "Think about the people doing the work and anyone who needs to approve it.", placeholder: "Our operations team and the people sending requests…" },
  constraints: { question: "What should Steven work around?", hint: "Add any tools, deadlines, or requirements you already know about.", placeholder: "We need to keep using our existing inbox…" },
  review: { question: "Your project brief", hint: "Review what you wrote, then save a copy to keep or bring to a call." },
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
    <section id="explorer" tabIndex={-1} aria-labelledby="brief-question" className="mx-auto w-full max-w-[44rem] scroll-mt-6">
      <div id="brief-editor" className="min-w-0 rounded-[var(--radius-surface)] border border-rule bg-paper-raised p-4 sm:p-7">
        <div className="flex flex-wrap justify-between gap-x-3 text-sm font-medium text-muted">
          <span>Project brief</span>
          <span>{step === "review" ? "Review" : `Question ${stepIndex + 1} of ${guideSteps.length - 1}`}</span>
        </div>
        <div aria-hidden="true" className="mt-3 grid grid-cols-5 gap-1">
          {guideSteps.map((key, index) => (
            <span key={key} className={`h-0.5 rounded-full ${index <= stepIndex ? "bg-accent" : "bg-rule"}`} />
          ))}
        </div>
        <h2 id="brief-question" ref={heading} tabIndex={-1} className="mt-5">{prompts[step].question}</h2>
        <p id="brief-question-hint" className="mt-2">{prompts[step].hint}</p>
        {storage === "unavailable" && (
          <p role="status" className="mt-3">Browser storage is unavailable. Keep this page open or export a copy before leaving.</p>
        )}
        <noscript><p className="mt-4">Brief editing and downloads require JavaScript. You can still explore the stages and schedule a conversation.</p></noscript>

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

            {step === "review" && (
              <div id="your-brief">
                {(draft.service !== "unsure" || example) && (
                  <p className="text-sm text-muted">{[draft.service !== "unsure" ? services[draft.service][0] : "", example ? "Fictional example" : ""].filter(Boolean).join(" · ")}</p>
                )}
                {fields.some((key) => draft.fields[key]?.trim()) ? (
                  <dl className="mt-3 divide-y divide-rule border-y border-rule">
                    {fields.map((key) => draft.fields[key]?.trim() && (
                      <div key={key} className="py-3">
                        <dt className="text-sm font-semibold">{fieldLabels[key]}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words">{draft.fields[key]}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p>You haven’t added any answers yet.</p>}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {nextStep && <Button type="button" onClick={() => goTo(nextStep)}>
                {nextStep === "review" ? "Review brief" : "Continue"}
                <span aria-hidden="true">→</span>
              </Button>}
              {step === "review" && (brief && !dirty ? (
                <Button type="button" onClick={() => void exportBrief("pdf")}>Download PDF</Button>
              ) : (
                <Button type="submit" value="save">Save brief</Button>
              ))}
              {previousStep && step !== "review" && <Button type="button" variant="ghost" size="sm" onClick={() => goTo(previousStep)}>Back</Button>}
              {step === "review" && <Button type="button" variant="ghost" size="sm" onClick={() => goTo("problem")}>Edit answers</Button>}
              {nextStep && nextStep !== "review" && (
                <button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={() => goTo("review")}>Review &amp; export</button>
              )}
            </div>
            <p role="status" className={notice ? "mt-2 text-sm" : "sr-only"}>{notice}</p>

            <details hidden={step !== "review"} className="mt-3 border-t border-rule">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">More options</summary>
              <div className="grid gap-4 pb-2">
                <label className="grid gap-1">Service starting point
                  <select name="service" value={draft.service} onChange={changeDraft} className={control}>
                    {Object.entries(services).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Add more context or scope choices</summary>
                  <div className="grid gap-4">
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
                {brief && <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">See saved revision</summary>
                  <dl className="grid gap-3">
                    {briefSections(brief).map(([label, text]) => <div key={label}>
                      <dt className="font-semibold">{label}</dt>
                      <dd className="whitespace-pre-wrap break-words">{text}</dd>
                    </div>)}
                  </dl>
                </details>}
                {brief && !dirty && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void exportBrief("md")}>Download Markdown</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void exportBrief("copy")}>Copy brief</Button>
                    {brief.state !== "reviewed" && <Button type="submit" value="review" variant="outline" size="sm">Mark reviewed</Button>}
                  </div>
                )}
                {!brief && !dirty && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">Try a fictional example</span>
                    {(Object.keys(examples) as (keyof typeof examples)[]).map((key) => (
                      <Button key={key} type="button" variant="outline" size="sm" onClick={() => loadExample(key)}>{examples[key].title}</Button>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </fieldset>
        </form>
        {storage === "available" && (step === "problem" || step === "review") && (
          <p className="mt-3 text-sm">{step === "problem" ? "Answers stay in this tab. You can skip any question." : "Download a copy before closing this tab."}</p>
        )}
      </div>
    </section>
  );
}
