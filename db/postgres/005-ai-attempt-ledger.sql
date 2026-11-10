-- Development candidate. All entry points require a private server role.
begin;

create table velcrafting_private.explorer_session (
  id uuid primary key,
  notice_version text not null check (notice_version <> ''),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  reminder_suppressed_at timestamptz
);

create table velcrafting_private.ai_content (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references velcrafting_private.explorer_session,
  kind text not null check (kind in ('submitted', 'context', 'output')),
  body text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  expired_at timestamptz,
  unique (session_id, id),
  check ((body is null) = (expired_at is not null))
);

create table velcrafting_private.ai_operation (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references velcrafting_private.explorer_session,
  idempotency_key uuid not null,
  input_id uuid not null,
  input_sha256 bytea check (octet_length(input_sha256) = 32),
  instruction_version text not null check (instruction_version <> ''),
  notice_version text not null,
  refused_reason text check (refused_reason in ('allowance_unavailable', 'session_busy')),
  created_at timestamptz not null default clock_timestamp(),
  unique (session_id, idempotency_key),
  unique (session_id, id),
  foreign key (session_id, input_id) references velcrafting_private.ai_content (session_id, id)
);

-- These units cap application exposure. They are separate from provider usage and billing.
create table velcrafting_private.ai_allowance (
  day date primary key,
  unit_limit integer not null check (unit_limit > 0),
  units_reserved integer not null default 0 check (units_reserved between 0 and unit_limit)
);

create table velcrafting_private.ai_call_attempt (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  session_id uuid not null,
  sequence integer not null check (sequence between 1 and 3),
  previous_attempt_id uuid,
  retry_kind text check (retry_kind in ('retry', 'repair')),
  provider text not null default 'command-code' check (provider = 'command-code'),
  model text not null default 'deepseek/deepseek-v4.1-flash' check (model = 'deepseek/deepseek-v4.1-flash'),
  instruction_version text not null check (instruction_version <> ''),
  input_context_id uuid not null,
  reserved_day date not null references velcrafting_private.ai_allowance,
  reserved_units integer not null check (reserved_units > 0),
  reservation_state text not null default 'held' check (reservation_state in ('held', 'consumed', 'released')),
  prepared_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null,
  dispatch_claimed_at timestamptz,
  response_received_at timestamptz,
  closed_at timestamptz,
  reconciled_at timestamptz,
  provider_execution text not null default 'not_started'
    check (provider_execution in ('not_started', 'unknown', 'returned', 'confirmed_executed', 'confirmed_not_executed')),
  local_outcome text check (local_outcome in ('preparation_invalidated', 'indeterminate', 'output_saved', 'output_unavailable')),
  failure_category text check (failure_category in (
    'preparation_expired', 'reservation_day_rolled', 'session_invalidated',
    'provider_unconfirmed', 'claim_lease_expired', 'output_unavailable'
  )),
  output_id uuid,
  unique (operation_id, sequence),
  unique (operation_id, id),
  foreign key (session_id, operation_id) references velcrafting_private.ai_operation (session_id, id),
  foreign key (operation_id, previous_attempt_id) references velcrafting_private.ai_call_attempt (operation_id, id),
  foreign key (session_id, input_context_id) references velcrafting_private.ai_content (session_id, id),
  foreign key (session_id, output_id) references velcrafting_private.ai_content (session_id, id),
  check ((sequence = 1 and previous_attempt_id is null and retry_kind is null)
      or (sequence > 1 and previous_attempt_id is not null and retry_kind is not null)),
  check ((provider_execution = 'not_started') = (dispatch_claimed_at is null)),
  check (response_received_at is null or dispatch_claimed_at is not null),
  check ((closed_at is null) = (local_outcome is null)),
  check ((local_outcome = 'output_saved') is not true or output_id is not null)
);

