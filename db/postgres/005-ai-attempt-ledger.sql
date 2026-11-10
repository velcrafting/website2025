-- Development candidate; no website connection or runtime database role is provisioned.
begin;

create table velcrafting_private.explorer_session (
  id uuid primary key,
  notice_version text not null check (notice_version <> ''),
  expires_at timestamptz not null
);

create table velcrafting_private.ai_content (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references velcrafting_private.explorer_session,
  kind text not null check (kind in ('submitted', 'output')),
  body text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  unique (session_id, id)
);

create table velcrafting_private.ai_operation (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references velcrafting_private.explorer_session,
  idempotency_key uuid not null,
  input_id uuid not null,
  input_sha256 bytea not null check (octet_length(input_sha256) = 32),
  instruction_version text not null check (instruction_version <> ''),
  refused_reason text check (refused_reason in ('allowance_unavailable', 'session_busy')),
  created_at timestamptz not null default clock_timestamp(),
  unique (session_id, idempotency_key),
  unique (session_id, id),
  foreign key (session_id, input_id) references velcrafting_private.ai_content (session_id, id)
);

-- Units are an owner-configured conservative allowance. They are not provider credits or money.
create table velcrafting_private.ai_allowance (
  day date primary key,
  unit_limit integer not null check (unit_limit > 0),
  units_reserved integer not null default 0 check (units_reserved between 0 and unit_limit)
);

create table velcrafting_private.ai_call_attempt (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  session_id uuid not null,
  sequence integer not null check (sequence = 1), -- No retry is enabled in this slice.
  provider text not null default 'command-code' check (provider = 'command-code'),
  model text not null default 'deepseek/deepseek-v4.1-flash' check (model = 'deepseek/deepseek-v4.1-flash'),
  reserved_day date not null references velcrafting_private.ai_allowance,
  reserved_units integer not null check (reserved_units > 0),
  prepared_at timestamptz not null default clock_timestamp(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('completed', 'indeterminate')),
  output_id uuid,
  cost_state text not null default 'pending' check (cost_state in ('pending', 'estimated', 'verified', 'unavailable')),
  unique (operation_id, sequence),
  foreign key (session_id, operation_id) references velcrafting_private.ai_operation (session_id, id),
  foreign key (session_id, output_id) references velcrafting_private.ai_content (session_id, id),
  check (completed_at is null or dispatched_at is not null),
  check ((outcome = 'completed') is not true or output_id is not null)
);

create unique index one_open_attempt_per_session on velcrafting_private.ai_call_attempt (session_id)
  where completed_at is null;

alter table velcrafting_private.explorer_session enable row level security;
alter table velcrafting_private.ai_content enable row level security;
alter table velcrafting_private.ai_operation enable row level security;
alter table velcrafting_private.ai_allowance enable row level security;
alter table velcrafting_private.ai_call_attempt enable row level security;
revoke all on all tables in schema velcrafting_private from public, anon, service_role;
revoke all on velcrafting_private.explorer_session, velcrafting_private.ai_content, velcrafting_private.ai_operation,
  velcrafting_private.ai_allowance, velcrafting_private.ai_call_attempt from authenticated;

-- Invoke and commit this as a standalone transaction, before claiming or dispatching.
-- The caller must already have validated the session capability, origin and content.
create function velcrafting_private.prepare_ai_attempt(
  session uuid, submission uuid, input_body text, instruction text, units integer
) returns table (operation_id uuid, attempt_id uuid, disposition text)
language plpgsql set search_path = pg_catalog as $$
declare
  expires timestamptz;
  allowance_day date := (clock_timestamp() at time zone 'UTC')::date;
  input_hash bytea := sha256(convert_to(input_body, 'UTF8'));
  op velcrafting_private.ai_operation%rowtype;
  body_id uuid;
  new_attempt uuid;
