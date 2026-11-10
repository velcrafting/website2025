-- Apply only to an authorized development database first. Keep this schema off the Data API.
begin;
create role velcrafting_runtime nologin noinherit;
grant authenticated to velcrafting_runtime;
grant usage on schema velcrafting_private to velcrafting_runtime;

alter table velcrafting_private.explorer_session
  add column capability_sha256 text check (capability_sha256 ~ '^[0-9a-f]{64}$');
grant select (id, capability_sha256, expires_at, invalidated_at, notice_version), insert (id, notice_version, expires_at, capability_sha256),
  update (notice_version) on velcrafting_private.explorer_session to velcrafting_runtime;
create policy explorer_runtime on velcrafting_private.explorer_session to velcrafting_runtime using (true) with check (true);

create table velcrafting_private.prospect_contact (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references velcrafting_private.explorer_session,
  user_id uuid not null references auth.users,
  verified_email text not null,
  verified_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  unique (session_id,id)
);
alter table velcrafting_private.prospect_contact enable row level security;
grant select on velcrafting_private.prospect_contact to velcrafting_runtime;
create policy prospect_runtime_read on velcrafting_private.prospect_contact for select to velcrafting_runtime using (true);

create table velcrafting_private.auth_throttle (
  bucket text primary key,
  window_at timestamptz not null,
  hits integer not null
);
alter table velcrafting_private.auth_throttle enable row level security;
create function velcrafting_private.take_auth_allowance(surface text, action text, subject_digest text, session_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare key text; window_at timestamptz := date_bin(interval '15 minutes', clock_timestamp(), timestamptz '2026-01-01 UTC');
declare current_hits integer;
begin
  if not ((surface in ('client','prospect') and action in ('send','verify'))
    or (surface='explorer' and action in ('start','shape'))) or subject_digest !~ '^[0-9a-f]{64}$'
    or (surface = 'prospect' and session_id is null) or (action='shape' and session_id is null) then return false; end if;
  -- Check a surface-wide limit as well as the subject and current session.
  foreach key in array array[surface||':'||action, case when surface<>'explorer' then surface||':'||action||':'||subject_digest end,
    case when session_id is not null then surface||':'||action||':'||session_id::text end] loop
    if key is null then continue; end if;
    insert into velcrafting_private.auth_throttle as t values(key, window_at, 1)
    on conflict (bucket) do update set
      hits = case when t.window_at = excluded.window_at then least(t.hits+1,101) else 1 end,
      window_at = excluded.window_at
    returning hits into current_hits;
    if current_hits > (case when key = surface||':'||action then case when surface='explorer' then 150 else 40 end when action = 'send' then 3 when action='shape' then 12 else 6 end) then return false; end if;
  end loop;
  return true;
end;
$$;

create function velcrafting_private.claim_prospect(target_session uuid, subject uuid, email text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform 1 from velcrafting_private.explorer_session s where s.id=target_session
    and s.invalidated_at is null and s.expires_at > clock_timestamp() for update;
  if not found or subject is null or email is null then return false; end if;
  insert into velcrafting_private.prospect_contact(session_id,user_id,verified_email) values(target_session,subject,email)
  on conflict (session_id) do nothing;
  return exists(select 1 from velcrafting_private.prospect_contact c where c.session_id=target_session
    and c.user_id=subject and c.verified_email=email and c.revoked_at is null);
end;
$$;

create table velcrafting_private.brief_revision (
  session_id uuid not null references velcrafting_private.explorer_session,
  brief_id uuid not null,
  version integer not null check (version > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text) <= 24000),
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_id,brief_id,version),
  unique(session_id,brief_id,version,sha256)
);
alter table velcrafting_private.brief_revision enable row level security;
create policy brief_runtime_read on velcrafting_private.brief_revision for select to velcrafting_runtime using (true);
grant select on velcrafting_private.brief_revision to velcrafting_runtime;

