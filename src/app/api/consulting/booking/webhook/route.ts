import { bookingSettings } from "@/consulting/server/booking-intent";
import { recordBookingReceipt, verifyBookingWebhook } from "@/consulting/server/booking-webhook";
import { consultingSql } from "@/consulting/server/database";
import { json } from "@/consulting/server/request-boundary";

export const runtime = "nodejs";

async function readRawBody(request: Request) {
  const stream = request.body?.getReader();
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await stream.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > 65536) {
        await stream.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally { stream.releaseLock(); }
}

export async function POST(request: Request) {
  const settings = bookingSettings();
  const secret = process.env.VELCRAFTING_CAL_WEBHOOK_SECRET;
  if (!settings || !secret) return json({ error: "Unavailable" }, 503);
  const raw = await readRawBody(request).catch(() => null);
  if (!raw) return json({ error: "Invalid receipt" }, 400);
  const receipt = verifyBookingWebhook(raw, request.headers.get("x-cal-signature-256"), secret, settings.eventTypeId);
  if (!receipt) return json({ error: "Invalid receipt" }, 401);
  if (receipt === "ignored") return json({ accepted: true }, 202);
  try {
    await recordBookingReceipt(await consultingSql(), receipt);
    return json({ accepted: true }, 202);
  } catch {
    return json({ error: "Receipt unavailable" }, 503);
  }
}
