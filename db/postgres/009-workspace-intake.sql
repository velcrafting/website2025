begin;

create table velcrafting_private.prospect_conversion (
  actor uuid not null references velcrafting_private.profile,
  retry_key uuid not null,
  intent_id uuid not null,
  confirmation_version integer not null,
  booking_uid text not null references velcrafting_private.booking(uid),
  contact_id uuid not null,
  session_id uuid not null,
  brief_id uuid not null,
  brief_version integer not null,
  brief_sha256 text not null,
  engagement_id uuid not null,
  item_id uuid not null,
  draft_version integer not null check (draft_version = 1),
  imported_fields text[] not null check (cardinality(imported_fields) between 1 and 3),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (actor, retry_key),
  unique (intent_id, confirmation_version),
  foreign key (intent_id,confirmation_version) references velcrafting_private.booking_confirmation(intent_id,version),
  foreign key (session_id,contact_id) references velcrafting_private.prospect_contact(session_id,id),
  foreign key (session_id,brief_id,brief_version,brief_sha256)
    references velcrafting_private.brief_revision(session_id,brief_id,version,sha256),
  foreign key (engagement_id,item_id,draft_version) references velcrafting_private.workspace_draft(engagement_id,item_id,version)
);
alter table velcrafting_private.prospect_conversion enable row level security;
create trigger prospect_conversion_immutable before update or delete on velcrafting_private.prospect_conversion
  for each row execute function velcrafting_private.deny_snapshot_change();

-- Private helper. The exposed functions below return only review metadata or the three
-- visitor-stated Discovery fields. The raw brief is never a workspace query result.
create function velcrafting_private.workspace_intake_sources(selected uuid)
returns table (
  intent_id uuid, confirmation_version integer, booking_uid text, starts_at timestamptz, time_zone text,
  contact_id uuid, session_id uuid, brief_id uuid, brief_version integer, brief_sha256 text, snapshot jsonb
)
language sql stable set search_path=pg_catalog as $$
  select i.id,c.version,b.uid,b.starts_at,b.time_zone,c.contact_id,c.session_id,r.brief_id,r.version,r.sha256,r.snapshot
  from velcrafting_private.booking_intent i
  join velcrafting_private.booking_confirmation c on (c.intent_id,c.version,c.session_id)=(i.id,i.confirmation_version,i.session_id)
  join velcrafting_private.booking b on (b.intent_id,b.confirmation_version)=(c.intent_id,c.version)
  join velcrafting_private.prospect_contact p on (p.session_id,p.id)=(c.session_id,c.contact_id)
  join velcrafting_private.brief_revision r on (r.session_id,r.brief_id,r.version,r.sha256)=(c.session_id,c.brief_id,c.brief_version,c.brief_sha256)
  join auth.users u on u.id=auth.uid()
  join auth.users visitor_auth on visitor_auth.id=p.user_id
  where (selected is null or i.id=selected) and i.revoked_at is null
    and velcrafting_private.can_workspace_provision() and u.email_confirmed_at is not null
    and lower(btrim(u.email))=i.organizer and c.organizer=i.organizer and b.organizer=i.organizer
    and c.material='shared_for_booking' and p.revoked_at is null and p.verified_at is not null
    and c.visitor_email=p.verified_email and b.visitor_email=p.verified_email
    and visitor_auth.email_confirmed_at is not null and lower(btrim(visitor_auth.email))=p.verified_email
    and b.state='confirmed' and b.calendar_id is not null and b.event_uid is not null
    and jsonb_array_length(b.participants)=2 and b.participants @> jsonb_build_array(i.organizer,p.verified_email)
$$;

create function velcrafting_private.workspace_intake_fields(snapshot jsonb)
returns table (field text, label text, body text)
language sql immutable set search_path=pg_catalog as $$
  select key,heading,entry->>'text'
  from (values ('outcome','Goals'),('constraints','Constraints'),('questions','Open questions')) allowed(key,heading)
  cross join lateral (select snapshot->'fields'->key as entry) projected
  where entry->>'source'='visitor' and entry->>'confirmation'='stated'
    and jsonb_typeof(entry->'text')='string' and length(btrim(entry->>'text')) between 1 and 1800
    and length(entry->>'text')<=1800
$$;

create function velcrafting_private.list_workspace_intake()
returns table (intent_id uuid, booking_uid text, starts_at timestamptz, time_zone text, brief_version integer)
language sql stable security definer set search_path=pg_catalog as $$
  select s.intent_id,s.booking_uid,s.starts_at,s.time_zone,s.brief_version
  from velcrafting_private.workspace_intake_sources(null) s
  where exists (
    select 1 from velcrafting_private.staff_access a where a.user_id=auth.uid()
      and a.capability='draft' and a.revoked_at is null
  )
  order by s.starts_at desc,s.intent_id limit 50
$$;

create function velcrafting_private.review_workspace_intake(target uuid, selected uuid)
returns table (
  intent_id uuid, confirmation_version integer, booking_uid text, starts_at timestamptz, time_zone text,
  brief_id uuid, brief_version integer, brief_sha256 text, fields jsonb
)
language sql stable security definer set search_path=pg_catalog as $$
  select s.intent_id,s.confirmation_version,s.booking_uid,s.starts_at,s.time_zone,s.brief_id,s.brief_version,s.brief_sha256,
    coalesce((select jsonb_agg(jsonb_build_object('key',f.field,'label',f.label,'text',f.body))
      from velcrafting_private.workspace_intake_fields(s.snapshot) f),'[]'::jsonb)
  from velcrafting_private.workspace_intake_sources(selected) s
  where selected is not null and velcrafting_private.staff_has(auth.uid(),target,'draft')
