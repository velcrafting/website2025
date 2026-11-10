import { SITE } from "@/config/site";
import { verifiedIdentity } from "@/consulting/server/auth";
import {
  bookingCorrelationField, bookingSettings, parseConfirmation, readBookingStatus, recordBookingConfirmation, revokeBookingConfirmation,
} from "@/consulting/server/booking-intent";
import { consultingSql } from "@/consulting/server/database";
import { getExplorerSession } from "@/consulting/server/explorer-session";
import { boundedJson, isPublicMutation, isUuid, json } from "@/consulting/server/request-boundary";

export const runtime = "nodejs";

async function bookingActor(request: Request) {
  const session = await getExplorerSession(request);
  if (!session) return null;
  const identity = await verifiedIdentity("prospect");
  return identity ? { sessionId: session.id, userId: identity.id, email: identity.email } : null;
}

const unavailable = () => json({ error: "Integrated scheduling is unavailable" }, 503);

export async function POST(request: Request) {
  if (!isPublicMutation(request)) return json({ error: "Unavailable" }, 403);
  const settings = bookingSettings();
  if (!settings) return unavailable();
  const input = await boundedJson(request, 4096).then(parseConfirmation, () => null);
  if (!input) return json({ error: "Invalid sharing choice" }, 400);
  try {
    const actor = await bookingActor(request);
    if (!actor) return json({ error: "Verify your email to continue" }, 401);
    const result = await recordBookingConfirmation(await consultingSql(), actor, settings, input);
    if (result.status === "denied") return json({ error: "Sharing choice unavailable" }, 404);
    if (result.status === "conflict") return json({ error: "Sharing choice changed. Review it again." }, 409);
    const schedulingUrl = new URL(SITE.bookingUrl);
    schedulingUrl.searchParams.set(bookingCorrelationField, result.correlationId);
    return json({
      intentId: result.intentId, confirmationVersion: result.confirmationVersion, schedulingUrl: schedulingUrl.toString(),
    }, 201);
  } catch { return unavailable(); }
}

export async function GET(request: Request) {
  const settings = bookingSettings();
  if (!settings) return unavailable();
  const id = new URL(request.url).searchParams.get("intentId");
  if (id !== null && !isUuid(id)) return json({ error: "Booking unavailable" }, 404);
  try {
    const actor = await bookingActor(request);
    if (!actor) return json({ error: "Booking unavailable" }, 404);
    const sql = await consultingSql();
    if (id === null) {
      const [contact] = await sql<{ id: string }[]>`select id from velcrafting_private.prospect_contact
        where session_id=${actor.sessionId} and user_id=${actor.userId}
          and verified_email=${actor.email} and revoked_at is null`;
      return contact ? json({ organizer: settings.organizer }) : json({ error: "Booking unavailable" }, 404);
    }
    const booking = await readBookingStatus(sql, actor, id);
    return booking ? json(booking) : json({ error: "Booking unavailable" }, 404);
  } catch { return unavailable(); }
}

export async function DELETE(request: Request) {
  if (!isPublicMutation(request)) return json({ error: "Unavailable" }, 403);
  if (!bookingSettings()) return unavailable();
  const input = await boundedJson(request, 1024).catch(() => null) as
    { intentId?: unknown; expectedVersion?: unknown } | null;
  if (!input || !isUuid(input.intentId) || typeof input.expectedVersion !== "number" ||
    !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) return json({ error: "Invalid sharing choice" }, 400);
  try {
    const actor = await bookingActor(request);
    const revoked = actor && await revokeBookingConfirmation(await consultingSql(), actor, input.intentId, input.expectedVersion);
    return revoked ? json({ revoked: true }) : json({ error: "Booking unavailable" }, 404);
  } catch { return unavailable(); }
}
