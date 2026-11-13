-- Security Service Catalog Builder — V6 Phase 2, members and workspace settings.
-- Repeatable where noted. Apply after 0012_v6_user_profiles.sql. This file has no credentials.
--
-- Existing rows:
--   tenant_members.role values are unchanged. The check now also allows service_manager.
--   Pending workspace_invitations (accepted_at is null) receive expires_at = migration time
--   plus 7 days and a new random token, so an invite that was already waiting is not expired
--   by this migration. Accepted invitations are not modified.
--   tenants gain nullable distribution and export defaults. Existing workspaces keep null,
--   which means the built-in distribution wording and the export dialog's previous default.
--   owner_reminder_enabled is false on every existing workspace.
--   account_status starts empty. No account is deactivated.

alter table public.tenants
  add column if not exists distribution_public text,
  add column if not exists distribution_internal text,
  add column if not exists default_export_format text,
  add column if not exists default_export_profile_id uuid,
  add column if not exists owner_reminder_enabled boolean not null default false,
  add column if not exists owner_reminder_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_default_export_format_check'
  ) then
    alter table public.tenants
      add constraint tenants_default_export_format_check
      check (
        default_export_format is null
        or default_export_format in ('csv', 'xlsx', 'docx', 'pdf', 'json')
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_default_export_profile_fkey'
  ) then
    alter table public.tenants
      add constraint tenants_default_export_profile_fkey
      foreign key (default_export_profile_id) references public.export_profiles (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_distribution_public_len'
  ) then
    alter table public.tenants
      add constraint tenants_distribution_public_len
      check (distribution_public is null or char_length(distribution_public) between 1 and 240);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_distribution_internal_len'
  ) then
    alter table public.tenants
      add constraint tenants_distribution_internal_len
      check (distribution_internal is null or char_length(distribution_internal) between 1 and 240);
  end if;
end $$;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.tenant_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.tenant_members drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.tenant_members
  add constraint tenant_members_role_check
  check (role in ('platform_owner', 'tenant_admin', 'editor', 'viewer', 'service_manager'));

alter table public.workspace_invitations
  add column if not exists expires_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists token text;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.workspace_invitations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.workspace_invitations drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.workspace_invitations
  add constraint workspace_invitations_role_check
  check (role in ('tenant_admin', 'editor', 'viewer', 'service_manager'));

drop index if exists public.workspace_invitations_pending_email;
create unique index workspace_invitations_pending_email
  on public.workspace_invitations (tenant_id, email)
  where accepted_at is null and cancelled_at is null;

create unique index if not exists workspace_invitations_token_uidx
  on public.workspace_invitations (token)
  where token is not null;

update public.workspace_invitations
set
  expires_at = now() + interval '7 days',
  token = encode(gen_random_bytes(24), 'hex')
where accepted_at is null
  and cancelled_at is null
  and (expires_at is null or token is null);

create table if not exists public.account_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  deactivated_at timestamptz,
  deactivated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.account_status is
  'Absence of a row, or a null deactivated_at, means the account can sign in. Deactivation is reversible and does not delete memberships.';

alter table public.account_status enable row level security;
alter table public.account_status force row level security;

create or replace function public.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.account_status
      where user_id = auth.uid()
        and deactivated_at is not null
    );
$$;

create or replace function public.can_manage_site()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_is_active() and public.is_platform_owner();
$$;

drop policy if exists account_status_select on public.account_status;
create policy account_status_select on public.account_status
  for select to authenticated
  using (user_id = auth.uid() or public.can_manage_site());

revoke all on table public.account_status from anon, public;
grant select on table public.account_status to authenticated;

create or replace function public.can_access_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_is_active()
    and (
      public.is_platform_owner()
      or exists (
        select 1
        from public.tenant_members
        where tenant_id = p_tenant
          and user_id = auth.uid()
      )
    );
$$;