-- Preserve the response observation when authoritative accounting arrives later.
create table velcrafting_private.ai_usage_evidence (
  attempt_id uuid not null references velcrafting_private.ai_call_attempt,
  stage text not null check (stage in ('response', 'reconciliation')),
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('provider_response', 'provider_reconciliation', 'documented_estimate')),
  provider_request_id text check (length(provider_request_id) between 1 and 200),
  actual_model text check (length(actual_model) between 1 and 200),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens >= 0),
  reasoning_tokens integer check (reasoning_tokens >= 0),
  provider_units numeric(20,6) check (provider_units >= 0 and provider_units <> 'NaN'::numeric),
  provider_unit_name text check (length(provider_unit_name) between 1 and 60),
  amount numeric(20,6) check (amount >= 0 and amount <> 'NaN'::numeric),
  currency text check (currency ~ '^[A-Z]{3}$'),
  cost_state text not null check (cost_state in ('pending', 'unavailable', 'estimated', 'verified')),
  rate_basis text check (length(rate_basis) between 1 and 200),
  failure_category text check (failure_category in ('provider_rejected', 'rate_limited', 'invalid_output')),
  primary key (attempt_id, stage),
  check ((provider_units is null) = (provider_unit_name is null)),
  check ((amount is null) = (currency is null)),
  check ((cost_state = 'estimated') is not true or (rate_basis is not null and source = 'documented_estimate' and (amount is not null or provider_units is not null))),
  check ((cost_state = 'verified') is not true or (source <> 'documented_estimate' and (amount is not null or provider_units is not null))),
  check (cost_state in ('verified', 'estimated') or (amount is null and provider_units is null))
);

create unique index one_open_attempt_per_session on velcrafting_private.ai_call_attempt (session_id) where closed_at is null;
create index ai_open_attempt_expiry on velcrafting_private.ai_call_attempt (lease_expires_at) where closed_at is null;
create index ai_live_payload_expiry on velcrafting_private.ai_content (session_id, expires_at) where body is not null;

alter table velcrafting_private.explorer_session enable row level security;
alter table velcrafting_private.ai_content enable row level security;
alter table velcrafting_private.ai_operation enable row level security;
alter table velcrafting_private.ai_allowance enable row level security;
alter table velcrafting_private.ai_call_attempt enable row level security;
alter table velcrafting_private.ai_usage_evidence enable row level security;
revoke all on velcrafting_private.explorer_session, velcrafting_private.ai_content, velcrafting_private.ai_operation,
  velcrafting_private.ai_allowance, velcrafting_private.ai_call_attempt, velcrafting_private.ai_usage_evidence
  from public, anon, authenticated, service_role;

-- Entry points lock in session -> attempt -> allowance order.
-- Run one session per transaction from a worker, and also recover lazily on prepare/claim.
create function velcrafting_private.recover_ai_attempts(session uuid) returns boolean
language plpgsql set search_path = pg_catalog as $$
declare
  current_session velcrafting_private.explorer_session%rowtype;
  open_attempt velcrafting_private.ai_call_attempt%rowtype;
  observed_at timestamptz;
  reason text;
begin
  select * into current_session from velcrafting_private.explorer_session s where s.id = session for update;
  if not found then return false; end if;
  select * into open_attempt from velcrafting_private.ai_call_attempt a
    where a.session_id = session and a.closed_at is null for update;
  if not found then return false; end if;

  observed_at := clock_timestamp();
  if open_attempt.dispatch_claimed_at is null then
    reason := case
      when current_session.invalidated_at is not null or current_session.expires_at <= observed_at then 'session_invalidated'
      when open_attempt.reserved_day <> (observed_at at time zone 'UTC')::date then 'reservation_day_rolled'
      when open_attempt.lease_expires_at <= observed_at or exists (
        select 1 from velcrafting_private.ai_content c where c.id = open_attempt.input_context_id
          and (c.expires_at <= observed_at or c.expired_at is not null)
      ) then 'preparation_expired'
    end;
    if reason is null then return false; end if;
    update velcrafting_private.ai_call_attempt
      set closed_at = observed_at, local_outcome = 'preparation_invalidated',
          failure_category = reason, reservation_state = 'released'
      where id = open_attempt.id;
    update velcrafting_private.ai_allowance set units_reserved = units_reserved - open_attempt.reserved_units
      where day = open_attempt.reserved_day;
  else
    if open_attempt.lease_expires_at > observed_at then return false; end if;
    -- A timed-out local lease does not settle execution or release its allowance.
    update velcrafting_private.ai_call_attempt
      set closed_at = observed_at,
          local_outcome = case when response_received_at is null then 'indeterminate' else 'output_unavailable' end,
          failure_category = case when response_received_at is null then 'claim_lease_expired' else 'output_unavailable' end
      where id = open_attempt.id;
  end if;
  return true;
