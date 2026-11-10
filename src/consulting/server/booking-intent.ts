import type { Sql, TransactionSql } from "postgres";
import { isUuid } from "./request-boundary";
import { normalizeRecipient, sameBrief, type Material } from "./meeting-contract";

export type ConfirmationInput = {
  idempotencyKey: string;
  intentId?: string;
  expectedVersion?: number;
  material: Material;
};

export function parseConfirmation(input: unknown): ConfirmationInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<ConfirmationInput>;
  if (!isUuid(value.idempotencyKey) || !value.material ||
    (value.intentId === undefined ? value.expectedVersion !== undefined
      : !isUuid(value.intentId) || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion! < 1)) return null;
  const { material } = value;
  if (material.state === "shared_for_booking") {
    if (!material.brief || !isUuid(material.brief.id) || !Number.isSafeInteger(material.brief.version) ||
      material.brief.version < 1 || typeof material.brief.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(material.brief.sha256)) return null;
    return { idempotencyKey: value.idempotencyKey, intentId: value.intentId, expectedVersion: value.expectedVersion,
      material: { state: material.state, brief: { id: material.brief.id, version: material.brief.version, sha256: material.brief.sha256 } } };
  }
  if (material.state !== "no_brief_confirmed" || material.brief !== null) return null;
  return { idempotencyKey: value.idempotencyKey, intentId: value.intentId, expectedVersion: value.expectedVersion,
    material: { state: material.state, brief: null } };
}

export const bookingCorrelationField = "velcraftingIntent";
export type BookingSettings = { organizer: string; eventTypeId: number };
export function bookingSettings(env = process.env): BookingSettings | null {
  if (env.VELCRAFTING_BOOKING_ENABLED !== "1") return null;
  const organizer = normalizeRecipient(env.VELCRAFTING_BOOKING_OWNER_EMAIL ?? "");
  const eventTypeId = Number(env.VELCRAFTING_CAL_EVENT_TYPE_ID);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizer) && organizer.length <= 254 &&
    Number.isSafeInteger(eventTypeId) && eventTypeId > 0 && eventTypeId <= 2147483647
    ? { organizer, eventTypeId } : null;
}

type Actor = { sessionId: string; userId: string; email: string };
type ContactRow = { id: string; verified_email: string };
type ConfirmationRow = {
  intent_id: string; version: number; contact_id: string; correlation_id: string; material: Material["state"];
  brief_id: string | null; brief_version: number | null; brief_sha256: string | null;
};
type IntentRow = { id: string; confirmation_version: number | null; organizer: string; event_type_id: number };

async function lockSessionContact(tx: TransactionSql, actor: Actor) {
  // Serialize idempotent attempts, amendments and revocations of this explorer session.
  const [session] = await tx`select id from velcrafting_private.explorer_session
    where id=${actor.sessionId} and expires_at > clock_timestamp() and invalidated_at is null for update`;
  if (!session) return null;
  const [contact] = await tx<ContactRow[]>`select id,verified_email from velcrafting_private.prospect_contact
    where session_id=${actor.sessionId} and user_id=${actor.userId} and revoked_at is null
    and verified_email=${normalizeRecipient(actor.email)}`;
  return contact ?? null;
}

