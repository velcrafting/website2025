"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import { fieldLabels, type BriefRevision, type FieldKey } from "@/consulting/brief";
import { aiNotice, aiNoticeVersion, parseShapingReply, type ShapingReply, type Suggestion } from "@/consulting/shaping";
import CodeForm from "@/app/client-workspace/login/CodeForm";

export type ExplorerAvailability = {
  shaping: boolean;
  prospect: boolean;
  booking: boolean;
  bookingUrl: string;
};

const jsonHeaders = { "Content-Type": "application/json" };
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const displayError = (error: unknown) => error instanceof Error ? error.message : "This action is unavailable. Your brief is still here.";

async function api(path: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api/consulting/${path}`, {
    method,
    ...(method === "GET" ? {} : { headers: jsonHeaders, body: JSON.stringify(body ?? {}) }),
    cache: "no-store",
    redirect: "error",
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object") {
    throw new Error(typeof data?.error === "string" && data.error.length <= 200 ? data.error : "This action is unavailable. Your brief is still here.");
  }
  return data;
}

type Turn = ShapingReply & { operationId: string; sourceMessageId: string | null; message: string };

function Conversation({ brief, dirty, canApply, apply }: {
  brief: BriefRevision | null;
  dirty: boolean;
  canApply: (field: FieldKey) => boolean;
  apply: (suggestion: Suggestion, sourceId: string) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [withBrief, setWithBrief] = useState("");
  const currentRevision = brief ? `${brief.id}/${brief.version}` : "";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const last = useRef<{ message: string; revision: string; id: string } | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!accepted || !text || sending.current) return;
    const selected = currentRevision && withBrief === currentRevision && !dirty ? brief : null;
    const revision = selected ? `${selected.id}/${selected.version}` : "";
    const previous = last.current;
    const idempotencyKey = previous?.message === text && previous.revision === revision ? previous.id : crypto.randomUUID();
    last.current = { message: text, revision, id: idempotencyKey };
    sending.current = true;
    setBusy(true);
    setStatus("Sending your message.");
    try {
      await api("session", "POST");
      const response = await api("shaping", "POST", { idempotencyKey, notice: aiNoticeVersion, message: text, brief: selected });
      const reply = parseShapingReply(JSON.stringify({ reply: response.reply, suggestions: response.suggestions }));
      if (!reply || !uuid(response.operationId)) throw new Error("The reply could not be displayed. Your brief is unchanged.");
      setTurns((current) => [...current.slice(-11), {
        ...reply, message: text, operationId: response.operationId,
        sourceMessageId: uuid(response.sourceMessageId) ? response.sourceMessageId : null,
      }]);
      setMessage("");
      last.current = null;
      setStatus("AI response received.");
    } catch (error) {
      setStatus(displayError(error));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <section aria-labelledby="conversation-title" className="mt-7 border-t border-rule pt-5">
    <h3 id="conversation-title">Ask for help shaping your brief</h3>
    <p id="ai-recording-notice" className="mt-2 max-w-prose">{aiNotice} Avoid including confidential information.</p>
    {turns.length > 0 && <ol aria-label="Conversation" className="mt-4 grid max-w-prose gap-4">
      {turns.map((turn) => <li key={turn.operationId} className="min-w-0 border-t border-rule pt-3">
        <p className="meta">You</p><p className="whitespace-pre-wrap break-words">{turn.message}</p>
        <p className="meta mt-3">AI response</p><p>{turn.reply}</p>
        {turn.suggestions.length > 0 && <ul aria-label="Optional suggestions" className="mt-3 grid gap-3">
          {turn.suggestions.map((suggestion) => <li key={suggestion.field}>
            <p><strong>{fieldLabels[suggestion.field]}</strong> {suggestion.text}</p>
            <Button type="button" variant="outline" size="sm"
              disabled={!turn.sourceMessageId || !canApply(suggestion.field)}
              onClick={() => { if (turn.sourceMessageId) apply(suggestion, turn.sourceMessageId); }}>
              Add suggestion to {fieldLabels[suggestion.field]}
            </Button>
          </li>)}
        </ul>}
      </li>)}
    </ol>}
    {turns.length > 0 && <p className="meta mt-3">Suggestions can fill unused fields in a new revision. Save unsaved edits before applying a suggestion. Existing values and corrections stay as entered.</p>}
    <form method="post" onSubmit={(event) => void send(event)} className="mt-4 grid max-w-prose gap-3" aria-describedby="ai-recording-notice">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} />
        I have read the recording notice and agree to send my message for AI assistance.
      </label>
      <label className="grid gap-1">Message
        <textarea className="field w-full" rows={3} maxLength={1600} required value={message}
          onChange={(event) => setMessage(event.target.value)} disabled={busy} />
      </label>
      {brief && !dirty && <label className="flex items-start gap-2">
        <input type="checkbox" checked={withBrief === currentRevision} onChange={(event) => setWithBrief(event.target.checked ? currentRevision : "")} disabled={busy} />
        Include saved brief revision {brief.version} as context
      </label>}
      <div><Button disabled={!accepted || !message.trim() || busy}>Send message</Button></div>
      <p role="status">{status}</p>
    </form>
  </section>;
}

type BriefRef = { id: string; version: number; sha256: string };

async function persistBrief(brief: BriefRevision): Promise<BriefRef> {
  const data = await api("brief", "POST", brief);
  if (data.id !== brief.id || data.version !== brief.version || typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256)) {
    throw new Error("The selected revision could not be verified.");
  }
  return { id: data.id, version: data.version, sha256: data.sha256 };
}

type Ticket = { intentId: string; confirmationVersion: number; schedulingUrl: string };
type BookingStatus = {
  intentId: string;
  confirmationVersion: number;
  revoked: boolean;
  expired?: boolean;
  material: "shared_for_booking" | "no_brief_confirmed";
  briefVersion: number | null;
  bookingState: "pending" | "confirmed" | "cancelled" | "rescheduled" | null;
  preparationState: "pending" | "ready" | "reconcile" | "cleaned" | null;
  startsAt: string | null;
  timeZone: string | null;
  meetUrl: string | null;
};
const bookingKey = "velcrafting.consulting.booking.v1";

function bookingTicket(input: unknown, base: string): Ticket | null {
  if (!input || typeof input !== "object") return null;
  const { intentId, confirmationVersion, schedulingUrl } = input as Partial<Ticket>;
  if (!uuid(intentId) || !Number.isSafeInteger(confirmationVersion) || !confirmationVersion || confirmationVersion < 1 ||
    typeof schedulingUrl !== "string") return null;
  try {
    const url = new URL(schedulingUrl), allowed = new URL(base);
    const values = url.searchParams.getAll("velcraftingIntent");
    if (url.protocol !== "https:" || url.origin !== allowed.origin || url.pathname !== allowed.pathname ||
      url.username || url.password || url.hash || [...url.searchParams].length !== 1 ||
      values.length !== 1 || !uuid(values[0])) return null;
    return { intentId, confirmationVersion, schedulingUrl: url.href };
  } catch { return null; }
}

function bookingStatus(input: unknown, intentId: string): BookingStatus | null {
  if (!input || typeof input !== "object") return null;
  const status = input as Partial<BookingStatus>;
  if (status.intentId !== intentId || !Number.isSafeInteger(status.confirmationVersion) ||
    typeof status.revoked !== "boolean" || (status.expired !== undefined && typeof status.expired !== "boolean") ||
    status.bookingState === undefined || ![null, "pending", "confirmed", "cancelled", "rescheduled"].includes(status.bookingState) ||
    status.preparationState === undefined || ![null, "pending", "ready", "reconcile", "cleaned"].includes(status.preparationState) ||
    (status.material !== "shared_for_booking" && status.material !== "no_brief_confirmed") ||
    (status.material === "shared_for_booking" ? !Number.isSafeInteger(status.briefVersion) : status.briefVersion !== null) ||
    ![status.startsAt, status.timeZone, status.meetUrl].every((value) => value === null || typeof value === "string")) return null;
  return status as BookingStatus;
}

function meetLink(input: string | null) {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.origin === "https://meet.google.com" && !url.username && !url.password &&
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

function Booking({ organizer, visitor, base, brief, dirty }: {
  organizer: string | null; visitor: string | null; base: string; brief: BriefRevision | null; dirty: boolean;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [choice, setChoice] = useState<"brief" | "none" | "">("");
  const [agreed, setAgreed] = useState(false);
  const [consentContext, setConsentContext] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const last = useRef<{ confirmation: string; id: string } | null>(null);
  const selected = choice === "brief" && !dirty ? brief : null;
  const context = `${visitor ?? ""}/${ticket?.intentId ?? ""}/${ticket?.confirmationVersion ?? ""}/${choice}/${selected?.id ?? ""}/${selected?.version ?? ""}`;
  const validChoice = choice === "none" || (choice === "brief" && !!selected);
  const hasConsent = agreed && consentContext === context && validChoice;
  const eligible = !status?.revoked && !status?.expired && status?.bookingState !== "cancelled" && status?.bookingState !== "rescheduled";

  useEffect(() => {
    if (!visitor || !organizer) return;
    const controller = new AbortController();
    let existing: Ticket | null = null;
    try { existing = bookingTicket(JSON.parse(window.sessionStorage.getItem(bookingKey) ?? "null"), base); }
    catch { /* The server is still authoritative if browser storage is blocked. */ }
    if (existing) {
      const saved = existing;
      setTicket(saved);
      void api(`booking?intentId=${encodeURIComponent(saved.intentId)}`, "GET", undefined, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          const latest = bookingStatus(data, saved.intentId);
          if (!latest) throw new Error("Booking status could not be verified.");
          setStatus(latest);
          setAuthorized(latest.confirmationVersion === saved.confirmationVersion);
        }).catch((error) => { if (!controller.signal.aborted) setNotice(displayError(error)); });
    }
    return () => controller.abort();
  }, [base, organizer, visitor]);

  async function act(action: "confirm" | "status" | "revoke", event?: FormEvent) {
    event?.preventDefault();
    if (lock.current || !visitor || !organizer) return;
    const activeTicket = eligible ? ticket : null;
    if (action === "confirm" && (!hasConsent || (!!activeTicket && !authorized))) return;
    if (action !== "confirm" && !ticket) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (action === "confirm") {
        const material = selected
          ? { state: "shared_for_booking", brief: await persistBrief(selected) }
          : { state: "no_brief_confirmed", brief: null };
        const confirmation = JSON.stringify({ intentId: activeTicket?.intentId, expectedVersion: activeTicket?.confirmationVersion, material });
        const idempotencyKey = last.current?.confirmation === confirmation ? last.current.id : crypto.randomUUID();
        last.current = { confirmation, id: idempotencyKey };
        const result = bookingTicket(await api("booking", "POST", {
          idempotencyKey, ...(activeTicket ? { intentId: activeTicket.intentId, expectedVersion: activeTicket.confirmationVersion } : {}),
          material,
        }), base);
        if (!result) throw new Error("The scheduling link could not be verified.");
        setTicket(result);
        try { window.sessionStorage.setItem(bookingKey, JSON.stringify(result)); } catch { /* Keep the current tab usable. */ }
        setAuthorized(true);
        const existingBooking = activeTicket && status?.bookingState ? status : null;
        setStatus({
          intentId: result.intentId, confirmationVersion: result.confirmationVersion, revoked: false,
          material: material.state === "shared_for_booking" ? "shared_for_booking" : "no_brief_confirmed",
          briefVersion: material.brief?.version ?? null, bookingState: existingBooking?.bookingState ?? null,
          preparationState: existingBooking ? "pending" : null,
          startsAt: existingBooking?.startsAt ?? null, timeZone: existingBooking?.timeZone ?? null, meetUrl: null,
        });
        setChoice("");
        setAgreed(false);
        setNotice(existingBooking ? "Sharing choice updated. Use Cal.com to change the existing meeting." : "Sharing choice saved. Open Cal.com to choose your time.");
        last.current = null;
      } else if (action === "status" && ticket) {
        const data = await api(`booking?intentId=${encodeURIComponent(ticket.intentId)}`);
        const latest = bookingStatus(data, ticket.intentId);
        if (!latest) throw new Error("Booking status could not be verified.");
        setStatus(latest);
        setAuthorized(latest.confirmationVersion === ticket.confirmationVersion);
        setNotice("Booking status updated.");
      } else if (action === "revoke" && ticket) {
        await api("booking", "DELETE", { intentId: ticket.intentId, expectedVersion: ticket.confirmationVersion });
        setStatus((current) => current ? { ...current, revoked: true, meetUrl: null } : current);
        setAuthorized(false);
        setAgreed(false);
        setNotice("Sharing permission withdrawn. Use Cal.com to make changes to the meeting.");
      }
    } catch (error) {
      setNotice(displayError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function forgetLink() {
    try { window.sessionStorage.removeItem(bookingKey); } catch { /* Storage is optional. */ }
    setTicket(null);
    setStatus(null);
    setAgreed(false);
    setNotice("Saved link cleared from this tab. Existing meetings are managed in Cal.com.");
  }

  const canSchedule = !!visitor && !!organizer && authorized && eligible && status?.bookingState === null;
  const meet = status?.preparationState === "ready" && status.bookingState === "confirmed" && eligible
    ? meetLink(status.meetUrl) : null;

  return <section id="integrated-scheduling" aria-labelledby="integrated-scheduling-title" className="mt-7 scroll-mt-6 border-t border-rule pt-5">
    <h3 id="integrated-scheduling-title">Schedule with meeting preparation</h3>
    {!visitor ? <p className="mt-2"><a href="#online-brief">Verify your email</a> to confirm who can receive the meeting material.</p>
      : !organizer ? <p className="mt-2">The meeting organizer could not be verified yet. The basic scheduling link remains available.</p> : <>
      <p className="mt-2">You ({visitor}) and the organizer ({organizer}) are the intended recipients. Choose what Velcrafting may prepare for your meeting.</p>
      {status && <div className="mt-3 border-t border-rule pt-3">
        <p>Confirmed choice: {status.material === "no_brief_confirmed" ? "No brief supplied" : `Brief revision ${status.briefVersion}`}.</p>
        <p>{status.revoked ? "Sharing permission withdrawn." : status.expired ? "Sharing choice expired." :
          status.bookingState === "confirmed" ? (meet ? "Meeting booked. Materials ready." : "Meeting booked. Materials are not ready yet.") :
          status.bookingState === "cancelled" ? "Meeting cancelled." :
          status.bookingState === "rescheduled" ? "Meeting rescheduled. Check Cal.com for the current details." :
          status.bookingState === "pending" ? "Booking is pending." : "Waiting for a booking from Cal.com."}</p>
        {status.startsAt && <p><time dateTime={status.startsAt}>{formatBookingTime(status.startsAt, status.timeZone)}</time></p>}
        {meet && <p><a href={meet} target="_blank" rel="noopener noreferrer">Open Google Meet</a></p>}
      </div>}
      <form method="post" onSubmit={(event) => void act("confirm", event)} className="mt-4 grid max-w-prose gap-3">
        <fieldset className="grid gap-2" disabled={busy}>
          <legend className="font-semibold">Meeting material</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="booking-material" checked={choice === "brief"} disabled={!brief || dirty}
              onChange={() => { setChoice("brief"); setAgreed(false); }} />
            {brief && !dirty ? `Share saved brief revision ${brief.version} and prepared notes` : "Save a revision to share a brief"}
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="booking-material" checked={choice === "none"}
              onChange={() => { setChoice("none"); setAgreed(false); }} />
            Continue without a brief and prepare notes only
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={hasConsent} disabled={!validChoice}
              onChange={(event) => { setAgreed(event.target.checked); setConsentContext(context); }} />
            I authorize sharing this meeting material with the recipients listed above.
          </label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !hasConsent || (!!ticket && eligible && !authorized)}>Confirm sharing choice</Button>
          {ticket && <Button type="button" variant="outline" disabled={busy} onClick={() => void act("status")}>Check booking status</Button>}
          {ticket && !authorized && !status?.revoked && <Button type="button" variant="outline" disabled={busy} onClick={forgetLink}>Clear saved link from this tab</Button>}
          {ticket && authorized && eligible && <Button type="button" variant="outline" disabled={busy} onClick={() => void act("revoke")}>Withdraw sharing permission</Button>}
        </div>
      </form>
      {canSchedule && ticket && <p className="mt-3"><a href={ticket.schedulingUrl} target="_blank" rel="noopener noreferrer">Choose a time on Cal.com (new tab)</a></p>}
      <p role="status" className="mt-2">{notice}</p>
    </>}
  </section>;
}

function formatBookingTime(date: string, timeZone: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "long", timeStyle: "short", timeZone: timeZone ?? "UTC",
    }).format(new Date(date)) + ` (${timeZone ?? "UTC"})`;
  } catch { return "Meeting time unavailable"; }
}

export default function ConnectedExplorer({ availability, brief, dirty, canApply, apply, restore }: {
  availability: ExplorerAvailability; brief: BriefRevision | null; dirty: boolean;
  canApply: (field: FieldKey) => boolean; apply: (suggestion: Suggestion, sourceId: string) => void;
  restore: (brief: BriefRevision) => void;
}) {
  const [verified, setVerified] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<string | null>(null);
  const [verification, setVerification] = useState(0);
  const [online, setOnline] = useState<BriefRevision | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!availability.prospect) return;
    const controller = new AbortController();
    void api("brief", "GET", undefined, controller.signal).then((data) => {
      if (controller.signal.aborted || typeof data.verifiedEmail !== "string") return;
      setVerified(data.verifiedEmail);
      setOnline(data.brief ?? null);
    }).catch(() => { /* An unclaimed browser can still use the local editor. */ });
    return () => controller.abort();
  }, [availability.prospect, verification]);

  useEffect(() => {
    if (!availability.booking || !verified) return;
    const controller = new AbortController();
    void api("booking", "GET", undefined, controller.signal).then((data) => {
      if (!controller.signal.aborted && typeof data.organizer === "string") setOrganizer(data.organizer);
    }).catch(() => { /* The basic scheduling link remains available. */ });
    return () => controller.abort();
  }, [availability.booking, verified]);

  async function saveOnline() {
    if (!brief || dirty || !verified || busy) return;
    setBusy(true);
    try {
      await persistBrief(brief);
      setOnline(brief);
      setNotice(`Revision ${brief.version} saved to this verified exploration.`);
    } catch (error) { setNotice(displayError(error)); }
    finally { setBusy(false); }
  }

  return <>
    {availability.shaping && <Conversation brief={brief} dirty={dirty} canApply={canApply} apply={apply} />}
    {availability.prospect && <section id="online-brief" aria-labelledby="online-brief-title" className="mt-7 scroll-mt-6 border-t border-rule pt-5">
      <h3 id="online-brief-title">Save and resume online</h3>
      <p className="mt-2">Email verification is optional for exploring and exporting. It links this browser’s current exploration to your email and does not create client access or subscribe you to updates.</p>
      {verified ? <>
        <p className="mt-2">Verified for this exploration: {verified}.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!brief || dirty || busy} onClick={() => void saveOnline()}>Save selected revision online</Button>
          {online && !brief && !dirty && <Button type="button" variant="outline" onClick={() => restore(online)}>Restore online revision {online.version}</Button>}
        </div>
        {online && (brief || dirty) && <p className="meta mt-2">Online revision {online.version} is available in a fresh tab in this browser.</p>}
        <p role="status" className="mt-2">{notice}</p>
      </> : <CodeForm prospect onVerified={(email) => { setVerified(email); setVerification((previous) => previous + 1); }} />}
    </section>}
    {availability.booking && <Booking organizer={organizer} visitor={verified}
      base={availability.bookingUrl} brief={brief} dirty={dirty} />}
  </>;
}