end;
$$;

-- Invoke and commit standalone. The server validates the session capability, origin and notice before calling.
create function velcrafting_private.prepare_ai_attempt(
  session uuid, submission uuid, input_body text, instruction text, units integer,
  context_body text default null, retry_kind text default null, previous_attempt uuid default null,
  payload_expires_at timestamptz default null
) returns table (operation_id uuid, attempt_id uuid, disposition text)
language plpgsql set search_path = pg_catalog as $$
declare
  current_session velcrafting_private.explorer_session%rowtype;
  observed_at timestamptz;
  content_deadline timestamptz;
  allowance_day date;
  input_hash bytea := sha256(convert_to(input_body, 'UTF8'));
  op velcrafting_private.ai_operation%rowtype;
  prior velcrafting_private.ai_call_attempt%rowtype;
  body_id uuid;
  context_id uuid;
  new_attempt uuid;
  attempt_sequence integer := 1;
  refusal text;
begin
  if session is null or submission is null or input_body is null or btrim(input_body) = '' or octet_length(input_body) > 8192
     or units is null or units < 1 or instruction is null or length(instruction) not between 1 and 100
     or octet_length(context_body) > 32768
     or (retry_kind is null) <> (previous_attempt is null)
     or (retry_kind is not null and retry_kind not in ('retry', 'repair')) then
    raise exception 'Invalid operation input' using errcode = '22023';
  end if;
  perform velcrafting_private.recover_ai_attempts(session);
  select * into current_session from velcrafting_private.explorer_session s where s.id = session for update;
  observed_at := clock_timestamp();
  if not found or current_session.invalidated_at is not null or current_session.expires_at <= observed_at then
    return query select null::uuid, null::uuid, 'session_unavailable'::text;
    return;
  end if;
  allowance_day := (observed_at at time zone 'UTC')::date;
  content_deadline := coalesce(payload_expires_at, current_session.expires_at);
  if content_deadline <= observed_at then
    raise exception 'Invalid payload expiry' using errcode = '22023';
  end if;

  select * into op from velcrafting_private.ai_operation o where o.session_id = session and o.idempotency_key = submission;
  if found then
    -- A tombstone prevents reusing the same key to restore expired content.
    if op.input_sha256 is null or exists (
      select 1 from velcrafting_private.ai_content c where c.id = op.input_id and c.expires_at <= observed_at
    ) then
      return query select op.id, null::uuid, 'duplicate'::text;
      return;
    end if;
    if op.input_sha256 <> input_hash or (retry_kind is null and op.instruction_version <> instruction) then
      raise exception 'Idempotency key conflicts with a prior operation' using errcode = '22023';
    end if;
    if retry_kind is null then
      return query select op.id, null::uuid, 'duplicate'::text;
      return;
    end if;
    select * into prior from velcrafting_private.ai_call_attempt a where a.operation_id = op.id order by a.sequence desc limit 1;
    if not found or prior.id <> previous_attempt or prior.sequence >= 3 or prior.closed_at is null
       or not ((retry_kind = 'repair' and prior.local_outcome = 'output_saved')
                or (retry_kind = 'retry' and prior.provider_execution in ('not_started', 'confirmed_not_executed'))) then
      return query select op.id, null::uuid, 'retry_refused'::text;
      return;
    end if;
    attempt_sequence := prior.sequence + 1;
    body_id := op.input_id;
    -- An explicit retry does not extend the original payload lifetime.
    select least(content_deadline, c.expires_at) into content_deadline from velcrafting_private.ai_content c where c.id = body_id;
  else
    if retry_kind is not null then
      return query select null::uuid, null::uuid, 'retry_refused'::text;
      return;
    end if;
    insert into velcrafting_private.ai_content (session_id, kind, body, expires_at)
      values (session, 'submitted', input_body, content_deadline) returning id into body_id;
    insert into velcrafting_private.ai_operation (session_id, idempotency_key, input_id, input_sha256, instruction_version, notice_version)
      values (session, submission, body_id, input_hash, instruction, current_session.notice_version) returning * into op;
  end if;

  if exists (select 1 from velcrafting_private.ai_call_attempt a where a.session_id = session
    and (a.closed_at is null or (a.provider_execution = 'unknown' and a.lease_expires_at > observed_at))) then
    refusal := 'session_busy';
  else
    update velcrafting_private.ai_allowance a set units_reserved = a.units_reserved + units
      where a.day = allowance_day and units <= a.unit_limit - a.units_reserved;
    if not found then refusal := 'allowance_unavailable'; end if;
  end if;
  if refusal is not null then
    if attempt_sequence = 1 then update velcrafting_private.ai_operation set refused_reason = refusal where id = op.id; end if;
    return query select op.id, null::uuid, refusal;
    return;
  end if;

  context_id := body_id;
  if context_body is not null and context_body <> input_body then
    insert into velcrafting_private.ai_content (session_id, kind, body, expires_at)
      values (session, 'context', context_body, content_deadline) returning id into context_id;
  end if;
  insert into velcrafting_private.ai_call_attempt
    (operation_id, session_id, sequence, previous_attempt_id, retry_kind, instruction_version, input_context_id,
     reserved_day, reserved_units, lease_expires_at)
    values (op.id, session, attempt_sequence, previous_attempt, retry_kind, instruction, context_id,
            allowance_day, units, observed_at + interval '30 seconds') returning id into new_attempt;
  return query select op.id, new_attempt, 'prepared'::text;
