-- Development candidate. Keep this schema outside the Supabase Data API.
begin;

create schema velcrafting_private;
revoke all on schema velcrafting_private from public;

create table velcrafting_private.profile (
  user_id uuid primary key references auth.users(id),
  disabled_at timestamptz
);

create table velcrafting_private.client (
  id uuid primary key,
  name text not null
);

create table velcrafting_private.project (
  id uuid primary key,
  client_id uuid not null references velcrafting_private.client,
  title text not null,
  unique (client_id, id)
);

create table velcrafting_private.engagement (
  id uuid primary key,
  client_id uuid not null,
  project_id uuid not null,
  title text not null,
  unique (client_id, id),
  foreign key (client_id, project_id) references velcrafting_private.project (client_id, id)
);

create table velcrafting_private.client_membership (
  client_id uuid not null references velcrafting_private.client,
  user_id uuid not null references velcrafting_private.profile,
  granted_by uuid not null references velcrafting_private.profile,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (client_id, user_id)
);

create table velcrafting_private.engagement_grant (
  client_id uuid not null,
  engagement_id uuid not null,
  user_id uuid not null,
  commercial boolean not null default false,
  granted_by uuid not null references velcrafting_private.profile,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (engagement_id, user_id),
  foreign key (client_id, engagement_id) references velcrafting_private.engagement (client_id, id),
  foreign key (client_id, user_id) references velcrafting_private.client_membership (client_id, user_id)
);

create function velcrafting_private.revoke_engagement_grants() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  update velcrafting_private.engagement_grant
    set revoked_at = new.revoked_at
    where client_id = new.client_id and user_id = new.user_id and revoked_at is null;
  return new;
end;
$$;

create trigger membership_revocation after update of revoked_at on velcrafting_private.client_membership
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function velcrafting_private.revoke_engagement_grants();

create table velcrafting_private.published_revision (
  engagement_id uuid not null references velcrafting_private.engagement,
  item_id uuid not null,
  version integer not null check (version > 0),
  title text not null,
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  published_at timestamptz not null default now(),
  published_by uuid not null references velcrafting_private.profile,
  primary key (engagement_id, item_id, version)
);

-- Only issued terms appear here. Drafts and private evidence need separate records.
create table velcrafting_private.issued_terms (
  engagement_id uuid not null,
  item_id uuid not null,
  version integer not null,
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  primary key (engagement_id, item_id, version),
  foreign key (engagement_id, item_id, version)
    references velcrafting_private.published_revision (engagement_id, item_id, version)
);

create function velcrafting_private.deny_snapshot_change() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Published snapshots are append-only' using errcode = '55000';
end;
$$;

create trigger published_revision_immutable before update or delete on velcrafting_private.published_revision
  for each row execute function velcrafting_private.deny_snapshot_change();
create trigger issued_terms_immutable before update or delete on velcrafting_private.issued_terms
  for each row execute function velcrafting_private.deny_snapshot_change();

alter table velcrafting_private.profile enable row level security;
alter table velcrafting_private.client enable row level security;
alter table velcrafting_private.project enable row level security;
alter table velcrafting_private.engagement enable row level security;
alter table velcrafting_private.client_membership enable row level security;
alter table velcrafting_private.engagement_grant enable row level security;
alter table velcrafting_private.published_revision enable row level security;
alter table velcrafting_private.issued_terms enable row level security;

create policy current_profile on velcrafting_private.profile for select to authenticated
  using (user_id = (select auth.uid()) and disabled_at is null);

create policy current_membership on velcrafting_private.client_membership for select to authenticated
  using (
    user_id = (select auth.uid()) and revoked_at is null
    and exists (select 1 from velcrafting_private.profile p where p.user_id = client_membership.user_id)
  );

create policy current_engagement_grant on velcrafting_private.engagement_grant for select to authenticated
  using (
    user_id = (select auth.uid()) and revoked_at is null
    and exists (
      select 1 from velcrafting_private.client_membership m
      where m.client_id = engagement_grant.client_id and m.user_id = engagement_grant.user_id
    )
  );

create policy granted_engagement on velcrafting_private.engagement for select to authenticated
  using (exists (select 1 from velcrafting_private.engagement_grant g where g.engagement_id = engagement.id));

create policy granted_publication on velcrafting_private.published_revision for select to authenticated
  using (exists (select 1 from velcrafting_private.engagement_grant g where g.engagement_id = published_revision.engagement_id));

create policy granted_commercial_terms on velcrafting_private.issued_terms for select to authenticated
  using (exists (
    select 1 from velcrafting_private.engagement_grant g where g.engagement_id = issued_terms.engagement_id and g.commercial
  ));

revoke all on all tables in schema velcrafting_private from public, anon, authenticated, service_role;
revoke all on all functions in schema velcrafting_private from public, anon, authenticated, service_role;
grant usage on schema velcrafting_private to authenticated;
grant select (user_id) on velcrafting_private.profile to authenticated;
grant select (client_id, user_id) on velcrafting_private.client_membership to authenticated;
grant select (engagement_id, commercial) on velcrafting_private.engagement_grant to authenticated;
grant select on velcrafting_private.engagement, velcrafting_private.issued_terms to authenticated;
grant select (engagement_id, item_id, version, title, body, published_at) on velcrafting_private.published_revision to authenticated;

commit;
