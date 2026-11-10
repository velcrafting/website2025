/** Inputs come from current authorized storage and server-verified provider lookups. */
export type BriefRef = Readonly<{ id: string; version: number; sha256: string }>;
export type Material =
  | Readonly<{ state: "shared_for_booking"; brief: BriefRef }>
  | Readonly<{ state: "no_brief_confirmed"; brief: null }>;

export type StoredConfirmation = Readonly<{
  intentId: string;
  version: number;
  verifiedContactId: string;
  recipients: readonly string[];
  organizer: string;
  revoked: boolean;
  material: Material;
}>;

export type CalBooking = Readonly<{
  intentId: string;
  confirmationVersion: number;
  state: "confirmed" | "cancelled" | "pending";
  uid: string;
  calendarId: string;
  eventUid: string;
  startsAt: string;
  organizer: string;
  visitor: string;
}>;

export type EventRef = Readonly<{ calendarId: string; uid: string }>;
export type CalendarEvent = EventRef & Readonly<{
  startsAt: string;
  organizer: string;
  participants: readonly string[];
  meetState: "ready" | "pending" | "failed";
  meetUrl?: string;
  attachments: readonly Readonly<{ fileId: string; mimeType: string }>[];
}>;

export type Artifact =
  | Readonly<{ kind: "brief"; mimeType: "application/pdf"; brief: BriefRef }>
  | Readonly<{ kind: "notes"; mimeType: "application/vnd.google-apps.document"; brief: BriefRef | null }>;

export type PreparationPlan = Readonly<{
  intentId: string;
  confirmationVersion: number;
  verifiedContactId: string;
  bookingUid: string;
  calendarId: string;
  eventUid: string;
  startsAt: string;
  organizer: string;
  recipients: readonly string[];
  artifacts: readonly Artifact[];
}>;

export type VerifiedContact = Readonly<{ id: string; verifiedEmail: string }>;
export type CurrentMeeting = Readonly<{
  confirmation: StoredConfirmation | null;
  contact: VerifiedContact | null;
  booking: CalBooking;
  event: CalendarEvent;
  bindingValid?: boolean;
}>;

export const normalizeRecipient = (email: string) => email.trim().toLowerCase();
const recipientSet = (emails: readonly string[]) => [...new Set(emails.map(normalizeRecipient))].sort();
export function sameRecipients(a: readonly string[], b: readonly string[]) {
  const expected = recipientSet(a);
  const actual = recipientSet(b);
  return expected.length === actual.length && expected.every((email, i) => email === actual[i]);
}

export function sameBrief(a: BriefRef | null, b: BriefRef | null) {
  return a === null || b === null ? a === b
    : a.id === b.id && a.version === b.version && a.sha256 === b.sha256;
}

export function planMeetingPreparation(
  confirmation: StoredConfirmation | null,
  contact: VerifiedContact | null,
  booking: CalBooking,
  event: CalendarEvent,
): PreparationPlan | null {
  if (!confirmation || !contact || !confirmation.intentId || !contact.id || confirmation.revoked || contact.id !== confirmation.verifiedContactId ||
    !booking.uid || !booking.eventUid || !booking.calendarId || booking.state !== "confirmed" || booking.intentId !== confirmation.intentId ||
    !Number.isSafeInteger(confirmation.version) || confirmation.version < 1 || booking.confirmationVersion !== confirmation.version || event.uid !== booking.eventUid ||
    event.calendarId !== booking.calendarId || !Number.isFinite(Date.parse(booking.startsAt)) ||
    Date.parse(event.startsAt) !== Date.parse(booking.startsAt)) return null;

  const organizer = normalizeRecipient(confirmation.organizer);
  const visitor = normalizeRecipient(contact.verifiedEmail);
  if (!organizer || !visitor || organizer === visitor ||
    normalizeRecipient(event.organizer) !== organizer || normalizeRecipient(booking.organizer) !== organizer ||
    normalizeRecipient(booking.visitor) !== visitor ||
    !sameRecipients(confirmation.recipients, [organizer, visitor]) ||
    !sameRecipients(event.participants, [organizer, visitor])) return null;

  const { material } = confirmation;
  let brief: BriefRef | null = null;
  if (material.state === "shared_for_booking") {
    if (!material.brief.id || !Number.isSafeInteger(material.brief.version) ||
      material.brief.version < 1 || !/^[0-9a-f]{64}$/.test(material.brief.sha256)) return null;
    brief = { ...material.brief };
  } else if (material.state !== "no_brief_confirmed" || material.brief !== null) {
    return null;
  }

  const artifacts: Artifact[] = [{ kind: "notes", mimeType: "application/vnd.google-apps.document", brief }];
  if (brief) artifacts.unshift({ kind: "brief", mimeType: "application/pdf", brief });

  return {
    intentId: confirmation.intentId, confirmationVersion: confirmation.version, verifiedContactId: contact.id,
    bookingUid: booking.uid, calendarId: event.calendarId, eventUid: event.uid,
    startsAt: booking.startsAt, organizer, recipients: [organizer, visitor], artifacts,
  };
}