create or replace function public.can_write_services(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_is_active()
    and (
      public.is_platform_owner()
      or exists (
        select 1
        from public.tenant_members
        where tenant_id = p_tenant
          and user_id = auth.uid()
          and role in ('tenant_admin', 'editor')
      )
    );
$$;

create or replace function public.can_admin_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.account_is_active()
    and (
      public.is_platform_owner()
      or exists (
        select 1
        from public.tenant_members
        where tenant_id = p_tenant
          and user_id = auth.uid()
          and role = 'tenant_admin'
      )
    );
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
  v_company text;
  v_name text := 'Starter Workspace';
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if not public.account_is_active() then
    raise exception 'This account is deactivated';
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
    and i.cancelled_at is null
    and (i.expires_at is null or i.expires_at > now())
    and i.email = v_email
  on conflict (tenant_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
  set accepted_at = now()
  where accepted_at is null
    and cancelled_at is null
    and (expires_at is null or expires_at > now())
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

  select btrim(company) into v_company
  from public.user_profiles
  where user_id = v_uid;

  if v_company is not null
     and char_length(v_company) between 2 and 80
     and v_company !~ '[[:cntrl:]]' then
    v_name := v_company;
  end if;

  v_slug := 'starter-workspace';
  if exists (select 1 from public.tenants where slug = v_slug) then
    v_slug := 'starter-workspace-' || substr(replace(v_uid::text, '-', ''), 1, 8);
  end if;

  return public.provision_tenant_internal(v_name, v_slug, v_uid, 'tenant_admin');
end;
$$;

create or replace function public.add_tenant_member(p_tenant uuid, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_id uuid;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_name text;
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
  if p_role not in ('tenant_admin', 'editor', 'viewer', 'service_manager', 'platform_owner') then
    raise exception 'Unknown role';
  end if;
  if p_role = 'platform_owner' and not public.is_platform_owner() then
    raise exception 'Only a platform owner can grant platform owner';
  end if;

  select name into v_name from public.tenants where id = p_tenant;
  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is null then
    if p_role = 'platform_owner' then
      raise exception 'That person needs an account before they can be a platform owner.';
    end if;
    insert into public.workspace_invitations (tenant_id, email, role, invited_by, expires_at, token, cancelled_at, sent_at)
    values (p_tenant, v_email, p_role, auth.uid(), now() + interval '7 days', v_token, null, null)
    on conflict (tenant_id, email) where accepted_at is null and cancelled_at is null
    do update set
      role = excluded.role,
      invited_by = excluded.invited_by,
      created_at = now(),
      expires_at = excluded.expires_at,
      token = excluded.token,
      sent_at = null
    returning id, token into v_id, v_token;
    return jsonb_build_object(
      'status', 'invited',
      'id', v_id,
      'token', v_token,
      'email', v_email,
      'role', p_role,
      'workspace_name', v_name
    );
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (p_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role
  returning id into v_id;

  update public.workspace_invitations
  set accepted_at = now()
  where tenant_id = p_tenant
    and email = v_email
    and accepted_at is null
    and cancelled_at is null;

  return jsonb_build_object(
    'status', 'member',
    'id', v_id,
    'email', v_email,
    'role', p_role,
    'workspace_name', v_name
  );
end;
$$;

create or replace function public.cancel_workspace_invitation(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select tenant_id into v_tenant
  from public.workspace_invitations
  where id = p_invite
    and accepted_at is null
    and cancelled_at is null;
  if v_tenant is null then
    raise exception 'That invite is no longer pending';
  end if;
  if not public.can_admin_tenant(v_tenant) then
    raise exception 'Only an Admin can cancel an invite';
  end if;
  update public.workspace_invitations
  set cancelled_at = now()
  where id = p_invite;
end;
$$;

create or replace function public.resend_workspace_invitation(p_invite uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workspace_invitations%rowtype;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into v_row from public.workspace_invitations where id = p_invite;
  if v_row.id is null or v_row.accepted_at is not null then
    raise exception 'That invite is no longer pending';
  end if;
  if not public.can_admin_tenant(v_row.tenant_id) then
    raise exception 'Only an Admin can resend an invite';
  end if;
  update public.workspace_invitations
  set
    token = v_token,
    expires_at = now() + interval '7 days',
    cancelled_at = null,
    created_at = now(),
    sent_at = null,
    invited_by = auth.uid()
  where id = p_invite;
  select name into v_name from public.tenants where id = v_row.tenant_id;
  return jsonb_build_object(
    'status', 'invited',
    'id', p_invite,
    'token', v_token,
    'email', v_row.email,
    'role', v_row.role,
    'workspace_name', v_name
  );
end;
$$;

create or replace function public.assert_admin_remains(p_tenant uuid, p_user uuid, p_next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_others integer;
begin
  select role into v_role
  from public.tenant_members
  where tenant_id = p_tenant and user_id = p_user;
  if v_role is null then
    return;
  end if;
  if v_role not in ('tenant_admin', 'platform_owner') then
    return;
  end if;
  if p_next_role in ('tenant_admin', 'platform_owner') then
    return;
  end if;
  select count(*) into v_others
  from public.tenant_members
  where tenant_id = p_tenant
    and user_id <> p_user
    and role in ('tenant_admin', 'platform_owner');
  if v_others = 0 then
    raise exception 'Appoint another Admin before removing the last Admin of this workspace';
  end if;
end;
$$;

create or replace function public.set_member_role(p_tenant uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can change roles';
  end if;
  if p_role not in ('tenant_admin', 'editor', 'viewer', 'service_manager', 'platform_owner') then
    raise exception 'Unknown role';
  end if;
  select role into v_current
  from public.tenant_members
  where tenant_id = p_tenant and user_id = p_user;
  if v_current is null then
    raise exception 'That person is not a member of this workspace';
  end if;
  if (v_current = 'platform_owner' or p_role = 'platform_owner') and not public.is_platform_owner() then
    raise exception 'Only a platform owner can grant platform owner';
  end if;
  perform public.assert_admin_remains(p_tenant, p_user, p_role);
  update public.tenant_members set role = p_role where tenant_id = p_tenant and user_id = p_user;
end;
$$;

create or replace function public.remove_tenant_member(p_tenant uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can remove a member';
  end if;
  if not exists (
    select 1 from public.tenant_members where tenant_id = p_tenant and user_id = p_user
  ) then
    raise exception 'That person is not a member of this workspace';
  end if;
  perform public.assert_admin_remains(p_tenant, p_user, 'viewer');
  delete from public.tenant_members where tenant_id = p_tenant and user_id = p_user;
end;
$$;

create or replace function public.save_workspace_settings(
  p_tenant uuid,
  p_distribution_public text,
  p_distribution_internal text,
  p_format text,
  p_profile uuid,
  p_reminder boolean,
  p_mark_reminder_seen boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public text := nullif(btrim(coalesce(p_distribution_public, '')), '');
  v_internal text := nullif(btrim(coalesce(p_distribution_internal, '')), '');
  v_format text := nullif(btrim(coalesce(p_format, '')), '');
  v_email text;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can change workspace settings';
  end if;
  if v_public is not null and char_length(v_public) > 240 then
    raise exception 'Use a shorter public distribution statement';
  end if;
  if v_internal is not null and char_length(v_internal) > 240 then
    raise exception 'Use a shorter internal distribution statement';
  end if;
  if v_format is not null and v_format not in ('csv', 'xlsx', 'docx', 'pdf', 'json') then
    raise exception 'Unknown export format';
  end if;
  if p_profile is not null and not exists (
    select 1 from public.export_profiles where id = p_profile and tenant_id = p_tenant
  ) then
    raise exception 'That export profile is not in this workspace';
  end if;

  select jsonb_build_object(
    'distribution_public', distribution_public,
    'distribution_internal', distribution_internal,
    'default_export_format', default_export_format,
    'default_export_profile_id', default_export_profile_id,
    'owner_reminder_enabled', owner_reminder_enabled
  )
  into v_before
  from public.tenants
  where id = p_tenant;

  update public.tenants
  set
    distribution_public = v_public,
    distribution_internal = v_internal,
    default_export_format = v_format,
    default_export_profile_id = p_profile,
    owner_reminder_enabled = coalesce(p_reminder, false),
    owner_reminder_seen_at = case
      when p_mark_reminder_seen then now()
      else owner_reminder_seen_at
    end,
    updated_at = now()
  where id = p_tenant;

  select jsonb_build_object(
    'distribution_public', distribution_public,
    'distribution_internal', distribution_internal,
    'default_export_format', default_export_format,
    'default_export_profile_id', default_export_profile_id,
    'owner_reminder_enabled', owner_reminder_enabled
  )
  into v_after
  from public.tenants
  where id = p_tenant;

  if v_before is distinct from v_after then
    select email into v_email from auth.users where id = auth.uid();
    insert into public.audit_log (
      tenant_id, actor_user_id, actor_label, table_name, row_id, action, before_data, after_data
    ) values (
      p_tenant, auth.uid(), coalesce(v_email, 'system'), 'tenants', p_tenant, 'update', v_before, v_after
    );
  end if;
end;
$$;

drop function if exists public.list_visible_members();

create function public.list_visible_members()
returns table (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  email text,
  role text,
  created_at timestamptz,
  first_name text,
  last_name text,
  deactivated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.tenant_id,
    m.user_id,
    u.email::text,
    m.role,
    m.created_at,
    p.first_name,
    p.last_name,
    s.deactivated_at
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  left join public.user_profiles p on p.user_id = m.user_id
  left join public.account_status s on s.user_id = m.user_id
  where public.can_access_tenant(m.tenant_id);
$$;

create or replace function public.preview_invitation(p_token text)
returns table (
  email text,
  role text,
  workspace_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.workspace_invitations%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_row from public.workspace_invitations where token = p_token;
  if v_row.id is null or v_row.email <> v_email then
    raise exception 'This invite is for a different email address.';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'This invite was cancelled.';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() and v_row.accepted_at is null then
    raise exception 'This invite has expired.';
  end if;
  select name into v_name from public.tenants where id = v_row.tenant_id;
  email := v_row.email;
  role := v_row.role;
  workspace_name := v_name;
  expires_at := v_row.expires_at;
  return next;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.workspace_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.account_is_active() then
    raise exception 'This account is deactivated';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_row from public.workspace_invitations where token = p_token;
  if v_row.id is null or v_row.email <> v_email then
    raise exception 'This invite is for a different email address.';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'This invite was cancelled.';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() and v_row.accepted_at is null then
    raise exception 'This invite has expired.';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_row.tenant_id, auth.uid(), v_row.role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
  set accepted_at = coalesce(accepted_at, now())
  where id = v_row.id;

  return v_row.tenant_id;
end;
$$;

create or replace function public.list_site_accounts()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  deactivated_at timestamptz,
  memberships jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_site() then
    raise exception 'Only a platform owner can manage accounts';
  end if;
  return query
  select
    u.id,
    u.email::text,
    p.first_name,
    p.last_name,
    s.deactivated_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('tenant_id', m.tenant_id, 'name', t.name, 'role', m.role) order by t.name)
        from public.tenant_members m
        join public.tenants t on t.id = m.tenant_id
        where m.user_id = u.id
      ),
      '[]'::jsonb
    )
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  left join public.account_status s on s.user_id = u.id
  order by lower(u.email::text);
end;
$$;

create or replace function public.set_account_active(p_user uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_services integer := 0;
  v_owners integer := 0;
begin
  if not public.can_manage_site() then
    raise exception 'Only a platform owner can manage accounts';
  end if;
  if p_user = auth.uid() and not p_active then
    raise exception 'You cannot deactivate your own account';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'That account was not found';
  end if;
  if not p_active and exists (
    select 1 from public.tenant_members where user_id = p_user and role = 'platform_owner'
  ) and not exists (
    select 1
    from public.tenant_members m
    left join public.account_status s on s.user_id = m.user_id
    where m.role = 'platform_owner'
      and m.user_id <> p_user
      and s.deactivated_at is null
  ) then
    raise exception 'Keep at least one active platform owner';
  end if;

  if p_active then
    update public.account_status
    set deactivated_at = null, deactivated_by = null, updated_at = now()
    where user_id = p_user;
    update public.service_owners
    set deactivated_user = false, updated_at = now()
    where user_id = p_user;
  else
    insert into public.account_status (user_id, deactivated_at, deactivated_by)
    values (p_user, now(), auth.uid())
    on conflict (user_id) do update
      set deactivated_at = now(), deactivated_by = excluded.deactivated_by, updated_at = now();
    update public.service_owners
    set deactivated_user = true, updated_at = now()
    where user_id = p_user;
    get diagnostics v_owners = row_count;
  end if;

  if to_regclass('public.services') is not null and to_regclass('public.service_owners') is not null then
    select count(*) into v_services
    from public.services sv
    join public.service_owners o on o.id = sv.owner_id
    where o.user_id = p_user;
  end if;

  return jsonb_build_object('owners', v_owners, 'services', v_services);
end;
$$;

create or replace function public.delete_site_account(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.can_manage_site() then
    raise exception 'Only a platform owner can manage accounts';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then
    raise exception 'That account was not found';
  end if;
  if v_email is distinct from lower(btrim(coalesce(p_email, ''))) then
    raise exception 'Type the account email to confirm deletion';
  end if;
  if exists (
    select 1 from public.tenant_members where user_id = p_user and role = 'platform_owner'
  ) and not exists (
    select 1
    from public.tenant_members m
    left join public.account_status s on s.user_id = m.user_id
    where m.role = 'platform_owner'
      and m.user_id <> p_user
      and s.deactivated_at is null
  ) then
    raise exception 'Keep at least one active platform owner';
  end if;
  if exists (
    select 1
    from public.tenant_members m
    where m.user_id = p_user
      and m.role in ('tenant_admin', 'platform_owner')
      and not exists (
        select 1
        from public.tenant_members other
        where other.tenant_id = m.tenant_id
          and other.user_id <> p_user
          and other.role in ('tenant_admin', 'platform_owner')
      )
  ) then
    raise exception 'Appoint another Admin before deleting the last Admin of a workspace';
  end if;

  if to_regclass('public.service_owners') is not null then
    update public.service_owners
    set deactivated_user = true, user_id = null, updated_at = now()
    where user_id = p_user;
  end if;

  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.account_is_active() from public, anon, authenticated;
revoke all on function public.assert_admin_remains(uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.can_manage_site() from public, anon;
grant execute on function public.can_manage_site() to authenticated;

revoke all on function public.ensure_practitioner_access() from public, anon;
grant execute on function public.ensure_practitioner_access() to authenticated;

revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;

revoke all on function public.cancel_workspace_invitation(uuid) from public, anon;
grant execute on function public.cancel_workspace_invitation(uuid) to authenticated;

revoke all on function public.resend_workspace_invitation(uuid) from public, anon;
grant execute on function public.resend_workspace_invitation(uuid) to authenticated;

revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

revoke all on function public.remove_tenant_member(uuid, uuid) from public, anon;
grant execute on function public.remove_tenant_member(uuid, uuid) to authenticated;

revoke all on function public.save_workspace_settings(uuid, text, text, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.save_workspace_settings(uuid, text, text, text, uuid, boolean, boolean) to authenticated;

revoke all on function public.list_visible_members() from public, anon;
grant execute on function public.list_visible_members() to authenticated;

revoke all on function public.preview_invitation(text) from public, anon;
grant execute on function public.preview_invitation(text) to authenticated;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

revoke all on function public.list_site_accounts() from public, anon;
grant execute on function public.list_site_accounts() to authenticated;

revoke all on function public.set_account_active(uuid, boolean) from public, anon;
grant execute on function public.set_account_active(uuid, boolean) to authenticated;

revoke all on function public.delete_site_account(uuid, text) from public, anon;
grant execute on function public.delete_site_account(uuid, text) to authenticated;

revoke all on function public.can_access_tenant(uuid) from public, anon;
grant execute on function public.can_access_tenant(uuid) to authenticated;
revoke all on function public.can_write_services(uuid) from public, anon;
grant execute on function public.can_write_services(uuid) to authenticated;
revoke all on function public.can_admin_tenant(uuid) from public, anon;
grant execute on function public.can_admin_tenant(uuid) to authenticated;
