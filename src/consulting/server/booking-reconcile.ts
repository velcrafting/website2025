import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import type { AuthoritativeBooking } from "./booking-cal";
import { sameRecipients } from "./meeting-contract";

type Job = { booking_uid: string; generation: number; claim_id: string };
type Binding = { intent_id: string; confirmation_version: number; state: string; provider_updated_at: Date };
type Intent = { id: string; confirmation_version: number; revoked_at: Date | null };
type Share = { version: number; visitor_email: string; organizer: string; contact_active: boolean };

async function claim(sql: Sql) {
  const claimId = randomUUID();
  const [job] = await sql<Job[]>`
    with next as (
      select booking_uid from velcrafting_private.booking_job
      where state in ('queued','reconcile') and available_at <= clock_timestamp()
        and (claimed_until is null or claimed_until <= clock_timestamp())
      order by available_at,booking_uid limit 1 for update skip locked
    )
    update velcrafting_private.booking_job j set claim_id=${claimId},
      claimed_until=clock_timestamp()+interval '2 minutes'
    from next where j.booking_uid=next.booking_uid
    returning j.booking_uid,j.generation,j.claim_id`;
  return job ?? null;
}

/** Existing bookings are scanned periodically so a missed webhook cannot pin stale state. */
export async function queueBookingReconciliation(sql: Sql, limit = 25) {
  return (await sql`
    insert into velcrafting_private.booking_job(booking_uid)
    select uid from velcrafting_private.booking
    where state in ('confirmed','pending') and observed_at < clock_timestamp()-interval '10 minutes'
    order by observed_at,uid limit ${Math.max(1, Math.min(limit, 100))}
    on conflict (booking_uid) do update set generation=booking_job.generation+1,available_at=now(),state='queued'
    where booking_job.state='complete' returning booking_uid`).length;
}

async function bindObservation(tx: TransactionSql, booking: AuthoritativeBooking, eventType: number) {
  const [existing] = await tx<Binding[]>`select intent_id,confirmation_version,state,provider_updated_at
    from velcrafting_private.booking where uid=${booking.uid}`;
  const [prior] = !existing && booking.rescheduledFrom
    ? await tx<Binding[]>`select intent_id,confirmation_version,state,provider_updated_at from velcrafting_private.booking
        where uid=${booking.rescheduledFrom}` : [];
  const [original] = !existing && !prior && booking.correlation
    ? await tx<{ intent_id: string; version: number }[]>`
        select c.intent_id,c.version from velcrafting_private.booking_confirmation c
        join velcrafting_private.booking_intent i on i.id=c.intent_id
        where c.correlation_id=${booking.correlation} and i.event_type_id=${eventType}
          and i.organizer=${booking.organizer} and c.visitor_email=${booking.visitor}
          and ${booking.createdAt}::timestamptz between c.confirmed_at and i.expires_at` : [];
  const intentId = existing?.intent_id ?? prior?.intent_id ?? original?.intent_id;
  if (!intentId) return null;
  const [intent] = await tx<Intent[]>`select id,confirmation_version,revoked_at
    from velcrafting_private.booking_intent where id=${intentId} and event_type_id=${eventType} for update`;
  if (!intent) return null;
  const [known] = await tx<Binding[]>`select intent_id,confirmation_version,state,provider_updated_at
    from velcrafting_private.booking where uid=${booking.uid}`;
  if (known && known.intent_id !== intent.id) return null;
  if (known && (Date.parse(booking.updatedAt) < new Date(known.provider_updated_at).getTime() ||
    (["cancelled", "rescheduled"].includes(known.state) && ["confirmed", "pending"].includes(booking.state)))) return intent.id;

  const [share] = await tx<Share[]>`
    select c.version,c.visitor_email,c.organizer,
      (p.revoked_at is null and p.verified_email=c.visitor_email) as contact_active
    from velcrafting_private.booking_confirmation c join velcrafting_private.prospect_contact p on p.id=c.contact_id
    where c.intent_id=${intent.id} and c.version=${intent.confirmation_version}`;
  const originalVersion = known?.confirmation_version ?? prior?.confirmation_version ?? original?.version;
  if (!originalVersion || !share) return null;
  const mayUseCurrent = (known || prior || original?.version === share.version) && intent.revoked_at === null && share.contact_active &&
    sameRecipients(booking.participants, [share.organizer, share.visitor_email]);
  const confirmationVersion = mayUseCurrent ? share.version : originalVersion;

  if (booking.rescheduledFrom) await tx`update velcrafting_private.booking set state='rescheduled',preparation_state='pending',meet_url=null
    where uid=${booking.rescheduledFrom} and intent_id=${intent.id} and state in ('confirmed','pending')`;
  const [different] = await tx`select uid from velcrafting_private.booking where intent_id=${intent.id}
    and uid<>${booking.uid} and state in ('confirmed','pending')`;
  if (different && (booking.state === "confirmed" || booking.state === "pending")) return null;

  await tx`insert into velcrafting_private.booking
    (uid,intent_id,confirmation_version,state,starts_at,time_zone,organizer,visitor_email,participants,calendar_id,event_uid,
      rescheduled_from_uid,provider_updated_at)
    values (${booking.uid},${intent.id},${confirmationVersion},${booking.state},${booking.startsAt},${booking.timeZone},${booking.organizer},
      ${booking.visitor},${tx.json([...booking.participants])},${booking.event?.calendarId ?? null},${booking.event?.uid ?? null},
      ${booking.rescheduledFrom},${booking.updatedAt})
    on conflict (uid) do update set confirmation_version=excluded.confirmation_version,state=excluded.state,starts_at=excluded.starts_at,
      time_zone=excluded.time_zone,organizer=excluded.organizer,visitor_email=excluded.visitor_email,participants=excluded.participants,
      calendar_id=coalesce(excluded.calendar_id,booking.calendar_id),event_uid=coalesce(excluded.event_uid,booking.event_uid),
      rescheduled_from_uid=coalesce(excluded.rescheduled_from_uid,booking.rescheduled_from_uid),provider_updated_at=excluded.provider_updated_at,
      observed_at=clock_timestamp(),preparation_state=case when
        (booking.confirmation_version,booking.state,booking.starts_at,booking.participants,booking.calendar_id,booking.event_uid)
        is not distinct from
        (excluded.confirmation_version,excluded.state,excluded.starts_at,excluded.participants,excluded.calendar_id,excluded.event_uid)
        then booking.preparation_state else 'pending' end,
      meet_url=case when
        (booking.confirmation_version,booking.state,booking.starts_at,booking.participants,booking.calendar_id,booking.event_uid)
        is not distinct from
        (excluded.confirmation_version,excluded.state,excluded.starts_at,excluded.participants,excluded.calendar_id,excluded.event_uid)
        then booking.meet_url else null end`;

  if (booking.rescheduledTo) await tx`insert into velcrafting_private.booking_job(booking_uid) values (${booking.rescheduledTo})
    on conflict (booking_uid) do nothing`;
  return intent.id;
}