end;
$$;

-- A committed claim authorizes at most one physical send. It is not proof that send happened.
create function velcrafting_private.claim_ai_dispatch(attempt uuid, session uuid) returns boolean
language plpgsql set search_path = pg_catalog as $$
declare observed_at timestamptz;
begin
  perform velcrafting_private.recover_ai_attempts(session);
  observed_at := clock_timestamp();
  update velcrafting_private.ai_call_attempt a
    set dispatch_claimed_at = observed_at, provider_execution = 'unknown',
        lease_expires_at = observed_at + interval '90 seconds'
    where a.id = attempt and a.session_id = session and a.closed_at is null and a.dispatch_claimed_at is null
      and a.lease_expires_at > observed_at and a.reserved_day = (observed_at at time zone 'UTC')::date
      and exists (select 1 from velcrafting_private.explorer_session s
        where s.id = session and s.invalidated_at is null and s.expires_at > observed_at)
      and exists (select 1 from velcrafting_private.ai_content c
        where c.id = a.input_context_id and c.body is not null and c.expires_at > observed_at);
  return found;
end;
$$;

-- Only allow listed fields to reach durable accounting. Raw provider responses belong in restricted payloads.
create function velcrafting_private.write_ai_usage(attempt uuid, evidence_stage text, evidence jsonb) returns void
language sql set search_path = pg_catalog as $$
  insert into velcrafting_private.ai_usage_evidence
    (attempt_id, stage, source, provider_request_id, actual_model, input_tokens, output_tokens, cached_input_tokens,
     reasoning_tokens, provider_units, provider_unit_name, amount, currency, cost_state, rate_basis, failure_category)
  select attempt, evidence_stage, e.source, e.provider_request_id, e.actual_model, e.input_tokens, e.output_tokens,
    e.cached_input_tokens, e.reasoning_tokens, e.provider_units, e.provider_unit_name, e.amount, e.currency, e.cost_state, e.rate_basis, e.failure_category
  from jsonb_to_record(evidence) as e(
    source text, provider_request_id text, actual_model text, input_tokens integer, output_tokens integer,
    cached_input_tokens integer, reasoning_tokens integer, provider_units numeric, provider_unit_name text,
    amount numeric, currency text, cost_state text, rate_basis text, failure_category text
  );
