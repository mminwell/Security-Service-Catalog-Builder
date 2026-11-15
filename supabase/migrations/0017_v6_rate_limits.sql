-- Security Service Catalog Builder — durable rate limits.
-- Apply after 0016_v6_export_field_set.sql. This file has no credentials.
-- Idempotent. It does not update or delete tenants, services, invitations,
-- profiles, or any other existing row. It adds one new table and replaces
-- three functions so invite sending and acceptance count an attempt.
--
-- The app server only has the anon key. Signed-out sign-in, magic-link,
-- sign-up, and password-reset requests call enforce_rate_limit as anon, so
-- that role can execute this one function. It cannot read or write the table.
-- Invite sending ignores the caller's bucket and keys off auth.uid().

create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  action text not null,
  bucket text not null,
  created_at timestamptz not null default now(),
  constraint rate_limits_bucket_hash check (bucket ~ '^[a-f0-9]{64}$')
);

comment on table public.rate_limits is
  'Attempt counts for abuse-prone actions. bucket is a SHA-256 hex digest, never an email or IP.';

create index if not exists rate_limits_lookup_idx
  on public.rate_limits (action, bucket, created_at);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

revoke all on table public.rate_limits from public, anon, authenticated;

create or replace function public.enforce_rate_limit(p_action text, p_bucket text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer;
  v_window interval;
  v_count integer;
  v_bucket text;
begin
  if p_action in ('invite_send', 'invite_accept', 'finish_account') then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;
    v_bucket := encode(digest(convert_to(auth.uid()::text, 'UTF8'), 'sha256'), 'hex');
  else
    v_bucket := lower(trim(coalesce(p_bucket, '')));
    if v_bucket !~ '^[a-f0-9]{64}$' then
      raise exception 'rate limit bucket is invalid';
    end if;
  end if;

  case p_action
    when 'sign_in_email' then
      v_limit := 5; v_window := interval '15 minutes';
    when 'sign_in_ip' then
      v_limit := 20; v_window := interval '15 minutes';
    when 'magic_link_email' then
      v_limit := 5; v_window := interval '15 minutes';
    when 'magic_link_ip' then
      v_limit := 20; v_window := interval '15 minutes';
    when 'sign_up_email' then
      v_limit := 5; v_window := interval '15 minutes';
    when 'sign_up_ip' then
      v_limit := 20; v_window := interval '15 minutes';
    when 'password_reset_email' then
      v_limit := 5; v_window := interval '15 minutes';
    when 'password_reset_ip' then
      v_limit := 20; v_window := interval '15 minutes';
    when 'invite_send' then
      v_limit := 20; v_window := interval '1 hour';
    when 'invite_accept' then
      v_limit := 10; v_window := interval '15 minutes';
    when 'invite_accept_ip' then
      v_limit := 20; v_window := interval '15 minutes';
    when 'finish_account' then
      v_limit := 10; v_window := interval '15 minutes';
    when 'finish_account_ip' then
      v_limit := 20; v_window := interval '15 minutes';
    else
      raise exception 'unknown rate limit action';
  end case;

  perform pg_advisory_xact_lock(hashtext(p_action || ':' || v_bucket));

  delete from public.rate_limits
  where created_at < now() - interval '2 hours';

  select count(*) into v_count
  from public.rate_limits
  where action = p_action
    and bucket = v_bucket
    and created_at > now() - v_window;

  if v_count >= v_limit then
    raise exception 'rate_limited';
  end if;

  insert into public.rate_limits (action, bucket) values (p_action, v_bucket);
end;
$$;

revoke all on function public.enforce_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.enforce_rate_limit(text, text) to anon, authenticated;

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

  update public.workspace_invitations
  set accepted_at = coalesce(accepted_at, now())
  where id = v_row.id;

  return v_row.tenant_id;
end;
$$;

revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;

revoke all on function public.resend_workspace_invitation(uuid) from public, anon;
grant execute on function public.resend_workspace_invitation(uuid) to authenticated;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
