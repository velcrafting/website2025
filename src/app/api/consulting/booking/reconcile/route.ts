import { timingSafeEqual, createHash } from "node:crypto";
import { bookingSettings } from "@/consulting/server/booking-intent";
import { createCalBookingReader } from "@/consulting/server/booking-cal";
import { prepareObservedBooking } from "@/consulting/server/booking-prepare";
import { queueBookingReconciliation, reconcileOneBooking } from "@/consulting/server/booking-reconcile";
import { consultingSql } from "@/consulting/server/database";
import { json } from "@/consulting/server/request-boundary";

export const runtime = "nodejs";
export const maxDuration = 60;
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function POST(request: Request) {
  const settings = bookingSettings();
  const workerToken = process.env.VELCRAFTING_BOOKING_WORKER_TOKEN;
  const calToken = process.env.VELCRAFTING_CAL_TOKEN;
  if (!settings || process.env.VELCRAFTING_BOOKING_RECONCILE_ENABLED !== "1" || !workerToken || !calToken)
    return json({ error: "Unavailable" }, 503);
  const supplied = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${workerToken}`))) return json({ error: "Unavailable" }, 403);

  try {
    const sql = await consultingSql();
    await queueBookingReconciliation(sql);
    const lookup = createCalBookingReader(calToken, settings);
    const result = await reconcileOneBooking(sql, settings.eventTypeId, lookup);
    const preparation = result.state === "observed" && result.intentId
      ? await prepareObservedBooking(sql, result.intentId, settings.organizer, lookup) : undefined;
    return json({ state: result.state, preparation }, 202);
  } catch {
    return json({ error: "Reconciliation unavailable" }, 503);
  }
}