begin
  if input_body is null or btrim(input_body) = '' or octet_length(input_body) > 8192
     or units is null or units < 1 or instruction is null or length(instruction) not between 1 and 100 then
    raise exception 'Invalid operation input' using errcode = '22023';
  end if;

  -- Serialize operations for this session; the allowance row separately serializes the global budget.
  select s.expires_at into expires from velcrafting_private.explorer_session s
    where s.id = session and s.expires_at > clock_timestamp() for update;
  if not found then
    raise exception 'No active session' using errcode = '22023';
  end if;

  select * into op from velcrafting_private.ai_operation o where o.session_id = session and o.idempotency_key = submission;
  if found then
    if op.input_sha256 <> input_hash or op.instruction_version <> instruction then
      raise exception 'Idempotency key conflicts with a prior operation' using errcode = '22023';
    end if;
    return query select op.id, null::uuid, 'duplicate'::text;
    return;
  end if;

  insert into velcrafting_private.ai_content (session_id, kind, body, expires_at)
    values (session, 'submitted', input_body, expires) returning id into body_id;
  insert into velcrafting_private.ai_operation (session_id, idempotency_key, input_id, input_sha256, instruction_version)
    values (session, submission, body_id, input_hash, instruction) returning * into op;

  if exists (select 1 from velcrafting_private.ai_call_attempt a where a.session_id = session and a.completed_at is null) then
    update velcrafting_private.ai_operation set refused_reason = 'session_busy' where id = op.id;
    return query select op.id, null::uuid, 'session_busy'::text;
    return;
  end if;

  update velcrafting_private.ai_allowance a set units_reserved = a.units_reserved + units
    where a.day = allowance_day and units <= a.unit_limit - a.units_reserved;
  if not found then
    update velcrafting_private.ai_operation set refused_reason = 'allowance_unavailable' where id = op.id;
    return query select op.id, null::uuid, 'allowance_unavailable'::text;
    return;
  end if;

  insert into velcrafting_private.ai_call_attempt (operation_id, session_id, sequence, reserved_day, reserved_units)
    values (op.id, session, 1, allowance_day, units) returning id into new_attempt;
  return query select op.id, new_attempt, 'prepared'::text;
end;
$$;

-- Compare and set. A lost acknowledgement or crash after claiming never permits blind replay.
create function velcrafting_private.claim_ai_dispatch(attempt uuid, session uuid) returns boolean
language sql set search_path = pg_catalog as $$
  with claim as (
    update velcrafting_private.ai_call_attempt a set dispatched_at = clock_timestamp()
    where a.id = attempt and a.session_id = session and a.dispatched_at is null
      and a.reserved_day = (clock_timestamp() at time zone 'UTC')::date
      and exists (select 1 from velcrafting_private.explorer_session s
                  where s.id = session and s.expires_at > clock_timestamp())
    returning a.id
  )
  select exists (select 1 from claim);
$$;

create function velcrafting_private.finish_ai_attempt(attempt uuid, session uuid, output_body text) returns boolean
language plpgsql set search_path = pg_catalog as $$
declare output_content uuid;
begin
  perform 1 from velcrafting_private.ai_call_attempt a
    where a.id = attempt and a.session_id = session and a.dispatched_at is not null and a.completed_at is null for update;
  if not found then return false; end if;
  if output_body is not null then
    insert into velcrafting_private.ai_content (session_id, kind, body, expires_at)
      select s.id, 'output', output_body, s.expires_at from velcrafting_private.explorer_session s where s.id = session
      returning id into output_content;
  end if;
  update velcrafting_private.ai_call_attempt set completed_at = clock_timestamp(), output_id = output_content,
    outcome = case when output_content is null then 'indeterminate' else 'completed' end,
    cost_state = case when output_content is null then 'pending' else 'unavailable' end
    where id = attempt;
  return true;
end;
$$;

revoke all on function velcrafting_private.prepare_ai_attempt(uuid, uuid, text, text, integer),
  velcrafting_private.claim_ai_dispatch(uuid, uuid), velcrafting_private.finish_ai_attempt(uuid, uuid, text)
  from public, anon, authenticated, service_role;

commit;
