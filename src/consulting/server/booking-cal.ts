import { bookingCorrelationField, type BookingSettings } from "./booking-intent";
import { isBookingUid } from "./booking-webhook";
import { normalizeRecipient, type EventRef } from "./meeting-contract";
import { isUuid } from "./request-boundary";

export type AuthoritativeBooking = Readonly<{
  uid: string;
  correlation: string | null;
  state: "pending" | "confirmed" | "cancelled" | "rescheduled";
  startsAt: string;
  createdAt: string;
  updatedAt: string;
  organizer: string;
  visitor: string;
  participants: readonly string[];
  timeZone: string;
  rescheduledFrom: string | null;
  rescheduledTo: string | null;
  event: EventRef | null;
}>;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const email = (value: unknown) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value)
  ? normalizeRecipient(value) : null;
const safeProviderId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length < 254 && !/[\u0000-\u0020\u007f]/.test(value);

export function createCalBookingReader(token: string, settings: BookingSettings, transport: typeof fetch = fetch) {
  async function read(path: string) {
    const response = await transport(new URL(path, "https://api.cal.com"), {
      headers: { Authorization: `Bearer ${token}`, "cal-api-version": "2026-02-25" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Cal booking lookup unavailable");
    const { data, status } = object(await response.json());
    if (status !== "success") throw new Error("Invalid Cal booking response");
    return data;
  }

  return async function lookup(uid: string): Promise<AuthoritativeBooking | null> {
    if (!isBookingUid(uid)) return null;
    const value = object(await read(`/v2/bookings/${uid}`));
    if (value.uid !== uid || (object(value.eventType).id ?? value.eventTypeId) !== settings.eventTypeId) return null;
    const hosts = Array.isArray(value.hosts) ? value.hosts.map((host) => email(object(host).email)) : [];
    if (hosts.length !== 1 || hosts[0] !== settings.organizer) return null;
    const attendees = Array.isArray(value.attendees) ? value.attendees.map(object) : [];
    // This is a two-party event type. Additional participants block sharing.
    const visitor = email(attendees[0]?.email);
    if (!visitor || visitor === settings.organizer) return null;
    const guests = Array.isArray(value.guests) ? value.guests.map(email) : [];
    const all = [...hosts, ...attendees.map((attendee) => email(attendee.email)), ...guests];
    if (all.some((item) => !item)) return null;
    const participants = [...new Set(all as string[])].sort();
    const rescheduledFrom = isBookingUid(value.rescheduledFromUid) ? value.rescheduledFromUid : null;
    const rescheduledTo = isBookingUid(value.rescheduledToUid) ? value.rescheduledToUid : null;
    const state = rescheduledTo ? "rescheduled"
      : value.status === "cancelled" || value.status === "rejected" ? "cancelled"
        : value.status === "accepted" ? "confirmed" : value.status === "pending" ? "pending" : null;
    const startsAt = instant(value.start), createdAt = instant(value.createdAt), updatedAt = instant(value.updatedAt);
    const timeZone = attendees[0]?.timeZone;
    if (!state || !startsAt || !createdAt || !updatedAt || typeof timeZone !== "string" || timeZone.length > 80) return null;
    try { new Intl.DateTimeFormat("en", { timeZone }); } catch { return null; }

    let event: EventRef | null = null;
    if (state === "confirmed") {
      const refs = await read(`/v2/bookings/${uid}/references?type=google_calendar`);
      if (Array.isArray(refs)) {
        const matches = refs.map(object).filter((reference) => reference.type === "google_calendar" &&
          safeProviderId(reference.destinationCalendarId) && safeProviderId(reference.eventUid));
        if (matches.length === 1) event = { calendarId: matches[0].destinationCalendarId as string, uid: matches[0].eventUid as string };
      }
    }
    const correlation = object(value.bookingFieldsResponses)[bookingCorrelationField];
    return { uid, correlation: isUuid(correlation) ? correlation : null,
      state, startsAt, createdAt, updatedAt, organizer: settings.organizer, visitor, participants,
      timeZone, rescheduledFrom, rescheduledTo, event };
  };
}
