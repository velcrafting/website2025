import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "postgres";

const relevant = new Set([
  "BOOKING_CREATED", "BOOKING_REQUESTED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED",
  "BOOKING_REJECTED", "BOOKING_LOCATION_UPDATED", "BOOKING_REASSIGNED", "BOOKING_GUESTS_UPDATED",
]);
export const isBookingUid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export type BookingReceipt = {
  digest: string;
  bookingUid: string;
  eventTypeId: number;
  trigger: string;
  occurredAt: string;
};

export function verifyBookingWebhook(
  raw: Uint8Array, signature: string | null, secret: string, expectedEventType: number,
): BookingReceipt | "ignored" | null {
  if (raw.byteLength > 65536 || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;

  try {
    const { triggerEvent, createdAt, payload } = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (typeof triggerEvent !== "string" || !relevant.has(triggerEvent)) return "ignored";
    if (!payload || payload.eventTypeId !== expectedEventType) return "ignored";
    if (!isBookingUid(payload.uid) || typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) return null;
    return {
      digest: createHash("sha256").update(raw).digest("hex"), bookingUid: payload.uid,
      eventTypeId: expectedEventType, trigger: triggerEvent, occurredAt: new Date(createdAt).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function recordBookingReceipt(sql: Sql, receipt: BookingReceipt) {
  return sql.begin(async (tx) => {
    const inserted = await tx`
      insert into velcrafting_private.booking_event (digest,booking_uid,event_type_id,trigger,occurred_at)
      values (${receipt.digest},${receipt.bookingUid},${receipt.eventTypeId},${receipt.trigger},${receipt.occurredAt})
      on conflict (digest) do nothing returning digest`;
    if (inserted.length === 0) return false;
    await tx`
      insert into velcrafting_private.booking_job (booking_uid) values (${receipt.bookingUid})
      on conflict (booking_uid) do update set generation = booking_job.generation + 1,
        available_at = now(), state = 'queued'`;
    return true;
  });
}
