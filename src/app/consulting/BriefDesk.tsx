"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import { bookingLinkWithProblem, maxBookingProblemLength } from "@/consulting/booking-link";
import {
  briefMarkdown, briefSections, briefText, fieldLabels, maxFieldLength, normalizeBriefField, parseService, reviseBrief,
  scopeChoices, services, type BriefRevision, type Service,
} from "@/consulting/brief";
import { parseExplorerBlock } from "@/consulting/catalog";
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
  problem: { question: "What keeps getting stuck?", hint: "A sentence or two is enough. Leave out confidential details.", placeholder: "We review the same requests in email and a spreadsheet…" },
  outcome: { question: "What would better look like?", hint: "Describe what should be easier for you or your team.", placeholder: "One place to see what needs a decision…" },
  audience: { question: "Who needs this to work?", hint: "Think about the people doing the work and anyone who needs to approve it.", placeholder: "Our operations team and the people sending requests…" },
  constraints: { question: "Any blockers?", hint: "What tools, deadlines, or requirements should we work around?", placeholder: "We need to keep using our existing inbox…" },
} as const;

export default function BriefDesk({ initialService, bookingUrl, contactEmail }: { initialService: Service; bookingUrl: string; contactEmail: string }) {
  const [desk, setDesk] = useState(() => newDesk(initialService));
  const [storage, setStorage] = useState<"loading" | "available" | "unavailable">("loading");
  const [notice, setNotice] = useState("");
  const [problemNeeded, setProblemNeeded] = useState(false);
  const { brief, dirty, draft, example } = desk;
  const ready = storage !== "loading";
  const step = desk.step === "review" ? "constraints" : desk.step ?? "problem";
  const stepIndex = guideSteps.indexOf(step);
  const nextStep = guideSteps[stepIndex + 1];
  const previousStep = guideSteps[stepIndex - 1];
  const problem = normalizeBriefField(draft.fields.problem ?? "");
  const savedProblem = brief?.fields.problem;
  const hasProblem = !!problem && (!savedProblem || savedProblem.source === "visitor" || problem !== normalizeBriefField(savedProblem.text));
  const scheduleUrl = hasProblem ? bookingLinkWithProblem(bookingUrl, problem) : null;
  const heading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);
  const bookingDialog = useRef<HTMLDialogElement>(null);

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
      heading.current?.focus();
      focusQuestion.current = false;
    }
  }, [step]);

  function goTo(next: Exclude<GuideStep, "review">) {
    if (next === step) return;
    focusQuestion.current = true;
    updateDesk({ ...desk, step: next });
  }

  function continueIntake() {
    if (nextStep && nextStep !== "review") {
      goTo(nextStep);
    } else if (hasProblem) {
      bookingDialog.current?.showModal();
    } else {
      setProblemNeeded(true);
      goTo("problem");
    }
  }

  function changeDraft(event: ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) {
    if (!event.currentTarget.form) return;
    if (event.currentTarget.name === "problem") setProblemNeeded(false);
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
    if (!hasProblem || !bookingDialog.current?.open) return;
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
    if (!hasProblem || !brief || dirty) return;
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
    <section id="explorer" tabIndex={-1} aria-labelledby="intake-title" className="min-w-0 scroll-mt-6">
      <div id="schedule" tabIndex={-1} className="flex scroll-mt-6 flex-wrap justify-between gap-x-3 font-sans text-sm font-medium text-muted">
        <span id="intake-title" className="font-semibold">Your real problem</span>
        <span>{`Question ${stepIndex + 1} of ${guideSteps.length - 1}`}</span>
      </div>
      <div id="brief-editor">
        <div aria-hidden="true" className="mt-3 grid grid-cols-4 gap-1">
          {guideSteps.slice(0, -1).map((key, index) => (
            <span key={key} className={`h-0.5 rounded-full ${index <= stepIndex ? "bg-accent" : "bg-rule"}`} />
          ))}
        </div>
        <div className="mt-3 min-h-[5.5rem]">
          <h3 id="brief-question" ref={heading} tabIndex={-1} className="text-xl">{prompts[step].question}</h3>
          <p id="brief-question-hint" className="mt-2">{step === "problem" && problemNeeded ? "Add a sentence about your problem to book." : prompts[step].hint}</p>
        </div>
        <noscript><p className="mt-3 text-sm">The brief and scheduling require JavaScript. You can still explore the stages or email Steven.</p></noscript>
        {storage === "unavailable" && (
          <p role="status" className="mt-3">Browser storage is unavailable. Keep this page open or export a copy before leaving.</p>
        )}
        <form method="post" onSubmit={save}>
          <fieldset disabled={!ready} className="min-w-0">
            {guideSteps.map((key) => key !== "review" && (
              <div key={key} hidden={step !== key}>
                <label htmlFor={`guide-${key}`} className="sr-only">{fieldLabels[key]}</label>
                <textarea
                  id={`guide-${key}`}
                  name={key}
                  rows={4}
                  maxLength={key === "problem" ? maxBookingProblemLength : maxFieldLength}
                  className={control}
                  value={draft.fields[key] ?? ""}
                  placeholder={prompts[key].placeholder}
                  aria-describedby="brief-question-hint"
                  onChange={changeDraft}
                />
              </div>
            ))}

            <div id="brief-actions" className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {previousStep && previousStep !== "review" && <Button type="button" variant="ghost" size="sm" onClick={() => goTo(previousStep)}>Back</Button>}
              {previousStep && scheduleUrl && (
                <Button type="button" variant={nextStep === "review" ? "default" : "outline"} size="compact" onClick={() => bookingDialog.current?.showModal()}>
                  Submit &amp; Book
                </Button>
              )}
              {(nextStep !== "review" || !scheduleUrl) && (
                <Button type="button" size="compact" className="ml-auto" onClick={continueIntake}>Continue</Button>
              )}
            </div>
            <dialog ref={bookingDialog} aria-labelledby="booking-review-title"
              className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[var(--radius-surface)] border border-rule bg-paper-raised p-5 text-ink backdrop:bg-black/45 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <h3 id="booking-review-title">Review &amp; book a meeting</h3>
                <Button type="button" variant="ghost" size="sm" aria-label="Close booking review" onClick={() => bookingDialog.current?.close()}>×</Button>
              </div>
              <div id="your-brief">
                {(draft.service !== "unsure" || example) && (
                  <p className="text-sm text-muted">{[draft.service !== "unsure" ? services[draft.service][0] : "", example ? "Fictional example" : ""].filter(Boolean).join(" · ")}</p>
                )}
                <dl className="mt-3 divide-y divide-rule border-y border-rule">
                  {fields.map((key) => draft.fields[key]?.trim() && (
                    <div key={key} className="py-3">
                      <dt className="text-sm font-semibold">{fieldLabels[key]}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words">{draft.fields[key]}</dd>
                    </div>
                  ))}
                </dl>
                {problem.length > maxBookingProblemLength && <p className="mt-3 font-medium">Shorten your problem to {maxBookingProblemLength} characters or fewer to book.</p>}
                {scheduleUrl && <p className="mt-3 text-sm">Your problem goes in the Cal.com booking link and may appear on the invite.</p>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {scheduleUrl && <Button asChild>
                  <a href={scheduleUrl} target="_blank" rel="noopener noreferrer">Choose a time on Cal.com <span aria-hidden="true">↗</span><span className="sr-only">(new tab)</span></a>
                </Button>}
                <Button type="button" variant="ghost" size="sm" onClick={() => { bookingDialog.current?.close(); goTo("problem"); }}>Edit answers</Button>
              </div>
              <p role="status" className={notice ? "mt-2 text-sm" : "sr-only"}>{notice}</p>

              {hasProblem && <details className="mt-3 border-t border-rule">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Download or share the full brief</summary>
                <p className="text-sm">Booking shares your problem only. To share the full brief, download the PDF and attach it to an email.</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {brief && !dirty ? <>
                    <Button type="button" variant="outline" size="sm" onClick={() => void exportBrief("pdf")}>Download PDF</Button>
                    <a href={`mailto:${contactEmail}`} className="inline-flex min-h-11 items-center text-sm">Open email</a>
                  </> : <Button type="submit" value="save" variant="outline" size="sm">Save brief</Button>}
                </div>
              </details>}

              <details className="mt-3 border-t border-rule">
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
                  {hasProblem && brief && !dirty && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void exportBrief("md")}>Download Markdown</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void exportBrief("copy")}>Copy brief</Button>
                      {brief.state !== "reviewed" && <Button type="submit" value="review" variant="outline" size="sm">Mark reviewed</Button>}
                    </div>
                  )}
                </div>
              </details>
            </dialog>
          </fieldset>
        </form>
      </div>
    </section>
  );
}
