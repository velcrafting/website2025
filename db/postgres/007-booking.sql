-- Booking-owned data stays in the server-only schema. Cal identifiers are correlation,
-- never ownership credentials. File receipts remain separate from provider observations.
create table velcrafting_private.booking_intent (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references velcrafting_private.explorer_session(id),
  event_type_id integer not null check (event_type_id > 0),
  organizer text not null check (length(organizer) between 3 and 254),
  confirmation_version integer check (confirmation_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  registry_version integer not null default 0 check (registry_version >= 0),
  unique (session_id,id)
);

create table velcrafting_private.booking_confirmation (
  intent_id uuid not null,
  version integer not null check (version > 0),
  session_id uuid not null,
  contact_id uuid not null,
  visitor_email text not null check (length(visitor_email) between 3 and 254),
  organizer text not null check (length(organizer) between 3 and 254 and organizer <> visitor_email),
  idempotency_key uuid not null,
  correlation_id uuid not null default gen_random_uuid() unique,
  material text not null check (material in ('shared_for_booking','no_brief_confirmed')),
  brief_id uuid,
  brief_version integer,
  brief_sha256 text,
  confirmed_at timestamptz not null default now(),
  primary key (intent_id, version),
  unique (session_id,idempotency_key),
  foreign key (session_id,intent_id) references velcrafting_private.booking_intent(session_id,id),
  foreign key (session_id,contact_id) references velcrafting_private.prospect_contact(session_id,id),
  foreign key (session_id,brief_id,brief_version,brief_sha256)
    references velcrafting_private.brief_revision(session_id,brief_id,version,sha256),
  check ((material = 'shared_for_booking' and brief_id is not null and brief_version > 0 and brief_sha256 is not null
          and brief_sha256 ~ '^[0-9a-f]{64}$')
         or (material = 'no_brief_confirmed' and brief_id is null and brief_version is null and brief_sha256 is null)),
  check (material <> 'shared_for_booking' or brief_version is not null)
);
alter table velcrafting_private.booking_intent add foreign key (id,confirmation_version)
  references velcrafting_private.booking_confirmation(intent_id,version) deferrable initially deferred;

create table velcrafting_private.booking (
  uid text primary key check (length(uid) between 1 and 128),
  intent_id uuid not null,
  confirmation_version integer not null,
  state text not null check (state in ('confirmed','pending','cancelled','rescheduled')),
  starts_at timestamptz not null,
  time_zone text not null,
  organizer text not null,
  visitor_email text not null,
  participants jsonb not null check (jsonb_typeof(participants) = 'array'),
  calendar_id text,
  event_uid text,
  rescheduled_from_uid text,
  provider_updated_at timestamptz not null,
  observed_at timestamptz not null default now(),
  preparation_state text not null default 'pending' check (preparation_state in ('pending','reconcile','ready','cleaned')),
  meet_url text,
  foreign key (intent_id,confirmation_version) references velcrafting_private.booking_confirmation(intent_id,version),
  check ((calendar_id is null) = (event_uid is null)),
  check (preparation_state <> 'ready' or (state = 'confirmed' and meet_url is not null))
);
create unique index booking_one_current_per_intent on velcrafting_private.booking(intent_id)
  where state in ('confirmed','pending');

create table velcrafting_private.booking_event (
  digest text primary key check (digest ~ '^[0-9a-f]{64}$'),
  booking_uid text not null check (length(booking_uid) between 1 and 128),
  event_type_id integer not null check (event_type_id > 0),
  trigger text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create table velcrafting_private.booking_job (
  booking_uid text primary key check (length(booking_uid) between 1 and 128),
  generation integer not null default 1 check (generation > 0),
  available_at timestamptz not null default now(),
  claim_id uuid,
  claimed_until timestamptz,
  state text not null default 'queued' check (state in ('queued','complete','reconcile')),
  check ((claim_id is null) = (claimed_until is null))
);
create index booking_job_poll on velcrafting_private.booking_job(available_at)
  where state in ('queued','reconcile');

create table velcrafting_private.booking_artifact (
  file_id text primary key,
  intent_id uuid not null,
  kind text not null check (kind in ('brief','notes')),
  context_version integer not null,
  contents_sha256 text check (contents_sha256 ~ '^[0-9a-f]{64}$'),
  foreign key (intent_id,context_version) references velcrafting_private.booking_confirmation(intent_id,version),
  unique (intent_id,file_id)
);
create unique index booking_one_notes_per_intent on velcrafting_private.booking_artifact(intent_id) where kind = 'notes';
create unique index booking_one_brief_per_confirmation on velcrafting_private.booking_artifact(intent_id,context_version) where kind = 'brief';

create table velcrafting_private.booking_attachment (
  file_id text not null references velcrafting_private.booking_artifact(file_id),
  calendar_id text not null,
  event_uid text not null,
  primary key (file_id,calendar_id,event_uid)
);
create table velcrafting_private.booking_grant (
  file_id text not null references velcrafting_private.booking_artifact(file_id),
  permission_id text not null,
  recipient text not null,
  primary key (file_id,permission_id)
);

create table velcrafting_private.booking_mutation (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references velcrafting_private.booking_intent(id),
  registry_version integer not null,
  context_version integer not null,
  action jsonb not null check (jsonb_typeof(action) = 'object'),
  state text not null default 'unresolved' check (state in ('unresolved','applied','abandoned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (intent_id,context_version) references velcrafting_private.booking_confirmation(intent_id,version),
  check ((state = 'unresolved') = (resolved_at is null))
);
create unique index booking_one_unresolved_mutation on velcrafting_private.booking_mutation(intent_id) where state = 'unresolved';

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'booking_intent','booking_confirmation','booking','booking_event','booking_job','booking_artifact',
    'booking_attachment','booking_grant','booking_mutation'
  ] loop
    execute format('alter table velcrafting_private.%I enable row level security',table_name);
    execute format('revoke all on velcrafting_private.%I from public, anon, authenticated, service_role',table_name);
    execute format('grant select,insert on velcrafting_private.%I to velcrafting_runtime',table_name);
    execute format('create policy booking_runtime on velcrafting_private.%I to velcrafting_runtime using (true) with check (true)',table_name);
  end loop;
end $$;

-- Confirmations and verified webhook receipts are append-only to the application role.
grant update (confirmation_version,revoked_at,registry_version) on velcrafting_private.booking_intent to velcrafting_runtime;
grant update on velcrafting_private.booking,velcrafting_private.booking_job to velcrafting_runtime;
grant update (context_version,contents_sha256) on velcrafting_private.booking_artifact to velcrafting_runtime;
grant update (state,resolved_at) on velcrafting_private.booking_mutation to velcrafting_runtime;
grant delete on velcrafting_private.booking_attachment,velcrafting_private.booking_grant to velcrafting_runtime;