$$;

create function velcrafting_private.record_ai_response(attempt uuid, session uuid, evidence jsonb) returns boolean
language plpgsql set search_path = pg_catalog as $$
begin
  perform 1 from velcrafting_private.explorer_session s where s.id = session for update;
  update velcrafting_private.ai_call_attempt a
    set response_received_at = clock_timestamp(), provider_execution = 'returned', reservation_state = 'consumed'
    where a.id = attempt and a.session_id = session and a.dispatch_claimed_at is not null
      and a.response_received_at is null and a.reconciled_at is null;
  if not found then return false; end if;
  perform velcrafting_private.write_ai_usage(attempt, 'response', evidence);
  return true;
end;
$$;

create function velcrafting_private.mark_ai_attempt_unknown(attempt uuid, session uuid, failure text) returns boolean
language plpgsql set search_path = pg_catalog as $$
begin
  if failure <> 'provider_unconfirmed' or failure is null then
    raise exception 'Invalid failure category' using errcode = '22023';
  end if;
  perform 1 from velcrafting_private.explorer_session s where s.id = session for update;
  update velcrafting_private.ai_call_attempt a
    set closed_at = clock_timestamp(), local_outcome = 'indeterminate', failure_category = failure
    where a.id = attempt and a.session_id = session and a.dispatch_claimed_at is not null
      and a.closed_at is null and a.response_received_at is null;
  return found;
end;
$$;

create function velcrafting_private.finish_ai_attempt(attempt uuid, session uuid, output_body text) returns boolean
language plpgsql set search_path = pg_catalog as $$
declare
  current_session velcrafting_private.explorer_session%rowtype;
  current_attempt velcrafting_private.ai_call_attempt%rowtype;
  content_deadline timestamptz;
  output_content uuid;
begin
  if octet_length(output_body) > 65536 then
    raise exception 'Invalid output payload' using errcode = '22023';
  end if;
  select * into current_session from velcrafting_private.explorer_session s where s.id = session for update;
  if not found or current_session.invalidated_at is not null then return false; end if;
  select * into current_attempt from velcrafting_private.ai_call_attempt a
    where a.id = attempt and a.session_id = session and a.response_received_at is not null for update;
  if not found then return false; end if;
  if current_attempt.output_id is not null then
    return exists (select 1 from velcrafting_private.ai_content c where c.id = current_attempt.output_id
      and c.expires_at > clock_timestamp() and c.body = output_body);
  end if;
  if output_body is null then
    update velcrafting_private.ai_call_attempt set closed_at = coalesce(closed_at, clock_timestamp()),
      local_outcome = 'output_unavailable', failure_category = 'output_unavailable' where id = attempt;
    return true;
  end if;
  select c.expires_at into content_deadline from velcrafting_private.ai_content c
    where c.id = current_attempt.input_context_id and c.expired_at is null;
  if not found or content_deadline <= clock_timestamp() then
    update velcrafting_private.ai_call_attempt set closed_at = coalesce(closed_at, clock_timestamp()),
      local_outcome = 'output_unavailable', failure_category = 'output_unavailable' where id = attempt;
    return false;
  end if;
  insert into velcrafting_private.ai_content (session_id, kind, body, expires_at)
    values (session, 'output', output_body, content_deadline) returning id into output_content;
  update velcrafting_private.ai_call_attempt set closed_at = coalesce(closed_at, clock_timestamp()),
    output_id = output_content, local_outcome = 'output_saved', failure_category = null where id = attempt;
  return true;
