import type { Sql, TransactionSql } from "postgres";
import type { BriefRevision } from "../brief";
import type { AuthoritativeBooking } from "./booking-cal";
import type { BookingMutation, BookingMutationReceipt, BookingStepStore } from "./booking-worker";
import {
  currentMeetingPlan, sameRecipients,
  type BriefRef, type CalendarEvent, type CurrentMeeting, type EventRef, type ManagedArtifact,
} from "./meeting-contract";

type Context = {
  id: string; session_id: string; confirmation_version: number; registry_version: number;
  revoked_at: Date | null; organizer: string; contact_id: string; visitor_email: string;
  verified_email: string | null; material: "shared_for_booking" | "no_brief_confirmed";
  brief_id: string | null; brief_version: number | null; brief_sha256: string | null;
  uid: string; calendar_id: string | null; event_uid: string | null; booking_version: number;
  booking_state: "confirmed" | "pending" | "cancelled" | "rescheduled";
};

function brief(row: Pick<Context, "brief_id" | "brief_version" | "brief_sha256">): BriefRef | null {
  return row.brief_id && row.brief_version && row.brief_sha256
    ? { id: row.brief_id, version: row.brief_version, sha256: row.brief_sha256 } : null;
}

async function loadContext(sql: Sql | TransactionSql, intentId: string) {
  const [row] = await sql<Context[]>`
    select i.id,i.session_id,i.confirmation_version,i.registry_version,i.revoked_at,i.organizer,
      c.contact_id,c.visitor_email,c.material,c.brief_id,c.brief_version,c.brief_sha256,
      case when p.revoked_at is null and p.verified_email=c.visitor_email then p.verified_email end as verified_email,
      b.uid,b.calendar_id,b.event_uid,b.confirmation_version as booking_version,b.state as booking_state
    from velcrafting_private.booking_intent i
    join velcrafting_private.booking_confirmation c on c.intent_id=i.id and c.version=i.confirmation_version
    join velcrafting_private.prospect_contact p on p.id=c.contact_id and p.session_id=i.session_id
    join lateral (select * from velcrafting_private.booking where intent_id=i.id
      order by (state in ('confirmed','pending')) desc,observed_at desc limit 1) b on true
    where i.id=${intentId}`;
  return row ?? null;
}

async function loadRegistry(sql: Sql, row: Context, ownMutationId?: string) {
  type ArtifactRow = Pick<Context, "brief_id" | "brief_version" | "brief_sha256"> & {
    file_id: string; context_version: number; kind: ManagedArtifact["kind"]; contents_sha256: string | null;
    attachments: { uid: string; calendarId: string }[];
    grants: { permissionId: string; recipient: string }[];
  };
  // All generations are read, including rows with no remaining active grants or attachments.
  const [registry] = await sql<{ version: number; unresolved: boolean; artifacts: ArtifactRow[] }[]>`
    select i.registry_version as version,
      exists (select 1 from velcrafting_private.booking_mutation
        where intent_id=i.id and state='unresolved' and id is distinct from ${ownMutationId ?? null}::uuid) as unresolved,
      coalesce((select jsonb_agg(jsonb_build_object('file_id',a.file_id,'kind',a.kind,'context_version',a.context_version,
        'contents_sha256',a.contents_sha256,'brief_id',c.brief_id,'brief_version',c.brief_version,'brief_sha256',c.brief_sha256,
        'attachments',coalesce((select jsonb_agg(jsonb_build_object('uid',t.event_uid,'calendarId',t.calendar_id))
          from velcrafting_private.booking_attachment t where t.file_id=a.file_id),'[]'::jsonb),
        'grants',coalesce((select jsonb_agg(jsonb_build_object('permissionId',g.permission_id,'recipient',g.recipient))
          from velcrafting_private.booking_grant g where g.file_id=a.file_id),'[]'::jsonb)) order by a.context_version,a.kind)
        from velcrafting_private.booking_artifact a
        join velcrafting_private.booking_confirmation c on c.intent_id=a.intent_id and c.version=a.context_version
        where a.intent_id=i.id),'[]'::jsonb) as artifacts
    from velcrafting_private.booking_intent i where i.id=${row.id}`;
  return {
    intentId: row.id,
    revision: registry.unresolved || registry.version !== row.registry_version ? null : registry.version,
    artifacts: registry.artifacts.map((entry) => ({
      kind: entry.kind, fileId: entry.file_id, brief: brief(entry), contextVersion: entry.context_version,
      contentsSha256: entry.contents_sha256 ?? undefined, attachments: entry.attachments, bookingGrants: entry.grants,
    })),
  };
}