export async function reconcileOneBooking(
  sql: Sql, eventType: number, lookup: (uid: string) => Promise<AuthoritativeBooking | null>,
) {
  const job = await claim(sql);
  if (!job) return { state: "empty" } as const;
  let booking: AuthoritativeBooking | null = null;
  try { booking = await lookup(job.booking_uid); } catch { /* The durable queue retries read-only lookups. */ }
  const superseded = new Error("Booking claim superseded");
  try {
    return await sql.begin(async (tx) => {
      const [live] = await tx<Job[]>`select booking_uid,generation,claim_id from velcrafting_private.booking_job
        where booking_uid=${job.booking_uid}`;
      if (live?.claim_id !== job.claim_id || live.generation !== job.generation) throw superseded;
      let intentId: string | null = null;
      if (booking?.uid === job.booking_uid) intentId = await bindObservation(tx, booking, eventType);
      // Claim CAS follows the intent lock. A superseding webhook rolls the entire observation back.
      const [done] = await tx`update velcrafting_private.booking_job set claim_id=null,claimed_until=null,
        state=${booking ? "complete" : "reconcile"},
        available_at=clock_timestamp()+${booking ? 0 : 300} * interval '1 second'
        where booking_uid=${job.booking_uid} and claim_id=${job.claim_id} and generation=${job.generation}
          and claimed_until>clock_timestamp() returning booking_uid`;
      if (!done) throw superseded;
      return booking ? { state: "observed", intentId } as const : { state: "reconcile" } as const;
    });
  } catch (error) {
    if (error !== superseded) throw error;
    await sql`update velcrafting_private.booking_job set claim_id=null,claimed_until=null,state='queued',available_at=now()
      where booking_uid=${job.booking_uid} and claim_id=${job.claim_id}`;
    return { state: "stale" } as const;
  }
}

export async function scheduleBookingPreparationCheck(sql: Sql, intentId: string, needsReconciliation: boolean) {
  await sql.begin(async (tx) => {
    if (needsReconciliation) await tx`update velcrafting_private.booking set preparation_state='reconcile',meet_url=null
      where intent_id=${intentId} and state='confirmed'`;
    await tx`update velcrafting_private.booking_job j set state='queued',generation=j.generation+1,
      available_at=clock_timestamp()+${needsReconciliation ? 300 : 5}*interval '1 second'
      where j.state='complete' and j.booking_uid=(select uid from velcrafting_private.booking where intent_id=${intentId}
        order by (state in ('confirmed','pending')) desc,observed_at desc limit 1)`;
  });
}