end;
$$;

-- Reconciliation is a separate trusted operation. Never release an ambiguous reservation without provider evidence.
create function velcrafting_private.reconcile_ai_attempt(attempt uuid, session uuid, execution text, evidence jsonb) returns boolean
language plpgsql set search_path = pg_catalog as $$
declare current_attempt velcrafting_private.ai_call_attempt%rowtype;
begin
  if execution is null or execution not in ('executed', 'not_executed')
    or evidence->>'source' is distinct from 'provider_reconciliation' then
    raise exception 'Provider reconciliation evidence required' using errcode = '22023';
  end if;
  perform 1 from velcrafting_private.explorer_session s where s.id = session for update;
  select * into current_attempt from velcrafting_private.ai_call_attempt a
    where a.id = attempt and a.session_id = session and a.dispatch_claimed_at is not null
      and a.closed_at is not null and a.reconciled_at is null for update;
  if not found or (execution = 'not_executed' and current_attempt.response_received_at is not null) then return false; end if;
  perform velcrafting_private.write_ai_usage(attempt, 'reconciliation', evidence);
  update velcrafting_private.ai_call_attempt
    set reconciled_at = clock_timestamp(),
        provider_execution = case
          when execution = 'not_executed' then 'confirmed_not_executed'
          when current_attempt.response_received_at is not null then 'returned'
          else 'confirmed_executed'
        end,
        reservation_state = case when execution = 'executed' then 'consumed' else 'released' end
    where id = attempt;
  if execution = 'not_executed' then
    update velcrafting_private.ai_allowance set units_reserved = units_reserved - current_attempt.reserved_units
      where day = current_attempt.reserved_day;
  end if;
  return true;
end;
$$;

-- Keep FK targets as bodyless tombstones. Remove the duplicate-check digest too.
-- A worker calls per session. Expiry is independent of both session access and usage evidence.
create function velcrafting_private.expire_ai_payloads(session uuid) returns integer
language plpgsql set search_path = pg_catalog as $$
declare changed integer;
begin
  perform 1 from velcrafting_private.explorer_session s where s.id = session for update;
  with expired as (
    update velcrafting_private.ai_content c set body = null, expired_at = clock_timestamp()
      where c.session_id = session and c.body is not null and c.expires_at <= clock_timestamp()
      returning c.id
  ), removed_digests as (
    update velcrafting_private.ai_operation o set input_sha256 = null
      from expired e where o.session_id = session and o.input_id = e.id
  )
  select count(*) into changed from expired;
  if changed > 0 then
    update velcrafting_private.explorer_session set reminder_suppressed_at = coalesce(reminder_suppressed_at, clock_timestamp())
      where id = session;
    perform velcrafting_private.recover_ai_attempts(session);
  end if;
  return changed;
end;
$$;

revoke all on function velcrafting_private.recover_ai_attempts(uuid),
  velcrafting_private.prepare_ai_attempt(uuid, uuid, text, text, integer, text, text, uuid, timestamptz),
  velcrafting_private.claim_ai_dispatch(uuid, uuid),
  velcrafting_private.write_ai_usage(uuid, text, jsonb),
  velcrafting_private.record_ai_response(uuid, uuid, jsonb),
  velcrafting_private.mark_ai_attempt_unknown(uuid, uuid, text),
  velcrafting_private.finish_ai_attempt(uuid, uuid, text),
  velcrafting_private.reconcile_ai_attempt(uuid, uuid, text, jsonb),
  velcrafting_private.expire_ai_payloads(uuid)
  from public, anon, authenticated, service_role;

commit;
