/** These inputs come from authorized storage and server-verified provider lookups, never webhook JSON. */
export type BriefRef = Readonly<{ id: string; version: number; sha256: string }>;
type Material =
  | Readonly<{ state: "shared_for_booking"; brief: BriefRef }>
  | Readonly<{ state: "no_brief_confirmed"; brief: null }>;

type StoredConfirmation = Readonly<{
  intentId: string;
  version: number;
  verifiedContactId: string;
  recipients: readonly string[];
  organizer: string;
  revoked: boolean;
  material: Material;
}>;

type CalBooking = Readonly<{
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

type CalendarEvent = Readonly<{
  calendarId: string;
  uid: string;
  startsAt: string;
  organizer: string;
  participants: readonly string[];
  meetState: "ready" | "pending" | "failed";
  attachments: readonly Readonly<{ fileId: string; mimeType: string }>[];
}>;

type Artifact =
  | Readonly<{ kind: "brief"; mimeType: "application/pdf"; brief: BriefRef }>
  | Readonly<{ kind: "notes"; mimeType: "application/vnd.google-apps.document"; brief: null }>;

type PreparationPlan = Readonly<{
  bookingUid: string;
  calendarId: string;
  eventUid: string;
  startsAt: string;
  organizer: string;
  recipients: readonly string[];
  artifacts: readonly Artifact[];
}>;

const normalized = (email: string) => email.trim().toLowerCase();
const recipientSet = (emails: readonly string[]) => [...new Set(emails.map(normalized))].sort();
function sameRecipients(a: readonly string[], b: readonly string[]) {
  const expected = recipientSet(a);
  const actual = recipientSet(b);
  return expected.length === actual.length && expected.every((email, i) => email === actual[i]);
}

export function planMeetingPreparation(
  confirmation: StoredConfirmation | null,
  contact: Readonly<{ id: string; verifiedEmail: string }> | null,
  booking: CalBooking,
  event: CalendarEvent,
): PreparationPlan | null {
  if (!confirmation || !contact || !confirmation.intentId || !contact.id || confirmation.revoked || contact.id !== confirmation.verifiedContactId ||
    !booking.uid || !booking.eventUid || !booking.calendarId || booking.state !== "confirmed" || booking.intentId !== confirmation.intentId ||
    !Number.isSafeInteger(confirmation.version) || confirmation.version < 1 || booking.confirmationVersion !== confirmation.version || event.uid !== booking.eventUid ||
    event.calendarId !== booking.calendarId || !Number.isFinite(Date.parse(booking.startsAt)) ||
    Date.parse(event.startsAt) !== Date.parse(booking.startsAt)) return null;

  const organizer = normalized(confirmation.organizer);
  const visitor = normalized(contact.verifiedEmail);
  if (!organizer || !visitor || organizer === visitor ||
    normalized(event.organizer) !== organizer || normalized(booking.organizer) !== organizer ||
    normalized(booking.visitor) !== visitor ||
    !sameRecipients(confirmation.recipients, [organizer, visitor]) ||
    !sameRecipients(event.participants, [organizer, visitor])) return null;

  const artifacts: Artifact[] = [{ kind: "notes", mimeType: "application/vnd.google-apps.document", brief: null }];
  const { material } = confirmation;
  if (material.state === "shared_for_booking") {
    const brief = material.brief;
    if (!brief.id || !Number.isSafeInteger(brief.version) || brief.version < 1 || !/^[0-9a-f]{64}$/.test(brief.sha256)) return null;
    artifacts.unshift({ kind: "brief", mimeType: "application/pdf", brief });
  } else if (material.state !== "no_brief_confirmed" || material.brief !== null) {
    return null;
  }

  return {
    bookingUid: booking.uid, calendarId: event.calendarId, eventUid: event.uid,
    startsAt: booking.startsAt, organizer, recipients: [organizer, visitor], artifacts,
  };
}

type VerifiedArtifact = Readonly<{
  bookingUid: string;
  kind: Artifact["kind"];
  brief: BriefRef | null;
  fileId: string;
  privateFile: boolean;
  // Observed access for each intended participant, not merely requested grants.
  verifiedRecipients: readonly string[];
}>;

export function meetingPreparationReady(
  plan: PreparationPlan,
  event: CalendarEvent,
  artifacts: readonly VerifiedArtifact[],
) {
  if (event.uid !== plan.eventUid || event.calendarId !== plan.calendarId || event.meetState !== "ready" ||
    normalized(event.organizer) !== plan.organizer || Date.parse(event.startsAt) !== Date.parse(plan.startsAt) ||
    !sameRecipients(event.participants, plan.recipients)) return false;
  if (!plan.artifacts.some(({ kind }) => kind === "brief") &&
    artifacts.some((artifact) => artifact.bookingUid === plan.bookingUid && artifact.kind === "brief" &&
      event.attachments.some((file) => file.fileId === artifact.fileId))) return false;
  const files = new Set<string>();
  for (const required of plan.artifacts) {
    const evidence = artifacts.filter((artifact) => artifact.bookingUid === plan.bookingUid && artifact.kind === required.kind);
    if (evidence.length !== 1) return false;
    const [{ brief, fileId, privateFile, verifiedRecipients }] = evidence;
    if (!fileId || !privateFile || files.has(fileId) || !sameRecipients(verifiedRecipients, plan.recipients) ||
      !event.attachments.some((file) => file.fileId === fileId && file.mimeType === required.mimeType)) return false;
    if (required.brief
      ? brief?.id !== required.brief.id || brief.version !== required.brief.version || brief.sha256 !== required.brief.sha256
      : brief !== null) return false;
    files.add(fileId);
  }
  return true;
}
