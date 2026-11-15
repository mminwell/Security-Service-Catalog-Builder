-- Security Service Catalog Builder — placeholder workspace names, audit gaps,
-- and site-admin workspace transfer and deletion.
-- Apply after 0017_v6_rate_limits.sql. This file has no credentials.
-- Idempotent. It does not drop tables or columns, and it does not delete
-- existing catalog rows. New columns are filled only when they are still null.
--
-- Site admin is the existing platform_owner role. public.can_manage_site()
-- is that check (active account and public.is_platform_owner()).
--
-- Objects created:
--   tenants.owner_user_id
--   workspace_invitations.becomes_owner
--   public.record_audit(uuid, text, uuid, text, jsonb, jsonb)
--   public.assign_tenant_owner() and trigger trg_assign_tenant_owner
--   public.claim_workspace_owner(uuid, uuid)
--   public.transfer_workspace_owner(uuid, uuid, text)
--   public.delete_workspace(uuid, text)
-- Objects replaced (same signatures; existing logic kept, plus the changes below):
--   public.copy_signup_profile()
--   public.ensure_practitioner_access()
--   public.add_tenant_member(uuid, text, text)
--   public.resend_workspace_invitation(uuid)
--   public.cancel_workspace_invitation(uuid)
--   public.set_member_role(uuid, uuid, text)
--   public.remove_tenant_member(uuid, uuid)
--   public.accept_invitation(text)
--   public.set_account_active(uuid, boolean)
--   public.delete_site_account(uuid, text)
--   policy audit_select on public.audit_log
-- Also: user_profiles.company may be null, and audit_log.tenant_id may be null
-- with ON DELETE SET NULL so a workspace-deletion audit row survives.

alter table public.user_profiles
  alter column company drop not null;

alter table public.tenants
  add column if not exists owner_user_id uuid references auth.users (id) on delete restrict;

comment on column public.tenants.owner_user_id is
  'The single workspace owner. Null only until backfill. Transfer moves this; the previous owner stays a member.';

alter table public.workspace_invitations
  add column if not exists becomes_owner boolean not null default false;

comment on column public.workspace_invitations.becomes_owner is
  'When true, accepting this invite makes that person the workspace owner. The current owner stays owner until then.';

do $$
declare
  v_name text;
  v_def text;
begin
  select conname, pg_get_constraintdef(oid)
  into v_name, v_def
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass
    and contype = 'f'
    and confrelid = 'public.tenants'::regclass
  limit 1;

  if v_def is null or v_def not ilike '%ON DELETE SET NULL%' then
    if v_name is not null then
      execute format('alter table public.audit_log drop constraint %I', v_name);
    end if;
    alter table public.audit_log alter column tenant_id drop not null;
    alter table public.audit_log
      add constraint audit_log_tenant_id_fkey
      foreign key (tenant_id) references public.tenants (id) on delete set null;
  end if;
end $$;

comment on column public.audit_log.tenant_id is
  'Workspace this event belongs to. Null after that workspace is deleted, so the row is kept.';

