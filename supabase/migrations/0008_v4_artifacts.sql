-- Supporting artifacts: policies, standards, procedures, and tools linked to services.
-- Types and statuses are lookup_options, copied onto each workspace.
-- Apply after 0007_v3_public_defaults.sql. This file has no credentials and no sample rows.

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  artifact_type text not null,
  owner_team text,
  status text,
  version text,
  review_cadence text,
  last_reviewed_date date,
  next_review_date date,
  link_url text,
  description text,
  visibility text not null default 'internal',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artifacts_name_len check (char_length(btrim(name)) between 1 and 160),
  constraint artifacts_version_len check (version is null or char_length(version) <= 40),
  constraint artifacts_description_len check (description is null or char_length(description) <= 500),
  constraint artifacts_visibility_check check (visibility in ('public', 'internal')),
  constraint artifacts_link_http check (
    link_url is null
    or (
      char_length(link_url) <= 2000
      and link_url ~ '^https?://[^[:space:]]+$'
    )
  )
);

create index artifacts_tenant_idx on public.artifacts (tenant_id, name);

create table public.artifact_service_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  relationship_note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint artifact_links_note_len check (relationship_note is null or char_length(relationship_note) <= 500)
);

create unique index artifact_service_links_pair_uidx
  on public.artifact_service_links (artifact_id, service_id);

create index artifact_service_links_service_idx
  on public.artifact_service_links (tenant_id, service_id);

create index artifact_service_links_artifact_idx
  on public.artifact_service_links (tenant_id, artifact_id);

create or replace function public.apply_artifact_computeds()
returns trigger
language plpgsql
as $$
begin
  if new.last_reviewed_date is null or new.review_cadence is null or new.review_cadence = 'on_change' then
    new.next_review_date := null;
  elsif new.review_cadence = 'monthly' then
    new.next_review_date := (new.last_reviewed_date + interval '1 month')::date;
  elsif new.review_cadence = 'quarterly' then
    new.next_review_date := (new.last_reviewed_date + interval '3 months')::date;
  elsif new.review_cadence = 'semi_annual' then
    new.next_review_date := (new.last_reviewed_date + interval '6 months')::date;
  elsif new.review_cadence = 'annual' then
    new.next_review_date := (new.last_reviewed_date + interval '1 year')::date;
  else
    new.next_review_date := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.assert_artifact_link_tenant()
returns trigger
language plpgsql
as $$
declare
  v_artifact uuid;
  v_service uuid;
begin
  select tenant_id into v_artifact from public.artifacts where id = new.artifact_id;
  select tenant_id into v_service from public.services where id = new.service_id;
  if v_artifact is null or v_service is null or v_artifact <> new.tenant_id or v_service <> new.tenant_id then
    raise exception 'Artifact links stay inside one workspace';
  end if;
  return new;
end;
$$;

create trigger trg_a_artifact_compute
  before insert or update on public.artifacts
  for each row execute function public.apply_artifact_computeds();

create trigger trg_b_artifact_audit
  before insert or update or delete on public.artifacts
  for each row execute function public.write_audit();

create trigger trg_a_artifact_link_tenant
  before insert or update on public.artifact_service_links
  for each row execute function public.assert_artifact_link_tenant();

create trigger trg_b_artifact_link_audit
  before insert or update or delete on public.artifact_service_links
  for each row execute function public.write_audit();

alter table public.artifacts enable row level security;
alter table public.artifact_service_links enable row level security;
alter table public.artifacts force row level security;
alter table public.artifact_service_links force row level security;

create policy artifacts_select on public.artifacts
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy artifacts_insert on public.artifacts
  for insert to authenticated
  with check (public.can_write_services(tenant_id));

create policy artifacts_update on public.artifacts
  for update to authenticated
  using (public.can_write_services(tenant_id))
  with check (public.can_write_services(tenant_id));

create policy artifacts_delete on public.artifacts
  for delete to authenticated
  using (public.can_admin_tenant(tenant_id));

create policy artifact_links_select on public.artifact_service_links
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy artifact_links_insert on public.artifact_service_links
  for insert to authenticated
  with check (public.can_write_services(tenant_id));

create policy artifact_links_update on public.artifact_service_links
  for update to authenticated
  using (public.can_write_services(tenant_id))
  with check (public.can_write_services(tenant_id));

create policy artifact_links_delete on public.artifact_service_links
  for delete to authenticated
  using (public.can_write_services(tenant_id));

revoke all on table public.artifacts, public.artifact_service_links from anon, public;
grant select, insert, update, delete on table public.artifacts, public.artifact_service_links to authenticated;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
  (null, $sscb$artifact_type$sscb$, $sscb$policy$sscb$, $sscb$Policy$sscb$, $sscb$A management statement of what the organization requires.$sscb$, null, 10, true),
  (null, $sscb$artifact_type$sscb$, $sscb$standard$sscb$, $sscb$Standard$sscb$, $sscb$Mandatory rules that make a policy specific enough to follow.$sscb$, null, 20, true),
  (null, $sscb$artifact_type$sscb$, $sscb$procedure$sscb$, $sscb$Procedure / Runbook$sscb$, $sscb$Steps a person or team follows. Includes runbooks and playbooks.$sscb$, null, 30, true),
  (null, $sscb$artifact_type$sscb$, $sscb$tool$sscb$, $sscb$Tool$sscb$, $sscb$A product or system the service uses. The link opens the tool or its record.$sscb$, null, 40, true),
  (null, $sscb$artifact_type$sscb$, $sscb$guideline$sscb$, $sscb$Guideline$sscb$, $sscb$Recommended practice. Not mandatory the way a standard is. Retire this option if the workspace does not use guidelines.$sscb$, null, 50, true),
  (null, $sscb$artifact_status$sscb$, $sscb$draft$sscb$, $sscb$Draft$sscb$, $sscb$Started, and not yet in force.$sscb$, null, 10, true),
  (null, $sscb$artifact_status$sscb$, $sscb$active$sscb$, $sscb$Active$sscb$, $sscb$In force and expected to be current.$sscb$, null, 20, true),
  (null, $sscb$artifact_status$sscb$, $sscb$under_review$sscb$, $sscb$Under Review$sscb$, $sscb$Being revised. Still the version people should use until it is replaced.$sscb$, null, 30, true),
  (null, $sscb$artifact_status$sscb$, $sscb$retired$sscb$, $sscb$Retired$sscb$, $sscb$No longer in force. A link that remains is a stale-documentation flag, not a recommendation.$sscb$, null, 40, true)
on conflict (field_key, code) where tenant_id is null do nothing;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
)
select t.id, s.field_key, s.code, s.label, s.description, s.code_prefix, s.sort_order, s.is_active
from public.tenants t
join public.lookup_options s
  on s.tenant_id is null
 and s.field_key in ($sscb$artifact_type$sscb$, $sscb$artifact_status$sscb$)
where not exists (
  select 1
  from public.lookup_options existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
    and existing.code = s.code
);
