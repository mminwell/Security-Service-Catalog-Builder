-- Security Service Catalog Builder — V5.
-- Repeatable where noted. Invitations, Admin workspace creation, and tighter grants.
-- Apply after 0008_v4_artifacts.sql. This file has no credentials.
-- The first account on an empty project becomes Admin of Starter Workspace.
-- Later accounts join only through an invitation or an existing membership.
-- A platform owner (an existing operator role) can still reach every workspace.

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  role text not null check (role in ('tenant_admin', 'editor', 'viewer')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint workspace_invitations_email_lower check (email = lower(email))
);

create unique index if not exists workspace_invitations_pending_email
  on public.workspace_invitations (tenant_id, email)
  where accepted_at is null;

create index if not exists workspace_invitations_email_idx
  on public.workspace_invitations (email);

comment on table public.workspace_invitations is
  'Pending Viewer, Editor, and Admin invites. Accepted when that email signs in. No service-role key is required.';

alter table public.workspace_invitations enable row level security;
alter table public.workspace_invitations force row level security;

drop policy if exists invitations_select on public.workspace_invitations;
create policy invitations_select on public.workspace_invitations
  for select to authenticated
  using (accepted_at is null and public.can_admin_tenant(tenant_id));

revoke all on table public.workspace_invitations from anon, public;
grant select on table public.workspace_invitations to authenticated;

revoke insert, update, delete on table public.audit_log from authenticated;

create or replace function public.apply_artifact_computeds()
returns trigger
language plpgsql
set search_path = public
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
set search_path = public
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

create or replace function public.provision_tenant(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (
    public.is_platform_owner()
    or exists (
      select 1
      from public.tenant_members
      where user_id = auth.uid()
        and role = 'tenant_admin'
    )
  ) then
    raise exception 'Only an Admin can create a workspace';
  end if;
  return public.provision_tenant_internal(p_name, p_slug, auth.uid(), 'tenant_admin');
end;
$$;

create or replace function public.ensure_practitioner_access()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_existing uuid;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(481001);

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or length(trim(v_email)) = 0 then
    raise exception 'Authentication required';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  select i.tenant_id, v_uid, i.role
  from public.workspace_invitations i
  where i.accepted_at is null
    and i.email = v_email
  on conflict (tenant_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
  set accepted_at = now()
  where accepted_at is null
    and email = v_email;

  select tenant_id into v_existing
  from public.tenant_members
  where user_id = v_uid
  order by created_at
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  if exists (select 1 from public.tenant_members) then
    raise exception 'No workspace membership for this account. An Admin must invite you.';
  end if;

  v_slug := 'starter-workspace';
  if exists (select 1 from public.tenants where slug = v_slug) then
    v_slug := 'starter-workspace-' || substr(replace(v_uid::text, '-', ''), 1, 8);
  end if;

  return public.provision_tenant_internal('Starter Workspace', v_slug, v_uid, 'tenant_admin');
end;
$$;

create or replace function public.load_starter_sample_services(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant_id) then
    raise exception 'Only an Admin can load the sample catalog';
  end if;
  if exists (select 1 from public.services where tenant_id = p_tenant_id) then
    raise exception 'The sample catalog can only be loaded into an empty workspace';
  end if;

  insert into public.services (
    tenant_id, service_code, name, internal_name, category, status, service_tier, summary, description,
    in_scope, out_of_scope, deliverables, prerequisites, owner_team, delivery_team, business_unit,
    service_owner, delivery_model, target_audience, intake_method, intake_url, approval_required, approver,
    lead_time, support_contact, hours_of_coverage, sla_response_target, sla_resolution_target,
    primary_csf_function, capability_rating, threats_addressed, data_classification_handled, kpis_and_metrics,
    current_maturity_cmmi, target_maturity_cmmi, known_gaps_or_risks, third_party_providers, cost_model,
    cost_or_effort_notes, current_tooling_notes, internal_notes, review_cadence, last_reviewed_date
  )
  select
    p_tenant_id, service_code, name, internal_name, category, status, service_tier, summary, description,
    in_scope, out_of_scope, deliverables, prerequisites, owner_team, delivery_team, business_unit,
    service_owner, delivery_model, target_audience, intake_method, intake_url, approval_required, approver,
    lead_time, support_contact, hours_of_coverage, sla_response_target, sla_resolution_target,
    primary_csf_function, capability_rating, threats_addressed, data_classification_handled, kpis_and_metrics,
    current_maturity_cmmi, target_maturity_cmmi, known_gaps_or_risks, third_party_providers, cost_model,
    cost_or_effort_notes, current_tooling_notes, internal_notes, review_cadence, last_reviewed_date
  from public.starter_service_templates
  order by service_code;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.add_tenant_member(uuid, text, text);

create function public.add_tenant_member(p_tenant uuid, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can invite members';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 320 then
    raise exception 'Enter a valid email address';
  end if;
  if p_role not in ('tenant_admin', 'editor', 'viewer', 'platform_owner') then
    raise exception 'Unknown role';
  end if;
  if p_role = 'platform_owner' and not public.is_platform_owner() then
    raise exception 'Only a platform owner can grant platform owner';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    if p_role = 'platform_owner' then
      raise exception 'That person needs an account before they can be a platform owner.';
    end if;
    insert into public.workspace_invitations (tenant_id, email, role, invited_by)
    values (p_tenant, v_email, p_role, auth.uid())
    on conflict (tenant_id, email) where accepted_at is null
    do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now()
    returning id into v_id;
    return jsonb_build_object('status', 'invited', 'id', v_id);
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (p_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role
  returning id into v_id;

  return jsonb_build_object('status', 'member', 'id', v_id);
end;
$$;

revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;

revoke all on function public.provision_tenant(text, text) from public, anon;
revoke all on function public.ensure_practitioner_access() from public, anon;
revoke all on function public.load_starter_sample_services(uuid) from public, anon;
grant execute on function public.provision_tenant(text, text) to authenticated;
grant execute on function public.ensure_practitioner_access() to authenticated;
grant execute on function public.load_starter_sample_services(uuid) to authenticated;
