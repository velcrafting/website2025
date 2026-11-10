-- Bootstrap a named provisioner only through a separately authorized database action.
begin;

alter table velcrafting_private.engagement
  add column workflow_template text check (workflow_template in (
    'review-decision', 'prototype-software', 'workflow-ai-integration', 'communications-knowledge')),
  add column workflow_version text,
  add check ((workflow_template is null) = (workflow_version is null));

create table velcrafting_private.workspace_provisioner (
  user_id uuid primary key references velcrafting_private.profile,
  assigned_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
alter table velcrafting_private.workspace_provisioner enable row level security;

create table velcrafting_private.workspace_provision_event (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references velcrafting_private.profile,
  engagement_id uuid not null references velcrafting_private.engagement,
  action text not null check (action in (
    'create', 'membership_grant', 'membership_revoke', 'engagement_grant', 'engagement_revoke')),
  subject uuid references velcrafting_private.profile,
  commercial boolean not null default false,
  retry_key uuid,
  request_digest bytea check (octet_length(request_digest) = 32),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (actor, retry_key),
  check ((action = 'create' and subject is null and retry_key is not null and request_digest is not null)
      or (action <> 'create' and subject is not null and retry_key is null and request_digest is null))
);
alter table velcrafting_private.workspace_provision_event enable row level security;
create trigger workspace_provision_event_immutable before update or delete on velcrafting_private.workspace_provision_event
  for each row execute function velcrafting_private.deny_snapshot_change();

create function velcrafting_private.can_workspace_provision() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from velcrafting_private.workspace_provisioner a
    join velcrafting_private.profile p on p.user_id = a.user_id
    where a.user_id = auth.uid() and a.revoked_at is null and p.disabled_at is null
  );
$$;