export async function recordBookingConfirmation(sql: Sql, actor: Actor, settings: BookingSettings, input: ConfirmationInput) {
  return sql.begin(async (tx) => {
    const contact = await lockSessionContact(tx, actor);
    if (!contact || contact.verified_email === settings.organizer) return { status: "denied" } as const;
    const [duplicate] = await tx<(ConfirmationRow & { current_version: number; active: boolean })[]>`
      select c.*,i.confirmation_version as current_version,
        (i.revoked_at is null and i.expires_at > clock_timestamp()) as active
      from velcrafting_private.booking_confirmation c join velcrafting_private.booking_intent i on i.id=c.intent_id
      where c.session_id=${actor.sessionId} and c.idempotency_key=${input.idempotencyKey}`;
    const brief = input.material.brief;
    if (duplicate) {
      const saved = duplicate.brief_id
        ? { id: duplicate.brief_id, version: duplicate.brief_version!, sha256: duplicate.brief_sha256! } : null;
      if (duplicate.contact_id !== contact.id || duplicate.material !== input.material.state || !sameBrief(brief, saved) ||
        (input.intentId ? duplicate.intent_id !== input.intentId || duplicate.version !== input.expectedVersion! + 1 : duplicate.version !== 1)) {
        return { status: "conflict" } as const;
      }
      if (duplicate.current_version !== duplicate.version || !duplicate.active) return { status: "conflict" } as const;
      return { status: "confirmed", intentId: duplicate.intent_id, confirmationVersion: duplicate.version,
        correlationId: duplicate.correlation_id } as const;
    }

    if (brief) {
      const [owned] = await tx`select brief_id from velcrafting_private.brief_revision where session_id=${actor.sessionId}
        and brief_id=${brief.id} and version=${brief.version} and sha256=${brief.sha256}`;
      if (!owned) return { status: "denied" } as const;
    }
    const [intent] = input.intentId
      ? await tx<IntentRow[]>`select id,confirmation_version,organizer,event_type_id from velcrafting_private.booking_intent
          where id=${input.intentId} and session_id=${actor.sessionId} and revoked_at is null
          and expires_at > clock_timestamp() for update`
      : await tx<IntentRow[]>`insert into velcrafting_private.booking_intent (session_id,event_type_id,organizer,expires_at)
          values (${actor.sessionId},${settings.eventTypeId},${settings.organizer},clock_timestamp()+interval '24 hours')
          returning id,confirmation_version,organizer,event_type_id`;
    if (!intent || intent.organizer !== settings.organizer || intent.event_type_id !== settings.eventTypeId ||
      (intent.confirmation_version ?? undefined) !== input.expectedVersion) return { status: "conflict" } as const;
    const version = (intent.confirmation_version ?? 0) + 1;
    const [record] = await tx<{ correlation_id: string }[]>`
      insert into velcrafting_private.booking_confirmation
        (intent_id,version,session_id,contact_id,visitor_email,organizer,idempotency_key,material,brief_id,brief_version,brief_sha256)
      values (${intent.id},${version},${actor.sessionId},${contact.id},${contact.verified_email},${settings.organizer},
        ${input.idempotencyKey},${input.material.state},${brief?.id ?? null},${brief?.version ?? null},${brief?.sha256 ?? null})
      returning correlation_id`;
    await tx`update velcrafting_private.booking_intent set confirmation_version=${version} where id=${intent.id}`;
    await invalidatePreparation(tx, intent.id);
    return { status: "confirmed", intentId: intent.id, confirmationVersion: version, correlationId: record.correlation_id } as const;
  });
}

export async function revokeBookingConfirmation(sql: Sql, actor: Actor, intentId: string, expectedVersion: number) {
  return sql.begin(async (tx) => {
    const contact = await lockSessionContact(tx, actor);
    if (!contact) return false;
    const [revoked] = await tx`update velcrafting_private.booking_intent i set revoked_at=coalesce(revoked_at,now())
      from velcrafting_private.booking_confirmation c where i.id=${intentId} and i.session_id=${actor.sessionId}
      and i.confirmation_version=${expectedVersion} and c.intent_id=i.id and c.version=i.confirmation_version
      and c.contact_id=${contact.id} returning i.id`;
    if (!revoked) return false;
    await invalidatePreparation(tx, intentId);
    return true;
  });
}

async function invalidatePreparation(tx: TransactionSql, intentId: string) {
  await tx`update velcrafting_private.booking set preparation_state='pending',meet_url=null where intent_id=${intentId}`;
  await tx`insert into velcrafting_private.booking_job (booking_uid)
    select uid from velcrafting_private.booking where intent_id=${intentId}
    on conflict (booking_uid) do update set generation=booking_job.generation+1,available_at=now(),state='queued'`;
}

export async function readBookingStatus(sql: Sql, actor: Actor, intentId: string) {
  const [status] = await sql`
    select i.id as "intentId",i.confirmation_version as "confirmationVersion",i.revoked_at is not null as revoked,
      (b.uid is null and i.expires_at <= clock_timestamp()) as expired,
      c.material,c.brief_version as "briefVersion",
      b.state as "bookingState",b.preparation_state as "preparationState",b.starts_at as "startsAt",b.time_zone as "timeZone",
      case when b.preparation_state='ready' and i.revoked_at is null and b.confirmation_version=i.confirmation_version
        then b.meet_url end as "meetUrl"
    from velcrafting_private.booking_intent i
    join velcrafting_private.booking_confirmation c on c.intent_id=i.id and c.version=i.confirmation_version
    join velcrafting_private.prospect_contact p on p.session_id=i.session_id and p.id=c.contact_id
    join velcrafting_private.explorer_session s on s.id=i.session_id
    left join lateral (select * from velcrafting_private.booking where intent_id=i.id
      order by (state in ('confirmed','pending')) desc,observed_at desc limit 1) b on true
    where i.id=${intentId} and i.session_id=${actor.sessionId} and p.user_id=${actor.userId}
      and p.verified_email=${normalizeRecipient(actor.email)} and p.revoked_at is null
      and s.invalidated_at is null and s.expires_at > clock_timestamp()`;
  return status ?? null;
}