create function velcrafting_private.save_brief_revision(target_session uuid, target_brief uuid, candidate_version integer, body jsonb)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare digest text := encode(sha256(convert_to(body::text,'UTF8')),'hex');
declare persisted text;
begin
  perform 1 from velcrafting_private.explorer_session s where s.id=target_session
    and s.invalidated_at is null and s.expires_at > clock_timestamp() for update;
  if not found then return null; end if;
  if body->>'id' is distinct from target_brief::text or body->>'version' is distinct from candidate_version::text then return null; end if;
  insert into velcrafting_private.brief_revision(session_id,brief_id,version,sha256,snapshot)
    values(target_session,target_brief,candidate_version,digest,body) on conflict (session_id,brief_id,version) do nothing;
  select r.sha256 into persisted from velcrafting_private.brief_revision r where r.session_id=target_session
    and r.brief_id=target_brief and r.version=candidate_version;
  return case when persisted=digest then digest else null end;
end;
$$;

create table velcrafting_private.staff_access (
  user_id uuid not null references velcrafting_private.profile,
  engagement_id uuid not null references velcrafting_private.engagement,
  capability text not null check (capability in ('draft','publish','issue','record_agreement','manage_access')),
  revoked_at timestamptz,
  primary key (user_id,engagement_id,capability)
);
alter table velcrafting_private.staff_access enable row level security;
grant select on velcrafting_private.staff_access to authenticated;
create policy own_staff_access on velcrafting_private.staff_access for select to authenticated using (
  user_id=(select auth.uid()) and revoked_at is null and
  exists(select 1 from velcrafting_private.profile p where p.user_id=staff_access.user_id)
);
create policy assigned_staff_engagement on velcrafting_private.engagement for select to authenticated using (
  exists(select 1 from velcrafting_private.staff_access a where a.engagement_id=engagement.id)
);

alter table velcrafting_private.engagement add column status text not null default 'In progress',
  add column next_action text, add column objective text, add column status_version integer not null default 0;
grant select on velcrafting_private.client,velcrafting_private.project to authenticated;
create policy accessible_clients on velcrafting_private.client for select to authenticated using (
  exists(select 1 from velcrafting_private.engagement e where e.client_id=client.id)
);
create policy accessible_projects on velcrafting_private.project for select to authenticated using (
  exists(select 1 from velcrafting_private.engagement e where e.project_id=project.id)
);

create table velcrafting_private.workspace_draft (
  engagement_id uuid not null references velcrafting_private.engagement,
  item_id uuid not null,
  version integer not null check (version > 0),
  stage text not null check (stage in ('discovery','quote','proposal','kickoff','updates','decisions','delivery')),
  title text not null check (length(title) between 1 and 180),
  body jsonb not null check (jsonb_typeof(body)='object' and octet_length(body::text)<=24000),
  terms jsonb check (terms is null or (jsonb_typeof(terms)='object' and octet_length(terms::text)<=12000)),
  created_at timestamptz not null default clock_timestamp(),
  author uuid not null references velcrafting_private.profile,
  primary key (engagement_id,item_id,version)
);
alter table velcrafting_private.workspace_draft enable row level security;
grant select (engagement_id,item_id,version,stage,title,body,created_at,author) on velcrafting_private.workspace_draft to authenticated;
create policy authorized_workspace_drafts on velcrafting_private.workspace_draft for select to authenticated using (
  exists(select 1 from velcrafting_private.staff_access a where a.engagement_id=workspace_draft.engagement_id
    and a.capability in ('draft','publish','issue'))
);
create trigger workspace_draft_immutable before update or delete on velcrafting_private.workspace_draft
  for each row execute function velcrafting_private.deny_snapshot_change();

create table velcrafting_private.workspace_publication (
  actor uuid not null references velcrafting_private.profile,
  retry_key uuid not null,
  engagement_id uuid not null,
  item_id uuid not null,
  version integer not null,
  prior_version integer not null,
  published_at timestamptz not null default clock_timestamp(),
  primary key(actor,retry_key),
  foreign key(engagement_id,item_id,version) references velcrafting_private.published_revision
);
alter table velcrafting_private.workspace_publication enable row level security;