export function currentMeetingPlan(plan: PreparationPlan, current: CurrentMeeting) {
  if (current.bindingValid === false) return null;
  const live = planMeetingPreparation(current.confirmation, current.contact, current.booking, current.event);
  return live && live.intentId === plan.intentId && live.confirmationVersion === plan.confirmationVersion &&
    live.verifiedContactId === plan.verifiedContactId && live.bookingUid === plan.bookingUid &&
    live.calendarId === plan.calendarId && live.eventUid === plan.eventUid &&
    Date.parse(live.startsAt) === Date.parse(plan.startsAt) && live.organizer === plan.organizer &&
    sameRecipients(live.recipients, plan.recipients) && live.artifacts.length === plan.artifacts.length &&
    live.artifacts.every((artifact, i) => artifact.kind === plan.artifacts[i].kind &&
      artifact.mimeType === plan.artifacts[i].mimeType && sameBrief(artifact.brief, plan.artifacts[i].brief))
    ? live : null;
}

export type ManagedArtifact = Readonly<{
  kind: Artifact["kind"];
  fileId: string;
  brief: BriefRef | null;
  contextVersion: number;
  contentsSha256?: string;
  attachments: readonly EventRef[];
  bookingGrants: readonly Readonly<{ permissionId: string; recipient: string }>[];
}>;

export type ManagedRegistry = Readonly<{
  intentId: string;
  // Null is required while a prior provider mutation has no confirmed outcome.
  revision: number | null;
  artifacts: readonly ManagedArtifact[];
}>;

export type VerifiedArtifact = Readonly<{
  fileId: string;
  contextVersion: number;
  brief: BriefRef | null;
  privateFile: boolean;
  grantedRecipients?: readonly string[];
  verifiedRecipients: readonly string[];
}>;

export function currentArtifact(plan: PreparationPlan, artifact: ManagedArtifact) {
  const target = plan.artifacts.find(({ kind }) => kind === artifact.kind);
  return !!target && artifact.contextVersion === plan.confirmationVersion && sameBrief(artifact.brief, target.brief);
}

export function meetingPreparationReady(
  expected: PreparationPlan,
  current: CurrentMeeting,
  registry: ManagedRegistry,
  observed: readonly VerifiedArtifact[],
) {
  const plan = currentMeetingPlan(expected, current);
  if (!plan || registry.intentId !== plan.intentId || registry.revision === null || current.event.meetState !== "ready") return false;

  for (const entry of registry.artifacts) {
    if (entry.attachments.some(({ uid, calendarId }) => uid !== plan.eventUid || calendarId !== plan.calendarId)) return false;
    if (!currentArtifact(plan, entry) &&
      (entry.attachments.length > 0 || entry.bookingGrants.length > 0 ||
        current.event.attachments.some(({ fileId }) => fileId === entry.fileId))) return false;
    if (entry.bookingGrants.some(({ recipient }) => !plan.recipients.includes(normalizeRecipient(recipient)))) return false;
  }

  const files = new Set<string>();
  for (const required of plan.artifacts) {
    const entries = registry.artifacts.filter((entry) => entry.kind === required.kind && currentArtifact(plan, entry));
    if (entries.length !== 1) return false;
    const [{ fileId, attachments }] = entries;
    const evidence = observed.filter((artifact) => artifact.fileId === fileId);
    if (!fileId || files.has(fileId) || evidence.length !== 1 ||
      !attachments.some(({ uid, calendarId }) => uid === plan.eventUid && calendarId === plan.calendarId) ||
      !current.event.attachments.some((file) => file.fileId === fileId && file.mimeType === required.mimeType)) return false;
    const [file] = evidence;
    if (!file.privateFile || !sameRecipients(file.verifiedRecipients, plan.recipients) ||
      file.contextVersion !== plan.confirmationVersion || !sameBrief(file.brief, required.brief)) return false;
    files.add(fileId);
  }
  return true;
}