export function postgresBookingStore(
  sql: Sql,
  lookup: (uid: string) => Promise<AuthoritativeBooking | null>,
  readEvent: (ref: EventRef) => Promise<CalendarEvent | null>,
): BookingStepStore {
  return {
    async read(intentId, ownMutationId) {
      const initial = await loadContext(sql, intentId);
      if (!initial) return null;
      const observed = await lookup(initial.uid);
      if (!observed || observed.uid !== initial.uid) return null;
      const previous = initial.calendar_id && initial.event_uid ? { calendarId: initial.calendar_id, uid: initial.event_uid } : null;
      const ref = observed.event ?? previous;
      if (!ref) return null;
      const resolved = await readEvent(ref);
      // Read stored authority again after provider I/O and reject a changed binding.
      const row = await loadContext(sql, intentId);
      if (!row || row.uid !== initial.uid || row.calendar_id !== initial.calendar_id || row.event_uid !== initial.event_uid) return null;
      const state = observed.state === "rescheduled" ? "cancelled" : observed.state;
      if (!resolved && state !== "cancelled") return null;
      const event = resolved ?? {
        ...ref, startsAt: observed.startsAt, organizer: row.organizer, participants: [], meetState: "failed" as const, attachments: [],
      };
      // A reference change that the booking reconciler has not committed yet cannot authorize a write.
      if (state === "confirmed" && (!observed.event || observed.event.calendarId !== row.calendar_id ||
        observed.event.uid !== row.event_uid)) return null;
      const refBrief = brief(row);
      if (row.material === "shared_for_booking" && !refBrief) return null;
      const material = row.material === "shared_for_booking"
        ? { state: "shared_for_booking" as const, brief: refBrief! }
        : { state: "no_brief_confirmed" as const, brief: null };
      const contact = row.verified_email ? { id: row.contact_id, verifiedEmail: row.verified_email } : null;
      const current: CurrentMeeting = {
        confirmation: { intentId: row.id, version: row.confirmation_version, verifiedContactId: row.contact_id,
          recipients: [row.organizer, row.visitor_email], organizer: row.organizer, revoked: row.revoked_at !== null, material },
        contact, booking: { intentId: row.id, confirmationVersion: row.booking_version, state, uid: row.uid,
          calendarId: ref.calendarId, eventUid: ref.uid, startsAt: observed.startsAt,
          organizer: observed.organizer, visitor: observed.visitor },
        event, bindingValid: sameRecipients(event.participants, observed.participants),
      };
      return { current, registry: await loadRegistry(sql, row, ownMutationId) };
    },
    async runMutation(state, action, invoke) {
      const intentId = state.registry.intentId;
      const [claim] = await sql<{ id: string }[]>`
        insert into velcrafting_private.booking_mutation(intent_id,registry_version,context_version,action)
        select id,registry_version,${state.current.confirmation?.version ?? null},${sql.json(action)} from velcrafting_private.booking_intent
        where id=${intentId} and registry_version=${state.registry.revision}
        on conflict (intent_id) where state='unresolved' do nothing returning id`;
      if (!claim) return "reconcile";
      let receipt: BookingMutationReceipt | "stale";
      try { receipt = await invoke(claim.id); } catch { return "reconcile"; }
      try {
        await sql.begin(async (tx) => {
          await tx`select id from velcrafting_private.booking_intent where id=${intentId} for update`;
          const [pending] = await tx<{ context_version: number }[]>`
            select context_version from velcrafting_private.booking_mutation where id=${claim.id} and state='unresolved'`;
          if (!pending) return;
          if (receipt !== "stale") await persistMutation(tx, intentId, pending.context_version, action, receipt);
          await tx`update velcrafting_private.booking_mutation set state=${receipt === "stale" ? "abandoned" : "applied"},
            resolved_at=clock_timestamp() where id=${claim.id} and state='unresolved'`;
          await tx`update velcrafting_private.booking_intent set registry_version=registry_version+1 where id=${intentId}`;
        });
      } catch { return "reconcile"; }
      return receipt === "stale" ? "stale" : "applied";
    },
    async markReady(state, expected) {
      if (!currentMeetingPlan(expected, state.current) || !state.current.event.meetUrl || state.registry.revision === null) return false;
      const meetUrl = state.current.event.meetUrl;
      const [result] = await sql.begin(async (tx) => {
        await tx`select id from velcrafting_private.booking_intent where id=${expected.intentId} for update`;
        return tx`update velcrafting_private.booking b set preparation_state='ready',meet_url=${meetUrl}
          from velcrafting_private.booking_intent i
          join velcrafting_private.booking_confirmation c on c.intent_id=i.id and c.version=i.confirmation_version
          join velcrafting_private.prospect_contact p on p.id=c.contact_id and p.session_id=i.session_id
          where b.intent_id=i.id and i.id=${expected.intentId} and b.uid=${expected.bookingUid}
            and i.confirmation_version=${expected.confirmationVersion} and b.confirmation_version=i.confirmation_version
            and i.registry_version=${state.registry.revision} and i.revoked_at is null
            and p.id=${expected.verifiedContactId} and p.revoked_at is null and p.verified_email=c.visitor_email
            and b.state='confirmed' and b.calendar_id=${expected.calendarId} and b.event_uid=${expected.eventUid}
            and b.starts_at=${expected.startsAt}::timestamptz
            and not exists (select 1 from velcrafting_private.booking_mutation where intent_id=i.id and state='unresolved')
          returning b.uid`;
      });
      return !!result;
    },
  };
}

