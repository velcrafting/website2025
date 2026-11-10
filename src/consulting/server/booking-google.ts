import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { briefText, type BriefRevision } from "../brief";
import type { BookingArtifactProvider, BookingMutation } from "./booking-worker";
import { normalizeRecipient, type BriefRef, type CalendarEvent, type CurrentMeeting, type EventRef } from "./meeting-contract";

type Options = {
  ownerEmail: string;
  ownerToken: string;
  calendarId: string;
  loadBrief: (intentId: string, brief: BriefRef) => Promise<BriefRevision | null>;
  lookupArtifact: (intentId: string, fileId: string) => Promise<{ contentsSha256?: string } | null>;
  // The controlled test credential must belong to the verified recipient for this booking.
  visitorProbeToken?: string;
  transport?: typeof fetch;
};

type Item = Record<string, unknown>;
type EventFile = { fileUrl: string; fileId?: string; title?: string; mimeType?: string; iconLink?: string };
const agendaRange = "velcrafting_prepared_agenda";
const item = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const items = (value: unknown) => Array.isArray(value) ? value.map(item) : [];
const string = (value: unknown) => typeof value === "string" ? value : "";
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const enc = encodeURIComponent;

export function createGoogleMeetingAdapter(options: Options) {
  const request = options.transport ?? fetch;
  async function google(
    api: "calendar" | "drive" | "upload" | "docs", path: string, init: RequestInit = {}, token = options.ownerToken,
  ): Promise<{ value: Item; etag: string | null } | null> {
    const prefix = {
      calendar: "https://www.googleapis.com/calendar/v3/",
      drive: "https://www.googleapis.com/drive/v3/",
      upload: "https://www.googleapis.com/upload/drive/v3/",
      docs: "https://docs.googleapis.com/v1/",
    }[api];
    const response = await request(prefix + path, {
      ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new Error("Google meeting operation unavailable");
    return { value: response.status === 204 ? {} : item(await response.json()), etag: response.headers.get("etag") };
  }

  const renderBrief = async (intentId: string, ref: BriefRef) => {
    const { briefPdf, briefPdfFontFiles } = await import("../pdf");
    const snapshot = await artifactBrief(intentId, ref);
    return briefPdf(snapshot, (font) => readFile(join(process.cwd(), "public", "consulting-fonts", briefPdfFontFiles[font])));
  };
  const sendJson = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
    method, body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers },
  });
  const eventPath = (ref: EventRef) => `calendars/${enc(ref.calendarId)}/events/${enc(ref.uid)}`;
  async function rawEvent(ref: EventRef) {
    if (ref.calendarId !== options.calendarId) throw new Error("Calendar outside the authorized booking scope");
    const response = await google("calendar", eventPath(ref));
    if (response && (response.value.id !== ref.uid ||
      normalizeRecipient(string(item(response.value.organizer).email)) !== options.ownerEmail))
      throw new Error("Calendar organizer or event changed");
    return response;
  }

  async function readEvent(ref: EventRef): Promise<CalendarEvent | null> {
    const response = await rawEvent(ref);
    if (!response || response.value.status === "cancelled") return null;
    const event = response.value;
    const attendees = items(event.attendees).map((entry) => string(entry.email));
    if (event.attendeesOmitted === true || attendees.some((email) => !email)) return null;
    const conference = item(event.conferenceData);
    const meet = items(conference.entryPoints).find((entry) => entry.entryPointType === "video");
    const link = string(meet?.uri);
    const meetStatus = item(item(conference.createRequest).status).statusCode;
    const meetUrl = item(item(conference.conferenceSolution).key).type === "hangoutsMeet" &&
      meetStatus !== "pending" && meetStatus !== "failure" && /^https:\/\/meet\.google\.com\/[a-z-]+$/.test(link) ? link : undefined;
    return {
      ...ref, startsAt: string(item(event.start).dateTime), organizer: options.ownerEmail,
      participants: [options.ownerEmail, ...attendees],
      meetState: meetUrl ? "ready" : meetStatus === "failure" ? "failed" : "pending", meetUrl,
      attachments: items(event.attachments).map((entry) => ({ fileId: string(entry.fileId), mimeType: string(entry.mimeType) })),
    };
  }

  async function driveFile(fileId: string, token?: string) {
    return (await google("drive", `files/${enc(fileId)}?fields=id,mimeType,name,webViewLink,iconLink,sha256Checksum,trashed,owners(emailAddress)`, {}, token))?.value;
  }
  async function permissions(fileId: string) {
    const values: Item[] = [];
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const response = await google("drive", `files/${enc(fileId)}/permissions?fields=nextPageToken,permissions(id,type,role,emailAddress,deleted,expirationTime,permissionDetails)&pageSize=100&pageToken=${enc(pageToken)}`);
      if (!response) return null;
      values.push(...items(response.value.permissions));
      pageToken = string(response.value.nextPageToken);
      if (!pageToken) return values;
    }
    throw new Error("Drive permission list incomplete");
  }

  async function recipientCanOpen(fileId: string, recipient: string, kind: "brief" | "notes") {
    const token = options.visitorProbeToken;
    if (!token) return false;
    try {
      const about = await google("drive", "about?fields=user(emailAddress)", {}, token);
      if (normalizeRecipient(string(item(about?.value.user).emailAddress)) !== recipient) return false;
      if (kind === "notes") {
        const document = await google("docs", `documents/${enc(fileId)}?fields=documentId,body(content(endIndex))`, {}, token);
        return document?.value.documentId === fileId && items(item(document.value.body).content).length > 0;
      }
      const media = await request(`https://www.googleapis.com/drive/v3/files/${enc(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-4" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      });
      const reader = media.body?.getReader();
      if (!reader) return false;
      try {
        if (!media.ok) return false;
        let prefix = "";
        while (prefix.length < 5) {
          const { value, done } = await reader.read();
          if (done) return false;
          prefix += Buffer.from(value.subarray(0, 5 - prefix.length)).toString("ascii");
        }
        return prefix === "%PDF-";
      } finally { await reader.cancel().catch(() => {}); }
    } catch { return false; }
  }

  async function readAgenda(fileId: string) {
    const response = await google("docs", `documents/${enc(fileId)}`);
    if (!response || response.value.documentId !== fileId || !string(response.value.revisionId)) return null;
    const doc = response.value;
    const ranges = items(item(item(doc.namedRanges)[agendaRange]).namedRanges);
    const spans = items(ranges[0]?.ranges);
    if (ranges.length > 1 || spans.length > 1) throw new Error("Managed agenda range is ambiguous");
    const span = spans[0];
    if (!span) return { docRevision: string(doc.revisionId), span: null, text: null };
    if (span.segmentId || span.startIndex !== 1 || typeof span.endIndex !== "number" || span.endIndex <= 1)
      throw new Error("Managed agenda range moved");
    const paragraphs = items(item(doc.body).content);
    const prefix = paragraphs.flatMap(({ paragraph }) => items(item(paragraph).elements))
      .filter((element) => typeof element.startIndex === "number" && element.startIndex < (span.endIndex as number));
    if (prefix.some((element) => !item(element.textRun).content)) throw new Error("Managed agenda range contains non-text");
    const content = prefix.map((element) => string(item(element.textRun).content)).join("").slice(0, span.endIndex - 1);
    if (content.length !== span.endIndex - 1) throw new Error("Managed agenda range is incomplete");
    return { docRevision: string(doc.revisionId), span: { startIndex: 1, endIndex: span.endIndex },
      namedRangeId: string(ranges[0].namedRangeId), text: content };
  }

  async function artifactBrief(intentId: string, ref: BriefRef) {
    const snapshot = await options.loadBrief(intentId, ref);
    if (!snapshot || snapshot.id !== ref.id || snapshot.version !== ref.version) throw new Error("Exact brief is unavailable");
    return snapshot;
  }

  async function createFile(
    op: Extract<BookingMutation, { kind: "create-file" }>, current: CurrentMeeting, operationId: string, authorized: () => Promise<boolean>,
  ) {
    const { artifact } = op;
    const name = artifact.kind === "brief" ? `Discussion brief v${artifact.brief.version}.pdf` : "Meeting agenda and notes";
    const metadata = { name, mimeType: artifact.mimeType, appProperties: { velcraftingOperation: operationId } };
    let options: RequestInit = sendJson("POST", metadata);
    let path = "files?fields=id";
    let contentsSha256: string | undefined;
    if (artifact.kind === "brief") {
      const bytes = await renderBrief(current.booking.intentId, artifact.brief);
      contentsSha256 = digest(bytes);
      const boundary = `velcrafting_${operationId.replace(/-/g, "")}`;
      const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
      options = { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: Buffer.concat([Buffer.from(prefix), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
      path = "files?uploadType=multipart&fields=id";
    }
    if (!(await authorized())) return "stale" as const;
    const response = await google(artifact.kind === "brief" ? "upload" : "drive", path, options);
    const fileId = string(response?.value.id);
    if (!fileId) throw new Error("Google file ID unavailable");
    return { fileId, contentsSha256 };
  }

  const agendaText = async (intentId: string, brief: BriefRef | null) => {
    const source = brief ? briefText(await artifactBrief(intentId, brief)) : "No brief supplied.";
    return `Prepared agenda\n${source}\n\nQuestions, decisions, owners and next steps\n\n`;
  };

  const provider: BookingArtifactProvider = {
    async observe(registered, current) {
      const file = await driveFile(registered.fileId);
      const access = file && await permissions(registered.fileId);
      if (!file || !access || file.trashed === true || file.id !== registered.fileId ||
        !items(file.owners).some((owner) => normalizeRecipient(string(owner.emailAddress)) === options.ownerEmail)) return null;
      const intended = [options.ownerEmail, current.booking.visitor];
      const granted = access.filter((entry) => entry.deleted !== true &&
        (!entry.expirationTime || Date.parse(string(entry.expirationTime)) > Date.now()));
      const privateFile = granted.every((entry) => entry.type === "user" && intended.includes(normalizeRecipient(string(entry.emailAddress))));
      const exact = registered.kind === "brief"
        ? file.mimeType === "application/pdf" && registered.contentsSha256 === file.sha256Checksum
        : file.mimeType === "application/vnd.google-apps.document" &&
          digest((await readAgenda(registered.fileId))?.text ?? "") === registered.contentsSha256;
      if (!registered.contentsSha256 || !exact) return null;
      const visitor = current.booking.visitor;
      const grantedRecipients = [options.ownerEmail, ...granted.filter((entry) => entry.type === "user").map((entry) =>
        normalizeRecipient(string(entry.emailAddress)))];
      const verifiedRecipients = [options.ownerEmail];
      if (grantedRecipients.includes(visitor) && await recipientCanOpen(registered.fileId, visitor, registered.kind)) verifiedRecipients.push(visitor);
      return { fileId: registered.fileId, contextVersion: registered.contextVersion, brief: registered.brief,
        privateFile, grantedRecipients, verifiedRecipients };
    },
    async mutate(operation, current, operationId, authorized) {
      if (operation.kind === "create-file") return createFile(operation, current, operationId, authorized);
      if (operation.kind === "refresh-notes-context") {
        const text = await agendaText(current.booking.intentId, operation.artifact.brief);
        const doc = await readAgenda(operation.fileId);
        const entry = await options.lookupArtifact(current.booking.intentId, operation.fileId);
        if (!entry || !doc || (entry.contentsSha256 ? digest(doc.text ?? "") !== entry.contentsSha256 : doc.span !== null))
          throw new Error("Managed agenda was edited or moved");
        // Named range replacement leaves human notes below it intact. Reject changes
        // in the managed range itself rather than overwriting a person's edits there.
        const requests = doc.span
          ? [{ replaceNamedRangeContent: { namedRangeId: doc.namedRangeId, text } }]
          : [{ insertText: { location: { index: 1 }, text } },
            { createNamedRange: { name: agendaRange, range: { startIndex: 1, endIndex: 1 + text.length } } }];
        if (!(await authorized())) return "stale";
        const updated = await google("docs", `documents/${enc(operation.fileId)}:batchUpdate`,
          sendJson("POST", { writeControl: { requiredRevisionId: doc.docRevision }, requests }));
        if (!updated) throw new Error("Google document update not confirmed");
        return { contentsSha256: digest(text) };
      }
      if (operation.kind === "revoke-booking-grant") {
        if (!(await authorized())) return "stale";
        await google("drive", `files/${enc(operation.fileId)}/permissions/${enc(operation.permissionId)}`, { method: "DELETE" });
        return {};
      }
      if (operation.kind === "grant-visitor") {
        const access = await permissions(operation.fileId);
        if (!access || access.some((entry) => normalizeRecipient(string(entry.emailAddress)) === operation.recipient))
          throw new Error("Existing permission requires reconciliation");
        if (!(await authorized())) return "stale";
        const permission = await google("drive", `files/${enc(operation.fileId)}/permissions?sendNotificationEmail=false&fields=id`,
          sendJson("POST", { type: "user", role: "reader", emailAddress: operation.recipient }));
        const permissionId = string(permission?.value.id);
        if (!permissionId) throw new Error("Google permission ID unavailable");
        return { permissionId };
      }
      const original = await rawEvent(operation.event);
      if (!original) {
        if (operation.kind === "remove-attachment") return {};
        throw new Error("Calendar event unavailable");
      }
      const files = items(original.value.attachments).map((attachment): EventFile => ({
        fileUrl: string(attachment.fileUrl), fileId: string(attachment.fileId),
        title: string(attachment.title) || undefined, mimeType: string(attachment.mimeType) || undefined,
        iconLink: string(attachment.iconLink) || undefined,
      }));
      if (files.some(({ fileUrl }) => !fileUrl)) throw new Error("Calendar attachments cannot be preserved");
      const filtered = files.filter(({ fileId }) => fileId !== operation.fileId);
      if (operation.kind === "remove-attachment" && files.length === filtered.length) return {};
      if (operation.kind === "attach-file") {
        const file = await driveFile(operation.fileId);
        const fileUrl = string(file?.webViewLink);
        if (file?.id !== operation.fileId || file.mimeType !== operation.artifact.mimeType ||
          !/^https:\/\/(drive|docs)\.google\.com\//.test(fileUrl)) throw new Error("Verified Drive file unavailable");
        filtered.push({ fileUrl, title: string(file.name), mimeType: string(file.mimeType), iconLink: string(file.iconLink) || undefined });
      }
      const etag = original.etag ?? string(original.value.etag);
      if (!etag) throw new Error("Calendar event version unavailable");
      if (!(await authorized())) return "stale";
      const updated = await google("calendar", `${eventPath(operation.event)}?supportsAttachments=true&sendUpdates=none`,
        sendJson("PATCH", { attachments: filtered.map(({ fileUrl, title, mimeType, iconLink }) =>
          ({ fileUrl, title, mimeType, iconLink })) }, { "If-Match": etag }));
      if (!updated) throw new Error("Calendar attachment update not confirmed");
      return {};
    },
  };

  async function reconcileMutation(intentId: string, operationId: string, operation: BookingMutation) {
    if (operation.kind === "create-file") {
      if (!/^[0-9a-f-]{36}$/.test(operationId)) return null;
      const query = new URLSearchParams({
        q: `trashed=false and appProperties has { key='velcraftingOperation' and value='${operationId}' }`,
        fields: "files(id,mimeType,sha256Checksum),nextPageToken,incompleteSearch",
      });
      const response = await google("drive", "files?" + query);
      const files = items(response?.value.files);
      if (files.length !== 1 || response?.value.nextPageToken || response?.value.incompleteSearch ||
        files[0].mimeType !== operation.artifact.mimeType || !string(files[0].id)) return null;
      if (operation.artifact.kind === "notes") return { fileId: string(files[0].id) };
      const checksum = digest(await renderBrief(intentId, operation.artifact.brief));
      return files[0].sha256Checksum === checksum ? { fileId: string(files[0].id), contentsSha256: checksum } : null;
    }
    if (operation.kind === "refresh-notes-context") {
      const text = await agendaText(intentId, operation.artifact.brief);
      return (await readAgenda(operation.fileId))?.text === text ? { contentsSha256: digest(text) } : null;
    }
    if (operation.kind === "attach-file" || operation.kind === "remove-attachment") {
      const event = await rawEvent(operation.event);
      const attached = items(event?.value.attachments).some((file) => file.fileId === operation.fileId &&
        (operation.kind === "remove-attachment" || file.mimeType === operation.artifact.mimeType));
      return attached === (operation.kind === "attach-file") ? {} : null;
    }
    if (operation.kind === "revoke-booking-grant") {
      const access = await permissions(operation.fileId);
      return access && access.every((entry) => entry.id !== operation.permissionId) ? {} : null;
    }
    // A matching permission alone cannot prove whether our timed-out request or
    // an independent owner action granted it. Keep the unresolved record for review.
    return null;
  }

  return { readEvent, provider, reconcileMutation };
}