create function velcrafting_private.staff_has(subject uuid, target uuid, required text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select subject = auth.uid() and exists (
    select 1 from velcrafting_private.staff_access a join velcrafting_private.profile p on p.user_id=a.user_id
    where a.user_id=subject and a.engagement_id=target and a.capability=required
      and a.revoked_at is null and p.disabled_at is null)
$$;

create table velcrafting_private.workspace_progress_event (
  engagement_id uuid not null references velcrafting_private.engagement,
  version integer not null,
  status text not null,
  next_action text,
  actor uuid not null references velcrafting_private.profile,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (engagement_id,version)
);
alter table velcrafting_private.workspace_progress_event enable row level security;
create trigger workspace_progress_immutable before update or delete on velcrafting_private.workspace_progress_event
  for each row execute function velcrafting_private.deny_snapshot_change();

create function velcrafting_private.update_workspace_progress(target uuid, expected integer, stage text, next_step text)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare actor_id uuid := auth.uid(); updated integer;
begin
  if not coalesce(velcrafting_private.staff_has(actor_id,target,'publish'),false) then return -1; end if;
  if stage is null or stage not in ('Discovery','In progress','Ready for review','Delivered','On hold')
    or length(next_step)>500 then return -2; end if;
  update velcrafting_private.engagement set status=stage,next_action=nullif(btrim(next_step),''),
    status_version=status_version+1 where id=target and status_version=expected returning status_version into updated;
  if not found then return -2; end if;
  insert into velcrafting_private.workspace_progress_event(engagement_id,version,status,next_action,actor)
    values(target,updated,stage,nullif(btrim(next_step),''),actor_id);
  return updated;
end;
$$;
revoke all on function velcrafting_private.update_workspace_progress(uuid,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function velcrafting_private.update_workspace_progress(uuid,integer,text,text) to authenticated;

create function velcrafting_private.save_workspace_draft(target uuid, item uuid, expected integer, kind text, heading text, content jsonb, commercial jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid := auth.uid(); current_version integer; current_kind text;
begin
  if not coalesce(velcrafting_private.staff_has(actor,target,'draft'),false) then return -1; end if;
  if commercial is not null and not coalesce(velcrafting_private.staff_has(actor,target,'issue'),false) then return -1; end if;
  perform 1 from velcrafting_private.engagement where id=target for update;
  if not found then return -1; end if;
  select version,stage into current_version,current_kind from velcrafting_private.workspace_draft
    where engagement_id=target and item_id=item order by version desc limit 1;
  if coalesce(current_version,0)<>expected or (current_kind is not null and current_kind<>kind) then return -2; end if;
  insert into velcrafting_private.workspace_draft (engagement_id,item_id,version,stage,title,body,terms,author)
    values(target,item,expected+1,kind,heading,content,commercial,actor);
  return expected+1;
end;
$$;

create function velcrafting_private.publish_workspace_draft(target uuid,item uuid,candidate integer,expected_published integer,retry uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare actor_id uuid := auth.uid(); d velcrafting_private.workspace_draft%rowtype; prior integer;
declare receipt velcrafting_private.workspace_publication%rowtype;
begin
  if not coalesce(velcrafting_private.staff_has(actor_id,target,'publish'),false) then return -1; end if;
  perform 1 from velcrafting_private.engagement where id=target for update;
  if not found then return -1; end if;
  select * into receipt from velcrafting_private.workspace_publication p where p.actor=actor_id and p.retry_key=retry;
  if found then
    if (receipt.engagement_id,receipt.item_id,receipt.version,receipt.prior_version)
      = (target,item,candidate,expected_published) then return receipt.version; end if;
    return -2;
  end if;
  select * into d from velcrafting_private.workspace_draft where engagement_id=target and item_id=item order by version desc limit 1;
  if not found or d.version<>candidate then return -2; end if;
  if (d.stage in ('quote','proposal') or d.terms is not null)
    and not coalesce(velcrafting_private.staff_has(actor_id,target,'issue'),false) then return -1; end if;
  select coalesce(max(version),0) into prior from velcrafting_private.published_revision where engagement_id=target and item_id=item;
  if prior<>expected_published or candidate<=prior then return -2; end if;
  insert into velcrafting_private.published_revision(engagement_id,item_id,version,title,body,published_by)
    values(target,item,candidate,d.title,d.body||jsonb_build_object('stage',d.stage),actor_id);
  if d.terms is not null then
    insert into velcrafting_private.issued_terms values(target,item,candidate,d.terms);
  end if;
  insert into velcrafting_private.workspace_publication(actor,retry_key,engagement_id,item_id,version,prior_version)
    values(actor_id,retry,target,item,candidate,prior);
  return candidate;
end;
$$;

create table velcrafting_private.workspace_file (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null,
  item_id uuid not null,
  version integer not null,
  commercial boolean not null default false,
  filename text not null check (length(filename) between 1 and 180),
  media_type text not null check (media_type in ('application/pdf','text/plain','text/markdown')),
  bytes bytea not null check (octet_length(bytes) between 1 and 5000000),
  sha256 text generated always as (encode(sha256(bytes),'hex')) stored,
  foreign key(engagement_id,item_id,version) references velcrafting_private.published_revision
);
alter table velcrafting_private.workspace_file enable row level security;
grant select on velcrafting_private.workspace_file to authenticated;
create policy authorized_workspace_files on velcrafting_private.workspace_file for select to authenticated using (
  exists(select 1 from velcrafting_private.engagement_grant g
    where g.engagement_id=workspace_file.engagement_id and (not workspace_file.commercial or g.commercial))
);
create trigger workspace_file_immutable before update or delete on velcrafting_private.workspace_file
  for each row execute function velcrafting_private.deny_snapshot_change();

create function velcrafting_private.store_workspace_file(target uuid,item uuid,revision integer,asset_name text,
  asset_type text,content bytea,restricted boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare asset_id uuid;
begin
  if not coalesce(velcrafting_private.staff_has(auth.uid(),target,'publish'),false) or
    (restricted and not coalesce(velcrafting_private.staff_has(auth.uid(),target,'issue'),false)) then return null; end if;
  if not exists(select 1 from velcrafting_private.published_revision p where
    (p.engagement_id,p.item_id,p.version)=(target,item,revision)) then return null; end if;
  insert into velcrafting_private.workspace_file(engagement_id,item_id,version,commercial,filename,media_type,bytes)
    values(target,item,revision,restricted,asset_name,asset_type,content) returning id into asset_id;
  return asset_id;
end;
$$;
revoke all on function velcrafting_private.store_workspace_file(uuid,uuid,integer,text,text,bytea,boolean)
  from public,anon,authenticated,service_role;
grant execute on function velcrafting_private.store_workspace_file(uuid,uuid,integer,text,text,bytea,boolean) to authenticated;

create policy assigned_staff_publications on velcrafting_private.published_revision for select to authenticated using (
  exists(select 1 from velcrafting_private.staff_access a where a.engagement_id=published_revision.engagement_id
    and a.capability in ('draft','publish','issue','record_agreement'))
);
create policy assigned_staff_terms on velcrafting_private.issued_terms for select to authenticated using (
  exists(select 1 from velcrafting_private.staff_access a where a.engagement_id=issued_terms.engagement_id and a.capability='issue')
);

create function velcrafting_private.read_workspace_draft_terms(target uuid)
returns table(item uuid, version integer, terms text)
language sql stable security definer set search_path=pg_catalog as $$
  select d.item_id,d.version,d.terms->>'text'
  from velcrafting_private.workspace_draft d where d.engagement_id=target and d.terms is not null
    and velcrafting_private.staff_has(auth.uid(),target,'issue')
$$;

-- Approval authority is independently provisioned and scoped to an engagement.
create table velcrafting_private.approval_authority (
  id uuid primary key,
  engagement_id uuid not null references velcrafting_private.engagement,
  authorized_name text not null,
  organization text not null,
  authority_basis text not null,
  valid_from timestamptz not null,
  ends_at timestamptz,
  revoked_at timestamptz,
  unique (engagement_id,id)
);
alter table velcrafting_private.approval_authority enable row level security;

create table velcrafting_private.workspace_agreement (
  engagement_id uuid not null,
  item_id uuid not null,
  version integer not null,
  authority_id uuid not null,
  accepted_at timestamptz not null,
  evidence_ref text not null check (length(evidence_ref) between 5 and 1000),
  recorded_by uuid not null references velcrafting_private.profile,
  recorded_at timestamptz not null default clock_timestamp(),
  parent_item uuid,
  parent_version integer,
  primary key(engagement_id,item_id,version),
  foreign key(engagement_id,authority_id) references velcrafting_private.approval_authority(engagement_id,id),
  foreign key(engagement_id,item_id,version) references velcrafting_private.published_revision,
  foreign key(engagement_id,parent_item,parent_version) references velcrafting_private.workspace_agreement,
  check ((parent_item is null) = (parent_version is null))
);
create unique index agreement_single_root on velcrafting_private.workspace_agreement (engagement_id) where parent_item is null;
create unique index agreement_one_successor on velcrafting_private.workspace_agreement (engagement_id,parent_item,parent_version) where parent_item is not null;
alter table velcrafting_private.workspace_agreement enable row level security;
grant select (engagement_id,item_id,version,recorded_at,parent_item,parent_version) on velcrafting_private.workspace_agreement to authenticated;
create policy accepted_projection on velcrafting_private.workspace_agreement for select to authenticated using (
  exists(select 1 from velcrafting_private.engagement e where e.id=workspace_agreement.engagement_id)
);
create trigger agreement_immutable before update or delete on velcrafting_private.workspace_agreement
  for each row execute function velcrafting_private.deny_snapshot_change();

create function velcrafting_private.record_workspace_agreement(target uuid,item uuid,candidate integer,authority uuid,
  agreed_at timestamptz,evidence text,previous_item uuid,previous_version integer)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid := auth.uid(); current_item uuid; current_version integer; last_accepted_at timestamptz;
begin
  if not coalesce(velcrafting_private.staff_has(actor,target,'record_agreement'),false) or
    agreed_at is null or agreed_at > clock_timestamp() then return false; end if;
  perform 1 from velcrafting_private.engagement where id=target for update;
  if not exists(select 1 from velcrafting_private.approval_authority a
    where a.engagement_id=target and a.id=authority and a.valid_from<=agreed_at
      and (a.ends_at is null or a.ends_at>agreed_at)
      and (a.revoked_at is null or a.revoked_at>agreed_at)) or not exists(
    select 1 from velcrafting_private.published_revision p
    where p.engagement_id=target and p.item_id=item and p.version=candidate and p.body->>'stage'='proposal'
      and p.published_at<=agreed_at) then return false; end if;
  select a.item_id,a.version,a.accepted_at into current_item,current_version,last_accepted_at
    from velcrafting_private.workspace_agreement a where a.engagement_id=target
      and not exists(select 1 from velcrafting_private.workspace_agreement newer
        where newer.engagement_id=target and (newer.parent_item,newer.parent_version)=(a.item_id,a.version));
  if (current_item,current_version) is distinct from (previous_item,previous_version)
    or (last_accepted_at is not null and last_accepted_at>=agreed_at) then return false; end if;
  insert into velcrafting_private.workspace_agreement
    (engagement_id,item_id,version,authority_id,accepted_at,evidence_ref,recorded_by,parent_item,parent_version)
    values(target,item,candidate,authority,agreed_at,evidence,actor,previous_item,previous_version);
  return true;
end;
$$;

-- A restricted runtime can invoke the ledger transitions, without scanning raw payloads.
alter function velcrafting_private.prepare_ai_attempt(uuid,uuid,text,text,integer,text,text,uuid,timestamptz) security definer;
alter function velcrafting_private.claim_ai_dispatch(uuid,uuid) security definer;
alter function velcrafting_private.record_ai_response(uuid,uuid,jsonb) security definer;
alter function velcrafting_private.mark_ai_attempt_unknown(uuid,uuid,text) security definer;
alter function velcrafting_private.finish_ai_attempt(uuid,uuid,text) security definer;
grant execute on function velcrafting_private.prepare_ai_attempt(uuid,uuid,text,text,integer,text,text,uuid,timestamptz),
  velcrafting_private.claim_ai_dispatch(uuid,uuid),velcrafting_private.record_ai_response(uuid,uuid,jsonb),
  velcrafting_private.mark_ai_attempt_unknown(uuid,uuid,text),velcrafting_private.finish_ai_attempt(uuid,uuid,text)
  to velcrafting_runtime;

create function velcrafting_private.ai_maintenance_candidates(batch_size integer)
returns table(session_id uuid) language sql stable security definer set search_path=pg_catalog as $$
  select candidates.session_id from (
    select c.session_id from velcrafting_private.ai_content c where c.body is not null and c.expires_at<=clock_timestamp()
    union
    select a.session_id from velcrafting_private.ai_call_attempt a where a.closed_at is null
      and (a.lease_expires_at<=clock_timestamp() or
        (a.dispatch_claimed_at is null and a.reserved_day<>(clock_timestamp() at time zone 'UTC')::date))
  ) candidates order by candidates.session_id limit least(100,greatest(1,batch_size))
$$;

create function velcrafting_private.maintain_ai_session(target uuid)
returns table(payloads_expired integer, recovered boolean)
language sql security definer set search_path=pg_catalog as $$
  select velcrafting_private.expire_ai_payloads(target),velcrafting_private.recover_ai_attempts(target)
$$;
revoke all on function velcrafting_private.ai_maintenance_candidates(integer),
  velcrafting_private.maintain_ai_session(uuid) from public,anon,authenticated,service_role;
grant execute on function velcrafting_private.ai_maintenance_candidates(integer),
  velcrafting_private.maintain_ai_session(uuid) to velcrafting_runtime;

create function velcrafting_private.read_explorer_conversation(target uuid)
returns table (id uuid, role text, body text)
language sql security definer stable set search_path=pg_catalog as $$
  select messages.id, messages.role, messages.body from (
    select c.id, case when c.kind='submitted' then 'user' else 'assistant' end as role, c.body, c.created_at
    from velcrafting_private.ai_content c join velcrafting_private.explorer_session s on s.id=c.session_id
    where c.session_id=target and c.kind in ('submitted','output') and c.body is not null
      and c.expires_at>clock_timestamp() and s.expires_at>clock_timestamp() and s.invalidated_at is null
    order by c.created_at desc,c.id desc limit 16
  ) messages order by messages.created_at,messages.id
$$;
create function velcrafting_private.explorer_output_id(target uuid, operation uuid)
returns uuid language sql stable security definer set search_path=pg_catalog as $$
  select a.output_id from velcrafting_private.ai_call_attempt a
  join velcrafting_private.ai_content c on c.id=a.output_id and c.session_id=a.session_id
  where a.session_id=target and a.operation_id=operation and c.body is not null
    and c.expires_at>clock_timestamp() order by a.sequence desc limit 1
$$;
create function velcrafting_private.read_explorer_model_source(target uuid, source_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select c.body from velcrafting_private.ai_content c
  join velcrafting_private.ai_call_attempt a on a.session_id=c.session_id and a.output_id=c.id
  join velcrafting_private.explorer_session s on s.id=c.session_id
  where c.session_id=target and c.id=source_id and c.kind='output'
    and c.expires_at>clock_timestamp() and s.expires_at>clock_timestamp() and s.invalidated_at is null
$$;
revoke all on function velcrafting_private.read_explorer_model_source(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function velcrafting_private.read_explorer_model_source(uuid,uuid) to velcrafting_runtime;
revoke all on function velcrafting_private.explorer_output_id(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function velcrafting_private.explorer_output_id(uuid,uuid) to velcrafting_runtime;
revoke all on function velcrafting_private.read_explorer_conversation(uuid) from public,anon,authenticated,service_role;
grant execute on function velcrafting_private.read_explorer_conversation(uuid) to velcrafting_runtime;

revoke all on function velcrafting_private.take_auth_allowance(text,text,text,uuid),
  velcrafting_private.claim_prospect(uuid,uuid,text),
  velcrafting_private.save_brief_revision(uuid,uuid,integer,jsonb),
  velcrafting_private.staff_has(uuid,uuid,text),
  velcrafting_private.save_workspace_draft(uuid,uuid,integer,text,text,jsonb,jsonb),
  velcrafting_private.publish_workspace_draft(uuid,uuid,integer,integer,uuid),
  velcrafting_private.read_workspace_draft_terms(uuid),
  velcrafting_private.record_workspace_agreement(uuid,uuid,integer,uuid,timestamptz,text,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function velcrafting_private.take_auth_allowance(text,text,text,uuid),
  velcrafting_private.claim_prospect(uuid,uuid,text),
  velcrafting_private.save_brief_revision(uuid,uuid,integer,jsonb) to velcrafting_runtime;
grant execute on function velcrafting_private.save_workspace_draft(uuid,uuid,integer,text,text,jsonb,jsonb),
  velcrafting_private.publish_workspace_draft(uuid,uuid,integer,integer,uuid),
  velcrafting_private.read_workspace_draft_terms(uuid),
  velcrafting_private.record_workspace_agreement(uuid,uuid,integer,uuid,timestamptz,text,uuid,integer) to authenticated;

commit;