$$;

create function velcrafting_private.convert_workspace_intake(
  target uuid, selected uuid, expected_confirmation integer, expected_booking text,
  expected_brief uuid, expected_revision integer, expected_sha256 text, selected_fields text[], retry uuid
) returns table (item_id uuid, disposition text)
language plpgsql security definer set search_path=pg_catalog as $$
declare
  subject uuid := auth.uid();
  source record;
  prior velcrafting_private.prospect_conversion%rowtype;
  fields text[];
  sections jsonb;
  draft_id uuid := gen_random_uuid();
begin
  if retry is null or target is null or selected is null or expected_confirmation is null or expected_confirmation < 1
    or expected_booking is null or expected_brief is null or expected_revision is null or expected_revision < 1
    or expected_sha256 is null or expected_sha256 !~ '^[a-f0-9]{64}$'
    or selected_fields is null or cardinality(selected_fields) not between 1 and 3 then
    return query select null::uuid,'invalid'::text; return;
  end if;

  -- Serialize duplicate commands, staff revocation, and booking state changes.
  perform 1 from velcrafting_private.workspace_provisioner a join velcrafting_private.profile p on p.user_id=a.user_id
    join auth.users u on u.id=a.user_id
    where a.user_id=subject and a.revoked_at is null and p.disabled_at is null and u.email_confirmed_at is not null
    for update of a,p,u;
  if not found then return query select null::uuid,'denied'::text; return; end if;
  perform 1 from velcrafting_private.staff_access a where a.user_id=subject and a.engagement_id=target
    and a.capability='draft' and a.revoked_at is null for update;
  if not found then return query select null::uuid,'denied'::text; return; end if;
  perform 1 from velcrafting_private.booking_intent i where i.id=selected and i.revoked_at is null for update;
  if not found then return query select null::uuid,'denied'::text; return; end if;
  perform 1 from velcrafting_private.booking b
    join velcrafting_private.booking_confirmation c on (c.intent_id,c.version)=(b.intent_id,b.confirmation_version)
    join velcrafting_private.prospect_contact p on (p.session_id,p.id)=(c.session_id,c.contact_id)
    join auth.users visitor_auth on visitor_auth.id=p.user_id
    where b.intent_id=selected and b.state='confirmed' for update of b,p,visitor_auth;
  if not found then return query select null::uuid,'denied'::text; return; end if;

  select * into source from velcrafting_private.workspace_intake_sources(selected);
  if not found then return query select null::uuid,'denied'::text; return; end if;
  if (source.confirmation_version,source.booking_uid,source.brief_id,source.brief_version,source.brief_sha256)
    is distinct from (expected_confirmation,expected_booking,expected_brief,expected_revision,expected_sha256) then
    return query select null::uuid,'conflict'::text; return;
  end if;

  select array_agg(f.field order by f.field),jsonb_agg(jsonb_build_object('label',f.label,'text',f.body) order by f.field)
    into fields,sections from velcrafting_private.workspace_intake_fields(source.snapshot) f
    where f.field=any(selected_fields);
  if fields is null or cardinality(fields)<>cardinality(selected_fields) then
    return query select null::uuid,'invalid'::text; return;
  end if;
  select * into prior from velcrafting_private.prospect_conversion a
    where (a.actor=subject and a.retry_key=retry)
      or (a.intent_id=selected and a.confirmation_version=expected_confirmation)
    order by (a.actor=subject and a.retry_key=retry) desc limit 1;
  if found then
    if (prior.actor,prior.intent_id,prior.confirmation_version,prior.booking_uid,prior.engagement_id,prior.imported_fields)
      is not distinct from (subject,selected,expected_confirmation,expected_booking,target,fields) then
      return query select prior.item_id,'duplicate'::text;
    else return query select null::uuid,'conflict'::text;
    end if;
    return;
  end if;

  insert into velcrafting_private.workspace_draft(engagement_id,item_id,version,stage,title,body,author)
    values(target,draft_id,1,'discovery','Discovery from booking · Brief v'||source.brief_version,
      jsonb_build_object('sections',sections),subject);
  insert into velcrafting_private.prospect_conversion(actor,retry_key,intent_id,confirmation_version,booking_uid,
    contact_id,session_id,brief_id,brief_version,brief_sha256,engagement_id,item_id,draft_version,imported_fields)
    values(subject,retry,selected,expected_confirmation,expected_booking,source.contact_id,source.session_id,
      source.brief_id,source.brief_version,source.brief_sha256,target,draft_id,1,fields);
  return query select draft_id,'created'::text;
end;
$$;

revoke all on velcrafting_private.prospect_conversion from public,anon,authenticated,service_role,velcrafting_runtime;
revoke all on function velcrafting_private.workspace_intake_sources(uuid),
  velcrafting_private.workspace_intake_fields(jsonb),velcrafting_private.list_workspace_intake(),
  velcrafting_private.review_workspace_intake(uuid,uuid),
  velcrafting_private.convert_workspace_intake(uuid,uuid,integer,text,uuid,integer,text,text[],uuid)
  from public,anon,authenticated,service_role,velcrafting_runtime;
grant execute on function velcrafting_private.list_workspace_intake(),velcrafting_private.review_workspace_intake(uuid,uuid),
  velcrafting_private.convert_workspace_intake(uuid,uuid,integer,text,uuid,integer,text,text[],uuid)
  to authenticated;

commit;
