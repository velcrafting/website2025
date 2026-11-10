import type { Sql } from "postgres";
import type { AuthoritativeBooking } from "./booking-cal";
import { createGoogleMeetingAdapter } from "./booking-google";
import { scheduleBookingPreparationCheck } from "./booking-reconcile";
import { bookingArtifact, bookingBrief, postgresBookingStore, reconcileBookingMutation } from "./booking-store";
import { runBookingStep } from "./booking-worker";
import { planMeetingPreparation } from "./meeting-contract";

export async function prepareObservedBooking(
  sql: Sql, intentId: string, organizer: string, lookup: (uid: string) => Promise<AuthoritativeBooking | null>,
) {
  if (process.env.VELCRAFTING_BOOKING_PREPARATION_ENABLED !== "1") return "disabled";
  const ownerToken = process.env.VELCRAFTING_GOOGLE_OWNER_ACCESS_TOKEN;
  const calendarId = process.env.VELCRAFTING_GOOGLE_CALENDAR_ID;
  if (!ownerToken || !calendarId) return "disabled";
  const google = createGoogleMeetingAdapter({
    ownerEmail: organizer, ownerToken, calendarId,
    visitorProbeToken: process.env.VELCRAFTING_GOOGLE_VISITOR_PROBE_TOKEN,
    loadBrief: (id, brief) => bookingBrief(sql, id, brief),
    lookupArtifact: (id, fileId) => bookingArtifact(sql, id, fileId),
  });
  const store = postgresBookingStore(sql, lookup, google.readEvent);
  try {
    await reconcileBookingMutation(sql, intentId, google.reconcileMutation);
    const state = await store.read(intentId);
    if (!state) return "waiting";
    const { current } = state;
    const plan = current.bindingValid === false
      ? null : planMeetingPreparation(current.confirmation, current.contact, current.booking, current.event);
    const result = await runBookingStep(intentId, plan, store, google.provider);
    if (result === "pending" || result === "reconcile") await scheduleBookingPreparationCheck(sql, intentId, result === "reconcile");
    return result;
  } catch {
    await scheduleBookingPreparationCheck(sql, intentId, true);
    return "reconcile";
  }
}