create function velcrafting_private.create_workspace_engagement(
  retry uuid, client_name text, project_title text, engagement_title text, template text, objective text
) returns table (engagement_id uuid, disposition text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor_id uuid := auth.uid();
  client_key uuid := gen_random_uuid();
  project_key uuid := gen_random_uuid();
  engagement_key uuid := gen_random_uuid();
  digest bytea;
  receipt velcrafting_private.workspace_provision_event%rowtype;
  discovery_prompt text;
begin
  -- A named row lock serializes duplicate submissions and assignment revocation.
  perform 1 from velcrafting_private.workspace_provisioner a
    join velcrafting_private.profile p on p.user_id = a.user_id
    where a.user_id = actor_id and a.revoked_at is null and p.disabled_at is null
    for update of a, p;
  if not found then
    return query select null::uuid, 'denied'::text;
    return;
  end if;
  discovery_prompt := case template
    when 'review-decision' then 'What decision should this work enable, and who owns it?'
    when 'prototype-software' then 'Which user journey and environment define completion?'
    when 'workflow-ai-integration' then 'What triggers the workflow, and where does human review happen?'
    when 'communications-knowledge' then 'Who is the audience, and what should they be able to do?'
  end;
  if retry is null or discovery_prompt is null or client_name is null or project_title is null
    or engagement_title is null or objective is null
    or length(btrim(client_name)) not between 1 and 180 or length(btrim(project_title)) not between 1 and 180
    or length(btrim(engagement_title)) not between 1 and 180 or length(btrim(objective)) not between 1 and 1800 then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;
  digest := sha256(convert_to(jsonb_build_array(
    btrim(client_name), btrim(project_title), btrim(engagement_title), template, btrim(objective))::text, 'UTF8'));
  select * into receipt from velcrafting_private.workspace_provision_event r
    where r.actor = actor_id and r.retry_key = retry;
  if found then
    if receipt.request_digest = digest then
      return query select receipt.engagement_id, 'duplicate'::text;
    else
      return query select null::uuid, 'conflict'::text;
    end if;
    return;
  end if;

  insert into velcrafting_private.client (id, name) values (client_key, btrim(client_name));
  insert into velcrafting_private.project (id, client_id, title) values (project_key, client_key, btrim(project_title));
  insert into velcrafting_private.engagement (id, client_id, project_id, title, status, objective, workflow_template, workflow_version)
    values (engagement_key, client_key, project_key, btrim(engagement_title), 'Discovery', btrim(objective), template, '0.1');
  insert into velcrafting_private.staff_access (user_id, engagement_id, capability)
    select actor_id, engagement_key, cap
    from unnest(array['draft', 'publish', 'issue', 'record_agreement', 'manage_access']) as cap;
  insert into velcrafting_private.workspace_draft (engagement_id, item_id, version, stage, title, body, author)
    values (engagement_key, gen_random_uuid(), 1, 'discovery', 'Discovery',
      jsonb_build_object('sections', jsonb_build_array(
        jsonb_build_object('label', 'Goals', 'text', btrim(objective)),
        jsonb_build_object('label', 'Open questions', 'text', discovery_prompt)
      )), actor_id);
  insert into velcrafting_private.workspace_provision_event (actor, engagement_id, action, retry_key, request_digest)
    values (actor_id, engagement_key, 'create', retry, digest);
  return query select engagement_key, 'created'::text;
end;
$$;

create function velcrafting_private.set_workspace_access(
  target uuid, subject_id uuid, operation text, commercial_access boolean
) returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor_id uuid := auth.uid();
  client_key uuid;
  changed boolean;
begin
  if target is null or subject_id is null or operation is null or commercial_access is null
    or operation not in ('membership_grant', 'membership_revoke', 'engagement_grant', 'engagement_revoke')
    or (commercial_access and operation <> 'engagement_grant') then return 'invalid'; end if;
  if actor_id is null or actor_id = subject_id then return 'denied'; end if;

  -- Serializes membership changes with engagement grants for the entire client.
  select c.id into client_key from velcrafting_private.engagement e
    join velcrafting_private.client c on c.id = e.client_id
    where e.id = target for update of c;
  if not found or not coalesce(velcrafting_private.staff_has(actor_id, target, 'manage_access'), false) then return 'denied'; end if;
  if commercial_access and not coalesce(velcrafting_private.staff_has(actor_id, target, 'issue'), false) then return 'denied'; end if;

  if operation = 'membership_grant' then
    -- A previously verified Auth identity is required. This never creates an Auth user.
    if not exists (select 1 from auth.users u where u.id = subject_id and u.email_confirmed_at is not null) then return 'denied'; end if;
    insert into velcrafting_private.profile (user_id) values (subject_id) on conflict (user_id) do nothing;
    if not exists (select 1 from velcrafting_private.profile p where p.user_id = subject_id and p.disabled_at is null) then return 'denied'; end if;
    insert into velcrafting_private.client_membership as m (client_id, user_id, granted_by)
      values (client_key, subject_id, actor_id)
      on conflict (client_id, user_id) do update
        set revoked_at = null, granted_by = actor_id, granted_at = clock_timestamp()
        where m.revoked_at is not null;
  elsif operation = 'membership_revoke' then
    if exists (
      select 1 from velcrafting_private.engagement_grant g
      where g.client_id = client_key and g.user_id = subject_id and g.revoked_at is null
        and not coalesce(velcrafting_private.staff_has(actor_id, g.engagement_id, 'manage_access'), false)
    ) then return 'denied'; end if;
    update velcrafting_private.client_membership m set revoked_at = clock_timestamp()
      where m.client_id = client_key and m.user_id = subject_id and m.revoked_at is null;
  elsif operation = 'engagement_grant' then
    if not exists (
      select 1 from velcrafting_private.client_membership m
      join velcrafting_private.profile p on p.user_id = m.user_id
      where m.client_id = client_key and m.user_id = subject_id and m.revoked_at is null and p.disabled_at is null
    ) then return 'membership_required'; end if;
    insert into velcrafting_private.engagement_grant as g (client_id, engagement_id, user_id, commercial, granted_by)
      values (client_key, target, subject_id, commercial_access, actor_id)
      on conflict (engagement_id, user_id) do update
        set revoked_at = null, commercial = commercial_access, granted_by = actor_id, granted_at = clock_timestamp()
        where g.revoked_at is not null or g.commercial is distinct from commercial_access;
  else
    update velcrafting_private.engagement_grant g set revoked_at = clock_timestamp()
      where g.engagement_id = target and g.user_id = subject_id and g.revoked_at is null;
  end if;
  changed := found;
  if changed then
    insert into velcrafting_private.workspace_provision_event (actor, engagement_id, action, subject, commercial)
      values (actor_id, target, operation, subject_id, commercial_access);
  end if;
  return case when changed then 'changed' else 'unchanged' end;
end;
$$;

revoke all on velcrafting_private.workspace_provisioner, velcrafting_private.workspace_provision_event
  from public, anon, authenticated, service_role, velcrafting_runtime;
revoke all on function velcrafting_private.can_workspace_provision(),
  velcrafting_private.create_workspace_engagement(uuid, text, text, text, text, text),
  velcrafting_private.set_workspace_access(uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role, velcrafting_runtime;
grant execute on function velcrafting_private.can_workspace_provision(),
  velcrafting_private.create_workspace_engagement(uuid, text, text, text, text, text),
  velcrafting_private.set_workspace_access(uuid, uuid, text, boolean) to authenticated;

commit;
