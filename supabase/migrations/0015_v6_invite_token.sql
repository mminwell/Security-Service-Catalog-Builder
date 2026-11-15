-- Security Service Catalog Builder — invite tokens on hosted Supabase.
-- Apply after 0014_v6_phase2_owners.sql. This file has no credentials.
--
-- Existing rows are not updated and no invitation is deleted.
--
-- 0013 created add_tenant_member and resend_workspace_invitation with
-- search_path = public, then called gen_random_bytes while building the token.
-- On a plain Postgres install, pgcrypto lands in public, so that call works.
-- On hosted Supabase, pgcrypto lives in the extensions schema. The function
-- therefore failed with "function gen_random_bytes(integer) does not exist"
-- before the insert, and no workspace_invitations row was written.
-- The migration that installed the columns still succeeded, because the SQL
-- editor's search_path includes extensions.
--
-- This replaces those two functions so the token is created with
-- search_path = public, extensions. Pending and accepted invitations already
-- stored are left as they are.

create or replace function public.new_invite_token()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  return encode(gen_random_bytes(24), 'hex');
end;
$$;

revoke all on function public.new_invite_token() from public, anon, authenticated;

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
    v_token := public.new_invite_token();
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

revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;

revoke all on function public.resend_workspace_invitation(uuid) from public, anon;
grant execute on function public.resend_workspace_invitation(uuid) to authenticated;