async function persistMutation(
  tx: TransactionSql, intentId: string, version: number, action: BookingMutation, receipt: BookingMutationReceipt,
) {
  switch (action.kind) {
    case "create-file":
      if (!version || !receipt.fileId || (action.artifact.kind === "brief" && !receipt.contentsSha256))
        throw new Error("Artifact creation cannot be confirmed");
      await tx`insert into velcrafting_private.booking_artifact(file_id,intent_id,kind,context_version,contents_sha256)
        values (${receipt.fileId},${intentId},${action.artifact.kind},${version},${receipt.contentsSha256 ?? null})`;
      break;
    case "refresh-notes-context":
      if (!version || !receipt.contentsSha256) throw new Error("Notes context cannot be confirmed");
      await tx`update velcrafting_private.booking_artifact set context_version=${version},contents_sha256=${receipt.contentsSha256}
        where file_id=${action.fileId} and intent_id=${intentId}`;
      break;
    case "revoke-booking-grant":
      await tx`delete from velcrafting_private.booking_grant where file_id=${action.fileId} and permission_id=${action.permissionId}`;
      break;
    case "remove-attachment":
      await tx`delete from velcrafting_private.booking_attachment where file_id=${action.fileId}
        and calendar_id=${action.event.calendarId} and event_uid=${action.event.uid}`;
      break;
    case "grant-visitor":
      if (!receipt.permissionId) throw new Error("Grant cannot be confirmed");
      await tx`insert into velcrafting_private.booking_grant(file_id,permission_id,recipient)
        values (${action.fileId},${receipt.permissionId},${action.recipient})`;
      break;
    case "attach-file":
      await tx`insert into velcrafting_private.booking_attachment(file_id,calendar_id,event_uid)
        values (${action.fileId},${action.event.calendarId},${action.event.uid}) on conflict do nothing`;
      break;
  }
}

export async function bookingBrief(sql: Sql, intentId: string, ref: BriefRef): Promise<BriefRevision | null> {
  const [row] = await sql<{ snapshot: BriefRevision }[]>`
    select r.snapshot from velcrafting_private.booking_intent i join velcrafting_private.brief_revision r on r.session_id=i.session_id
    where i.id=${intentId} and r.brief_id=${ref.id} and r.version=${ref.version} and r.sha256=${ref.sha256}`;
  return row?.snapshot ?? null;
}


export async function bookingArtifact(sql: Sql, intentId: string, fileId: string) {
  const [row] = await sql<{ contents_sha256: string | null }[]>`
    select contents_sha256 from velcrafting_private.booking_artifact where intent_id=${intentId} and file_id=${fileId}`;
  return row ? { contentsSha256: row.contents_sha256 ?? undefined } : null;
}

export async function reconcileBookingMutation(
  sql: Sql, intentId: string, verify: (intentId: string, operationId: string, action: BookingMutation) => Promise<BookingMutationReceipt | null>,
) {
  type Pending = { id: string; action: BookingMutation; context_version: number };
  const [row] = await sql<Pending[]>`
    select id,action,context_version from velcrafting_private.booking_mutation
    where intent_id=${intentId} and state='unresolved' and created_at<clock_timestamp()-interval '2 minutes'`;
  if (!row) return false;
  const receipt = await verify(intentId, row.id, row.action);
  if (!receipt) return false;
  return sql.begin(async (tx) => {
    await tx`select id from velcrafting_private.booking_intent where id=${intentId} for update`;
    const [pending] = await tx`select id from velcrafting_private.booking_mutation where id=${row.id} and state='unresolved'`;
    if (!pending) return false;
    await persistMutation(tx, intentId, row.context_version, row.action, receipt);
    await tx`update velcrafting_private.booking_mutation set state='applied',resolved_at=clock_timestamp() where id=${row.id}`;
    await tx`update velcrafting_private.booking_intent set registry_version=registry_version+1 where id=${intentId}`;
    return true;
  });
}