create or replace function public.record_audit(
  p_tenant uuid,
  p_table text,
  p_row uuid,
  p_action text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_action not in ('insert', 'update', 'delete') then
    raise exception 'Unknown audit action';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (
    tenant_id, actor_user_id, actor_label, table_name, row_id, action, before_data, after_data
  ) values (
    p_tenant,
    auth.uid(),
    coalesce(v_email, 'system'),
    p_table,
    p_row,
    p_action,
    p_before,
    p_after
  );
end;
$$;

revoke all on function public.record_audit(uuid, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.assign_tenant_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.assign_tenant_owner() from public, anon, authenticated;

drop trigger if exists trg_assign_tenant_owner on public.tenants;
create trigger trg_assign_tenant_owner
  before insert on public.tenants
  for each row execute function public.assign_tenant_owner();

update public.tenants t
set owner_user_id = sub.user_id
from (
  select distinct on (m.tenant_id) m.tenant_id, m.user_id
  from public.tenant_members m
  where m.role in ('tenant_admin', 'platform_owner')
  order by m.tenant_id, m.created_at
) sub
where t.id = sub.tenant_id
  and t.owner_user_id is null;

create or replace function public.claim_workspace_owner(p_tenant uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_name text;
  v_old_role text;
  v_old_member uuid;
  v_old_email text;
  v_new_role text;
  v_new_member uuid;
  v_new_email text;
begin
  select owner_user_id, name into v_old, v_name
  from public.tenants
  where id = p_tenant;
  if v_name is null then
    raise exception 'Choose a workspace.';
  end if;

  select m.id, m.role, u.email
  into v_new_member, v_new_role, v_new_email
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant and m.user_id = p_user;
  if v_new_member is null then
    raise exception 'That person is not a member of this workspace';
  end if;
  if v_old is not distinct from p_user then
    return;
  end if;

  if v_old is not null then
    select m.id, m.role, u.email
    into v_old_member, v_old_role, v_old_email
    from public.tenant_members m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant and m.user_id = v_old;
    if v_old_role is not null and v_old_role not in ('tenant_admin', 'platform_owner') then
      update public.tenant_members
      set role = 'tenant_admin'
      where id = v_old_member;
      perform public.record_audit(
        p_tenant,
        'tenant_members',
        v_old_member,
        'update',
        jsonb_build_object('user_id', v_old, 'email', v_old_email, 'role', v_old_role),
        jsonb_build_object('user_id', v_old, 'email', v_old_email, 'role', 'tenant_admin')
      );
      v_old_role := 'tenant_admin';
    end if;
  end if;

  if v_new_role not in ('tenant_admin', 'platform_owner') then
    update public.tenant_members
    set role = 'tenant_admin'
    where id = v_new_member;
    perform public.record_audit(
      p_tenant,
      'tenant_members',
      v_new_member,
      'update',
      jsonb_build_object('user_id', p_user, 'email', v_new_email, 'role', v_new_role),
      jsonb_build_object('user_id', p_user, 'email', v_new_email, 'role', 'tenant_admin')
    );
  end if;

  update public.tenants
  set owner_user_id = p_user, updated_at = now()
  where id = p_tenant;

  perform public.record_audit(
    p_tenant,
    'tenants',
    p_tenant,
    'update',
    jsonb_build_object('name', v_name, 'owner_user_id', v_old, 'owner_email', v_old_email),
    jsonb_build_object(
      'name', v_name,
      'owner_user_id', p_user,
      'owner_email', v_new_email,
      'previous_owner_role', coalesce(v_old_role, 'tenant_admin')
    )
  );
end;
$$;

revoke all on function public.claim_workspace_owner(uuid, uuid) from public, anon, authenticated;

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated
  using (
    (tenant_id is null and public.can_manage_site())
    or (tenant_id is not null and public.can_access_tenant(tenant_id))
  );

create or replace function public.copy_signup_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text := nullif(btrim(coalesce(v_meta->>'first_name', '')), '');
  v_last text := nullif(btrim(coalesce(v_meta->>'last_name', '')), '');
  v_company text := nullif(btrim(coalesce(v_meta->>'company', '')), '');
begin
  if v_first is null or v_last is null then
    return new;
  end if;
  if char_length(v_first) > 80 or char_length(v_last) > 80 then
    return new;
  end if;
  if v_first ~ '[[:cntrl:]]' or v_last ~ '[[:cntrl:]]' then
    return new;
  end if;
  if v_company is not null and (
    char_length(v_company) < 2
    or char_length(v_company) > 80
    or v_company ~ '[[:cntrl:]]'
  ) then
    v_company := null;
  end if;

  insert into public.user_profiles (user_id, first_name, last_name, company)
  values (new.id, v_first, v_last, v_company)
  on conflict (user_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        company = coalesce(excluded.company, public.user_profiles.company),
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.copy_signup_profile() from public, anon, authenticated;

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
  v_first text;
  v_name text := 'My workspace';
  v_invite public.workspace_invitations%rowtype;
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

  for v_invite in
    select *
    from public.workspace_invitations i
    where i.accepted_at is null
      and i.cancelled_at is null
      and (i.expires_at is null or i.expires_at > now())
      and i.email = v_email
  loop
    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_invite.tenant_id, v_uid, v_invite.role)
    on conflict (tenant_id, user_id) do update set role = excluded.role;
    if v_invite.becomes_owner then
      perform public.claim_workspace_owner(v_invite.tenant_id, v_uid);
    end if;
  end loop;

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

  select regexp_replace(btrim(first_name), '[[:space:]]+', ' ', 'g')
  into v_first
  from public.user_profiles
  where user_id = v_uid;

  if v_first is not null
     and char_length(v_first) >= 1
     and v_first !~ '[[:cntrl:]]'
     and char_length(v_first || '''s workspace') <= 80 then
    v_name := v_first || '''s workspace';
  end if;

  v_slug := 'starter-workspace';
  if exists (select 1 from public.tenants where slug = v_slug) then
    v_slug := 'starter-workspace-' || substr(replace(v_uid::text, '-', ''), 1, 8);
  end if;

  return public.provision_tenant_internal(v_name, v_slug, v_uid, 'tenant_admin');
end;
$$;

revoke all on function public.ensure_practitioner_access() from public, anon;
grant execute on function public.ensure_practitioner_access() to authenticated;

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
  v_token text;
  v_name text;
  v_existing_id uuid;
  v_old_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can invite members';
  end if;
  perform public.enforce_rate_limit('invite_send', null);
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
    select id, role into v_existing_id, v_old_role
    from public.workspace_invitations
    where tenant_id = p_tenant
      and email = v_email
      and accepted_at is null
      and cancelled_at is null;
    v_token := public.new_invite_token();
    insert into public.workspace_invitations (
      tenant_id, email, role, invited_by, expires_at, token, cancelled_at, sent_at, becomes_owner
    )
    values (p_tenant, v_email, p_role, auth.uid(), now() + interval '7 days', v_token, null, null, false)
    on conflict (tenant_id, email) where accepted_at is null and cancelled_at is null
    do update set
      role = excluded.role,
      invited_by = excluded.invited_by,
      created_at = now(),
      expires_at = excluded.expires_at,
      token = excluded.token,
      sent_at = null,
      becomes_owner = false
    returning id, token into v_id, v_token;
    perform public.record_audit(
      p_tenant,
      'workspace_invitations',
      v_id,
      case when v_existing_id is null then 'insert' else 'update' end,
      case
        when v_existing_id is null then null
        else jsonb_build_object('email', v_email, 'role', v_old_role, 'becomes_owner', false)
      end,
      jsonb_build_object('email', v_email, 'role', p_role, 'becomes_owner', false)
    );
    return jsonb_build_object(
      'status', 'invited',
      'id', v_id,
      'token', v_token,
      'email', v_email,
      'role', p_role,
      'workspace_name', v_name
    );
  end if;

  select id, role into v_existing_id, v_old_role
  from public.tenant_members
  where tenant_id = p_tenant and user_id = v_user;

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

  if v_old_role is distinct from p_role then
    perform public.record_audit(
      p_tenant,
      'tenant_members',
      v_id,
      case when v_existing_id is null then 'insert' else 'update' end,
      case
        when v_old_role is null then null
        else jsonb_build_object('user_id', v_user, 'email', v_email, 'role', v_old_role)
      end,
      jsonb_build_object('user_id', v_user, 'email', v_email, 'role', p_role)
    );
  end if;

  return jsonb_build_object(
    'status', 'member',
    'id', v_id,
    'email', v_email,
    'role', p_role,
    'workspace_name', v_name
  );
end;
$$;

revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;

create or replace function public.cancel_workspace_invitation(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workspace_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into v_row
  from public.workspace_invitations
  where id = p_invite
    and accepted_at is null
    and cancelled_at is null;
  if v_row.id is null then
    raise exception 'That invite is no longer pending';
  end if;
  if not public.can_admin_tenant(v_row.tenant_id) then
    raise exception 'Only an Admin can cancel an invite';
  end if;
  update public.workspace_invitations
  set cancelled_at = now()
  where id = p_invite;
  perform public.record_audit(
    v_row.tenant_id,
    'workspace_invitations',
    p_invite,
    'update',
    jsonb_build_object('email', v_row.email, 'role', v_row.role, 'becomes_owner', v_row.becomes_owner),
    jsonb_build_object('email', v_row.email, 'role', v_row.role, 'becomes_owner', v_row.becomes_owner, 'cancelled', true)
  );
end;
$$;

revoke all on function public.cancel_workspace_invitation(uuid) from public, anon;
grant execute on function public.cancel_workspace_invitation(uuid) to authenticated;

create or replace function public.resend_workspace_invitation(p_invite uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workspace_invitations%rowtype;
  v_token text;
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
  perform public.enforce_rate_limit('invite_send', null);
  v_token := public.new_invite_token();
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
  perform public.record_audit(
    v_row.tenant_id,
    'workspace_invitations',
    p_invite,
    'update',
    jsonb_build_object('email', v_row.email, 'role', v_row.role, 'becomes_owner', v_row.becomes_owner),
    jsonb_build_object(
      'email', v_row.email,
      'role', v_row.role,
      'becomes_owner', v_row.becomes_owner,
      'resent', true
    )
  );
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

revoke all on function public.resend_workspace_invitation(uuid) from public, anon;
grant execute on function public.resend_workspace_invitation(uuid) to authenticated;

create or replace function public.set_member_role(p_tenant uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_member uuid;
  v_email text;
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
  select m.role, m.id, u.email
  into v_current, v_member, v_email
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant and m.user_id = p_user;
  if v_current is null then
    raise exception 'That person is not a member of this workspace';
  end if;
  if (v_current = 'platform_owner' or p_role = 'platform_owner') and not public.is_platform_owner() then
    raise exception 'Only a platform owner can grant platform owner';
  end if;
  if exists (
    select 1 from public.tenants where id = p_tenant and owner_user_id = p_user
  ) and p_role not in ('tenant_admin', 'platform_owner') then
    raise exception 'Transfer ownership before changing the owner role';
  end if;
  perform public.assert_admin_remains(p_tenant, p_user, p_role);
  if v_current is distinct from p_role then
    update public.tenant_members
    set role = p_role
    where tenant_id = p_tenant and user_id = p_user;
    perform public.record_audit(
      p_tenant,
      'tenant_members',
      v_member,
      'update',
      jsonb_build_object('user_id', p_user, 'email', v_email, 'role', v_current),
      jsonb_build_object('user_id', p_user, 'email', v_email, 'role', p_role)
    );
  end if;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_tenant_member(p_tenant uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_role text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can remove a member';
  end if;
  select m.id, m.role, u.email
  into v_member, v_role, v_email
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant and m.user_id = p_user;
  if v_member is null then
    raise exception 'That person is not a member of this workspace';
  end if;
  perform public.assert_admin_remains(p_tenant, p_user, 'viewer');
  if exists (
    select 1 from public.tenants where id = p_tenant and owner_user_id = p_user
  ) then
    raise exception 'Transfer ownership before removing the workspace owner';
  end if;
  perform public.record_audit(
    p_tenant,
    'tenant_members',
    v_member,
    'delete',
    jsonb_build_object('user_id', p_user, 'email', v_email, 'role', v_role),
    null
  );
  delete from public.tenant_members where tenant_id = p_tenant and user_id = p_user;
end;
$$;

revoke all on function public.remove_tenant_member(uuid, uuid) from public, anon;
grant execute on function public.remove_tenant_member(uuid, uuid) to authenticated;

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
  perform public.enforce_rate_limit('invite_accept', null);
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

  if v_row.becomes_owner then
    perform public.claim_workspace_owner(v_row.tenant_id, auth.uid());
  end if;

  update public.workspace_invitations
  set accepted_at = coalesce(accepted_at, now())
  where id = v_row.id;

  return v_row.tenant_id;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.set_account_active(p_user uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_services integer := 0;
  v_owners integer := 0;
  v_email text;
  v_scope uuid;
  v_wrote boolean := false;
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

  select email into v_email from auth.users where id = p_user;
  for v_scope in
    select m.tenant_id from public.tenant_members m where m.user_id = p_user
  loop
    perform public.record_audit(
      v_scope,
      'account_status',
      p_user,
      'update',
      jsonb_build_object('user_id', p_user, 'email', v_email, 'active', not p_active),
      jsonb_build_object('user_id', p_user, 'email', v_email, 'active', p_active)
    );
    v_wrote := true;
  end loop;
  if not v_wrote then
    perform public.record_audit(
      null,
      'account_status',
      p_user,
      'update',
      jsonb_build_object('user_id', p_user, 'email', v_email, 'active', not p_active),
      jsonb_build_object('user_id', p_user, 'email', v_email, 'active', p_active)
    );
  end if;

  return jsonb_build_object('owners', v_owners, 'services', v_services);
end;
$$;

revoke all on function public.set_account_active(uuid, boolean) from public, anon;
grant execute on function public.set_account_active(uuid, boolean) to authenticated;

create or replace function public.delete_site_account(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_scope uuid;
  v_wrote boolean := false;
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
  if exists (select 1 from public.tenants where owner_user_id = p_user) then
    raise exception 'Transfer ownership before deleting this account';
  end if;

  for v_scope in
    select m.tenant_id from public.tenant_members m where m.user_id = p_user
  loop
    perform public.record_audit(
      v_scope,
      'account_status',
      p_user,
      'delete',
      jsonb_build_object('user_id', p_user, 'email', v_email),
      null
    );
    v_wrote := true;
  end loop;
  if not v_wrote then
    perform public.record_audit(
      null,
      'account_status',
      p_user,
      'delete',
      jsonb_build_object('user_id', p_user, 'email', v_email),
      null
    );
  end if;

  if to_regclass('public.service_owners') is not null then
    update public.service_owners
    set deactivated_user = true, user_id = null, updated_at = now()
    where user_id = p_user;
  end if;

  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.delete_site_account(uuid, text) from public, anon;
grant execute on function public.delete_site_account(uuid, text) to authenticated;

create or replace function public.transfer_workspace_owner(p_tenant uuid, p_user uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_name text;
  v_id uuid;
  v_token text;
  v_target uuid := p_user;
  v_existing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_manage_site() then
    raise exception 'Only a platform owner can transfer workspace ownership';
  end if;
  select name into v_name from public.tenants where id = p_tenant;
  if v_name is null then
    raise exception 'Choose a workspace.';
  end if;
  if exists (
    select 1
    from public.workspace_invitations
    where tenant_id = p_tenant
      and becomes_owner
      and accepted_at is null
      and cancelled_at is null
      and (expires_at is null or expires_at > now())
  ) then
    raise exception 'Cancel the pending ownership invite before transferring ownership';
  end if;

  if v_target is null then
    if v_email = '' then
      raise exception 'Choose a member or enter an email';
    end if;
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 320 then
      raise exception 'Enter a valid email address';
    end if;
    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is not null and exists (
      select 1 from public.tenant_members where tenant_id = p_tenant and user_id = v_user
    ) then
      v_target := v_user;
    end if;
  else
    if not exists (
      select 1 from public.tenant_members where tenant_id = p_tenant and user_id = v_target
    ) then
      raise exception 'That person is not a member of this workspace';
    end if;
    select lower(email) into v_email from auth.users where id = v_target;
  end if;

  if v_target is not null then
    perform public.claim_workspace_owner(p_tenant, v_target);
    return jsonb_build_object(
      'status', 'owner',
      'email', v_email,
      'role', 'tenant_admin',
      'workspace_name', v_name
    );
  end if;

  perform public.enforce_rate_limit('invite_send', null);
  select id into v_existing_id
  from public.workspace_invitations
  where tenant_id = p_tenant
    and email = v_email
    and accepted_at is null
    and cancelled_at is null;
  v_token := public.new_invite_token();
  insert into public.workspace_invitations (
    tenant_id, email, role, invited_by, expires_at, token, cancelled_at, sent_at, becomes_owner
  ) values (
    p_tenant, v_email, 'tenant_admin', auth.uid(), now() + interval '7 days', v_token, null, null, true
  )
  on conflict (tenant_id, email) where accepted_at is null and cancelled_at is null
  do update set
    role = excluded.role,
    invited_by = excluded.invited_by,
    created_at = now(),
    expires_at = excluded.expires_at,
    token = excluded.token,
    sent_at = null,
    becomes_owner = true
  returning id, token into v_id, v_token;

  perform public.record_audit(
    p_tenant,
    'workspace_invitations',
    v_id,
    case when v_existing_id is null then 'insert' else 'update' end,
    null,
    jsonb_build_object('email', v_email, 'role', 'tenant_admin', 'becomes_owner', true)
  );

  return jsonb_build_object(
    'status', 'invited',
    'id', v_id,
    'token', v_token,
    'email', v_email,
    'role', 'tenant_admin',
    'workspace_name', v_name,
    'becomes_owner', true
  );
end;
$$;

revoke all on function public.transfer_workspace_owner(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_workspace_owner(uuid, uuid, text) to authenticated;

create or replace function public.delete_workspace(p_tenant uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_slug text;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_manage_site() then
    raise exception 'Only a platform owner can delete a workspace';
  end if;
  select name, slug, owner_user_id into v_name, v_slug, v_owner
  from public.tenants
  where id = p_tenant;
  if v_name is null then
    raise exception 'Choose a workspace.';
  end if;
  if btrim(coalesce(p_name, '')) is distinct from v_name then
    raise exception 'Type the workspace name to confirm deletion';
  end if;
  perform public.record_audit(
    p_tenant,
    'tenants',
    p_tenant,
    'delete',
    jsonb_build_object('tenant_id', p_tenant, 'name', v_name, 'slug', v_slug, 'owner_user_id', v_owner),
    null
  );
  -- Child rows cascade and their audit triggers would insert a tenant_id that is
  -- already going away. The deletion row above is the one that must survive.
  perform set_config('sscb.skip_audit', 'on', true);
  delete from public.tenants where id = p_tenant;
  perform set_config('sscb.skip_audit', 'off', true);
end;
$$;

revoke all on function public.delete_workspace(uuid, text) from public, anon;
grant execute on function public.delete_workspace(uuid, text) to authenticated;
