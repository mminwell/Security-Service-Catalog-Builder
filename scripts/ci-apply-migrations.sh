#!/usr/bin/env bash
# Apply supabase/migrations in order to a Postgres that has no Supabase roles yet.
# GitHub Actions starts the server as a service container. This script does not use Docker.
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=sscb}"
export PGHOST PGPORT PGUSER PGDATABASE
if [ -n "${PGPASSWORD:-}" ]; then
  export PGPASSWORD
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;

grant usage on schema auth to authenticated, anon;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to authenticated, anon;
SQL

for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$file")"
  psql -v ON_ERROR_STOP=1 -f "$file"
done

psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_tenant uuid;
  v_invite jsonb;
begin
  insert into auth.users (id, email) values (v_user, 'owner@example.com');
  if exists (select 1 from public.user_profiles where user_id = v_user) then
    raise exception 'profile was backfilled for an account with no name';
  end if;

  insert into public.user_profiles (user_id, first_name, last_name, company)
  values (v_user, 'Ada', 'Lovelace', 'Northwind Traders');
  insert into auth.users (id, email)
  values ('22222222-2222-4222-8222-222222222222', 'other@example.com');

  perform set_config('request.jwt.claim.sub', v_user::text, true);

  execute 'set role authenticated';

  if not exists (
    select 1 from public.user_profiles
    where user_id = v_user and first_name = 'Ada' and company = 'Northwind Traders'
  ) then
    raise exception 'user cannot read their own profile';
  end if;

  begin
    insert into public.user_profiles (user_id, first_name, last_name, company)
    values ('22222222-2222-4222-8222-222222222222', 'Eve', 'Hacker', 'Other Co');
    raise exception 'user inserted another profile';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm not like '%row-level security%' then
        raise;
      end if;
  end;

  if exists (
    select 1 from public.user_profiles where user_id = '22222222-2222-4222-8222-222222222222'
  ) then
    raise exception 'user can read another profile';
  end if;

  v_tenant := public.ensure_practitioner_access();
  if v_tenant is null then
    raise exception 'ensure_practitioner_access returned null';
  end if;

  if not exists (
    select 1 from public.tenants
    where id = v_tenant and name = 'Ada''s workspace' and slug = 'starter-workspace'
  ) then
    raise exception 'first name was not used as the first workspace name';
  end if;

  update public.user_profiles set company = 'Changed Later' where user_id = v_user;
  if not exists (
    select 1 from public.tenants where id = v_tenant and name = 'Ada''s workspace'
  ) then
    raise exception 'editing the profile renamed the workspace';
  end if;

  v_invite := public.add_tenant_member(v_tenant, 'editor@example.com', 'editor');
  if v_invite->>'status' is distinct from 'invited' then
    raise exception 'invite did not stay pending: %', v_invite;
  end if;

  if public.rename_workspace(v_tenant, '  Northwind Security  ') is distinct from 'Northwind Security' then
    raise exception 'rename_workspace did not return the trimmed name';
  end if;
  begin
    perform public.rename_workspace(v_tenant, '   ');
    raise exception 'blank workspace name was accepted';
  exception
    when others then
      if sqlerrm not like '%workspace name%' then
        raise;
      end if;
  end;

  begin
    perform public.write_audit();
    raise exception 'authenticated was able to call write_audit';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.provision_tenant_internal('Hidden', 'hidden', v_user, 'tenant_admin');
    raise exception 'authenticated was able to call provision_tenant_internal';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';

  if not exists (
    select 1 from public.tenants where id = v_tenant and name = 'Northwind Security' and slug = 'starter-workspace'
  ) then
    raise exception 'rename changed the slug or missed the name';
  end if;

  if not exists (
    select 1
    from public.audit_log
    where tenant_id = v_tenant
      and table_name = 'tenants'
      and action = 'update'
      and after_data->>'name' = 'Northwind Security'
      and after_data->>'slug' = before_data->>'slug'
  ) then
    raise exception 'rename was not written to the audit log';
  end if;

  if not exists (
    select 1
    from public.tenant_members
    where tenant_id = v_tenant and user_id = v_user and role = 'tenant_admin'
  ) then
    raise exception 'first account was not Admin';
  end if;

  if not exists (
    select 1
    from public.workspace_invitations
    where tenant_id = v_tenant and email = 'editor@example.com' and role = 'editor' and accepted_at is null
  ) then
    raise exception 'pending invite was not stored';
  end if;
end $$;

do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_manager uuid := '33333333-3333-4333-8333-333333333333';
  v_invited uuid := '44444444-4444-4444-8444-444444444444';
  v_tenant uuid;
  v_owned uuid;
  v_other uuid;
  v_owner uuid;
  v_replacement uuid;
  v_invite jsonb;
  v_split jsonb;
begin
  v_split := public.split_person_name('Minwell, Mike');
  if v_split->>'ok' is distinct from 'true' or v_split->>'first_name' is distinct from 'Mike' or v_split->>'last_name' is distinct from 'Minwell' then
    raise exception 'Last, First did not split: %', v_split;
  end if;
  v_split := public.split_person_name('Mike Minwell');
  if v_split->>'first_name' is distinct from 'Mike' or v_split->>'last_name' is distinct from 'Minwell' then
    raise exception 'First Last did not split: %', v_split;
  end if;
  if (public.split_person_name('SOC Manager')->>'ok') is distinct from 'false' then
    raise exception 'SOC Manager was treated as a person';
  end if;
  if (public.split_person_name('Security Architecture (to be named)')->>'ok') is distinct from 'false' then
    raise exception 'a note was treated as a person';
  end if;

  select id into v_tenant from public.tenants where slug = 'starter-workspace';
  insert into auth.users (id, email) values (v_manager, 'manager@example.com');

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into public.services (tenant_id, service_code, name, summary, service_owner)
  values (v_tenant, 'SVC-900', 'Named service', 'A summary', 'Ada Lovelace');
  insert into public.services (tenant_id, service_code, name, summary, service_owner)
  values (v_tenant, 'SVC-901', 'Title service', 'A summary', 'SOC Manager');

  if not exists (
    select 1 from public.services
    where service_code = 'SVC-900' and service_owner = 'Lovelace, Ada' and owner_id is not null
  ) then
    raise exception 'a clean owner name was not migrated on insert';
  end if;
  if not exists (
    select 1 from public.services
    where service_code = 'SVC-901' and service_owner = 'SOC Manager' and owner_review = 'SOC Manager' and owner_needed and owner_id is null
  ) then
    raise exception 'unsplittable owner text was not kept';
  end if;

  select id, owner_id into v_owned, v_owner from public.services where service_code = 'SVC-900';
  update public.service_owners set user_id = v_manager where id = v_owner;
  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, v_manager, 'service_manager');

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into public.services (tenant_id, service_code, name, summary)
  values (v_tenant, 'SVC-902', 'Other service', 'A summary')
  returning id into v_other;
  execute 'set role authenticated';
  v_replacement := public.upsert_service_owner(v_tenant, jsonb_build_object(
    'first_name', 'Grace', 'last_name', 'Hopper', 'email', 'grace@example.com', 'history_reason', 'edit'
  ));
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  execute 'set role authenticated';
  update public.services set summary = 'Manager edit' where id = v_owned;
  if not found then
    raise exception 'service manager could not edit the owned service';
  end if;
  update public.services set summary = 'Stolen' where id = v_other;
  if found then
    raise exception 'service manager edited a service they do not own';
  end if;
  begin
    update public.services set owner_id = v_replacement where id = v_owned;
    if found then
      raise exception 'service manager changed the owner';
    end if;
  exception
    when others then
      if sqlerrm like '%service manager changed%' then
        raise;
      end if;
  end;
  execute 'reset role';

  if not exists (select 1 from public.services where id = v_owned and summary = 'Manager edit' and owner_id = v_owner) then
    raise exception 'service manager could not edit the owned service, or the owner changed';
  end if;
  if exists (select 1 from public.services where id = v_other and summary = 'Stolen') then
    raise exception 'unowned service was changed';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set role authenticated';
  perform public.archive_service_owner(v_owner, v_replacement, 'archive');
  if not exists (
    select 1 from public.services where id = v_owned and owner_id = v_replacement and owner_needed = false
  ) then
    raise exception 'archive did not reassign the service';
  end if;
  if not exists (
    select 1 from public.service_owner_history
    where service_id = v_owned and old_owner_id = v_owner and new_owner_id = v_replacement and reason = 'archive'
  ) then
    raise exception 'archive was not written to owner history';
  end if;
  if not exists (select 1 from public.service_owners where id = v_owner and is_active = false) then
    raise exception 'archived owner was deleted or left active';
  end if;

  perform public.upsert_service_owner(v_tenant, jsonb_build_object('first_name', 'Ken', 'last_name', 'Thompson'));
  perform public.archive_service_owner(
    (select id from public.service_owners where tenant_id = v_tenant and last_name = 'Thompson'),
    null,
    'archive'
  );

  begin
    perform public.remove_tenant_member(v_tenant, v_admin);
    raise exception 'removed the last admin';
  exception
    when others then
      if sqlerrm not like '%another Admin%' and sqlerrm not like '%removed the last admin%' then
        raise;
      end if;
      if sqlerrm like '%removed the last admin%' then
        raise;
      end if;
  end;

  v_invite := public.add_tenant_member(v_tenant, 'sam@example.com', 'service_manager');
  if v_invite->>'status' is distinct from 'invited' or v_invite->>'role' is distinct from 'service_manager' then
    raise exception 'service manager invite was not stored: %', v_invite;
  end if;
  if (v_invite->>'token') is null then
    raise exception 'invite has no token';
  end if;
  execute 'reset role';

  insert into auth.users (id, email) values (v_invited, 'sam@example.com');
  perform set_config('request.jwt.claim.sub', v_invited::text, true);
  execute 'set role authenticated';
  perform public.ensure_practitioner_access();
  execute 'reset role';
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_tenant and user_id = v_invited and role = 'service_manager'
  ) then
    raise exception 'invite acceptance did not apply the stored role';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set role authenticated';
  perform public.add_tenant_member(v_tenant, 'late@example.com', 'viewer');
  execute 'reset role';
  update public.workspace_invitations
  set expires_at = now() - interval '1 minute'
  where email = 'late@example.com' and accepted_at is null;
  insert into auth.users (id, email) values ('55555555-5555-4555-8555-555555555555', 'late@example.com');
  perform set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
  execute 'set role authenticated';
  begin
    perform public.ensure_practitioner_access();
    raise exception 'expired invite created a membership';
  exception
    when others then
      if sqlerrm not like '%must invite%' and sqlerrm not like '%expired invite%' then
        raise;
      end if;
      if sqlerrm like '%expired invite created%' then
        raise;
      end if;
  end;
  execute 'reset role';
  if exists (
    select 1 from public.tenant_members where user_id = '55555555-5555-4555-8555-555555555555'
  ) then
    raise exception 'expired invite created a membership';
  end if;
end $$;

-- Hosted Supabase keeps pgcrypto in extensions, not public. The invite RPC must still insert a row.
do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_tenant uuid;
  v_invite jsonb;
begin
  create schema if not exists extensions;
  alter extension pgcrypto set schema extensions;
  select id into v_tenant from public.tenants where slug = 'starter-workspace';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set role authenticated';
  v_invite := public.add_tenant_member(v_tenant, 'newperson@example.com', 'viewer');
  execute 'reset role';
  if v_invite->>'status' is distinct from 'invited' then
    raise exception 'invite failed when pgcrypto is in extensions: %', v_invite;
  end if;
  if not exists (
    select 1
    from public.workspace_invitations
    where tenant_id = v_tenant
      and email = 'newperson@example.com'
      and role = 'viewer'
      and accepted_at is null
      and token is not null
      and expires_at > now()
  ) then
    raise exception 'invite row was not stored';
  end if;
end $$;

-- Rate limits store hashes, refuse the sixth sign-in email, and do not change catalog rows.
do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_tenant uuid;
  v_bucket text := encode(extensions.digest(convert_to('ada@example.com', 'UTF8'), 'sha256'), 'hex');
  v_admin_bucket text := encode(extensions.digest(convert_to(v_admin::text, 'UTF8'), 'sha256'), 'hex');
  v_tenants integer;
  v_invites integer;
  v_services integer;
  v_existing integer;
  i integer;
begin
  select count(*) into v_tenants from public.tenants;
  select count(*) into v_invites from public.workspace_invitations;
  select count(*) into v_services from public.services;
  if v_tenants < 1 or v_invites < 1 or v_services < 1 then
    raise exception 'rate limit test ran before catalog rows existed';
  end if;

  insert into public.rate_limits (action, bucket, created_at)
  values ('sign_in_ip', encode(extensions.digest(convert_to('stale', 'UTF8'), 'sha256'), 'hex'), now() - interval '3 hours');

  execute 'set role anon';
  for i in 1..5 loop
    perform public.enforce_rate_limit('sign_in_email', v_bucket);
  end loop;
  begin
    perform public.enforce_rate_limit('sign_in_email', v_bucket);
    raise exception 'sixth sign-in email was allowed';
  exception
    when others then
      if sqlerrm like '%sixth sign-in email was allowed%' then
        raise;
      end if;
      if sqlerrm not like '%rate_limited%' then
        raise;
      end if;
  end;
  begin
    perform public.enforce_rate_limit('invite_send', null);
    raise exception 'anon sent an invite';
  exception
    when others then
      if sqlerrm like '%anon sent an invite%' then
        raise;
      end if;
      if sqlerrm not like '%Authentication required%' then
        raise;
      end if;
  end;
  begin
    perform 1 from public.rate_limits;
    raise exception 'anon read rate_limits';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%anon read rate_limits%' then
        raise;
      end if;
      if sqlerrm not like '%permission denied%' and sqlerrm not like '%row-level security%' then
        raise;
      end if;
  end;
  execute 'reset role';

  if exists (select 1 from public.rate_limits where created_at < now() - interval '2 hours') then
    raise exception 'old rate limit rows were kept';
  end if;

  select count(*) into v_existing
  from public.rate_limits
  where action = 'invite_send' and bucket = v_admin_bucket and created_at > now() - interval '1 hour';
  if v_existing < 20 then
    insert into public.rate_limits (action, bucket, created_at)
    select 'invite_send', v_admin_bucket, now()
    from generate_series(1, 20 - v_existing);
  end if;

  select id into v_tenant from public.tenants where slug = 'starter-workspace';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set role authenticated';
  begin
    perform public.add_tenant_member(v_tenant, 'blocked@example.com', 'viewer');
    raise exception 'invite over the hourly limit was stored';
  exception
    when others then
      if sqlerrm like '%invite over the hourly limit was stored%' then
        raise;
      end if;
      if sqlerrm not like '%rate_limited%' then
        raise;
      end if;
  end;
  execute 'reset role';

  if exists (
    select 1 from public.workspace_invitations where email = 'blocked@example.com'
  ) then
    raise exception 'a rate-limited invite was written';
  end if;
  if (select count(*) from public.tenants) <> v_tenants then
    raise exception 'rate limit cleanup changed tenants';
  end if;
  if (select count(*) from public.workspace_invitations) <> v_invites then
    raise exception 'rate limit cleanup changed invitations';
  end if;
  if (select count(*) from public.services) <> v_services then
    raise exception 'rate limit cleanup changed services';
  end if;
end $$;

-- anon may execute only enforce_rate_limit. PUBLIC executes nothing. authenticated keeps the allowlist.
do $$
declare
  r record;
  v_allow text[] := array[
    'provision_tenant',
    'ensure_practitioner_access',
    'load_starter_sample_services',
    'add_tenant_member',
    'list_visible_members',
    'import_lookup_options',
    'checkout_blueprint_services',
    'import_framework_elements',
    'log_catalog_export',
    'can_access_tenant',
    'can_write_services',
    'can_admin_tenant',
    'rename_workspace',
    'cancel_workspace_invitation',
    'resend_workspace_invitation',
    'set_member_role',
    'remove_tenant_member',
    'save_workspace_settings',
    'preview_invitation',
    'accept_invitation',
    'list_site_accounts',
    'set_account_active',
    'delete_site_account',
    'delete_workspace',
    'transfer_workspace_owner',
    'can_manage_site',
    'can_edit_service',
    'service_owner_unchanged',
    'upsert_service_owner',
    'archive_service_owner',
    'reactivate_service_owner',
    'import_service_owners',
    'apply_owner_reconciliation',
    'reassign_owned_services',
    'enforce_rate_limit'
  ];
begin
  for r in
    select p.proname, p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    if r.proname = 'enforce_rate_limit' then
      if not has_function_privilege('anon', r.oid, 'execute') then
        raise exception 'anon lost execute on enforce_rate_limit';
      end if;
    elsif has_function_privilege('anon', r.oid, 'execute') then
      raise exception 'anon can execute %', r.proname;
    end if;
    if has_function_privilege('public', r.oid, 'execute') then
      raise exception 'public can execute %', r.proname;
    end if;
    if r.proname = any (v_allow) then
      if not has_function_privilege('authenticated', r.oid, 'execute') then
        raise exception 'authenticated lost execute on %', r.proname;
      end if;
    elsif has_function_privilege('authenticated', r.oid, 'execute') then
      raise exception 'authenticated can still execute %', r.proname;
    end if;
  end loop;
end $$;

-- Ownership, audit rows, and site-admin delete. The invite bucket for the first admin is already full.
do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_manager uuid := '33333333-3333-4333-8333-333333333333';
  v_ops uuid := '66666666-6666-4666-8666-666666666666';
  v_viewer uuid := '77777777-7777-4777-8777-777777777777';
  v_future uuid := '88888888-8888-4888-8888-888888888888';
  v_departing uuid := '99999999-9999-4999-8999-999999999999';
  v_tenant uuid;
  v_other uuid;
  v_invite jsonb;
begin
  select id into v_tenant from public.tenants where slug = 'starter-workspace';
  if not exists (
    select 1 from public.tenants where id = v_tenant and owner_user_id = v_admin
  ) then
    raise exception 'first account was not the workspace owner';
  end if;

  insert into auth.users (id, email) values (v_ops, 'ops@example.com');
  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, v_ops, 'platform_owner');
  insert into auth.users (id, email) values (v_viewer, 'viewer@example.com');
  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, v_viewer, 'viewer');

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set role authenticated';
  begin
    perform public.delete_workspace(v_tenant, 'Northwind Security');
    raise exception 'workspace admin deleted a workspace';
  exception
    when others then
      if sqlerrm like '%workspace admin deleted%' then
        raise;
      end if;
      if sqlerrm not like '%platform owner%' then
        raise;
      end if;
  end;
  begin
    perform public.transfer_workspace_owner(v_tenant, v_manager, null);
    raise exception 'workspace admin transferred ownership';
  exception
    when others then
      if sqlerrm like '%workspace admin transferred%' then
        raise;
      end if;
      if sqlerrm not like '%platform owner%' then
        raise;
      end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_ops::text, true);
  execute 'set role authenticated';
  perform public.set_member_role(v_tenant, v_manager, 'editor');
  perform public.remove_tenant_member(v_tenant, v_viewer);
  v_invite := public.add_tenant_member(v_tenant, 'audit-invite@example.com', 'viewer');
  v_invite := public.resend_workspace_invitation((v_invite->>'id')::uuid);
  perform public.cancel_workspace_invitation((v_invite->>'id')::uuid);
  execute 'reset role';

  if not exists (
    select 1 from public.audit_log
    where tenant_id = v_tenant
      and table_name = 'tenant_members'
      and action = 'update'
      and actor_user_id = v_ops
      and before_data->>'role' = 'service_manager'
      and after_data->>'role' = 'editor'
      and after_data->>'email' = 'manager@example.com'
  ) then
    raise exception 'role change was not audited';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id = v_tenant
      and table_name = 'tenant_members'
      and action = 'delete'
      and actor_user_id = v_ops
      and before_data->>'email' = 'viewer@example.com'
      and before_data->>'role' = 'viewer'
  ) then
    raise exception 'member removal was not audited';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id = v_tenant
      and table_name = 'workspace_invitations'
      and action = 'insert'
      and actor_user_id = v_ops
      and after_data->>'email' = 'audit-invite@example.com'
      and after_data->>'role' = 'viewer'
  ) then
    raise exception 'invitation send was not audited';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id = v_tenant
      and table_name = 'workspace_invitations'
      and action = 'update'
      and actor_user_id = v_ops
      and after_data->>'email' = 'audit-invite@example.com'
      and after_data->>'resent' = 'true'
  ) then
    raise exception 'invitation resend was not audited';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id = v_tenant
      and table_name = 'workspace_invitations'
      and action = 'update'
      and actor_user_id = v_ops
      and after_data->>'email' = 'audit-invite@example.com'
      and after_data->>'cancelled' = 'true'
  ) then
    raise exception 'invitation cancel was not audited';
  end if;

  insert into auth.users (id, email) values (v_departing, 'departing@example.com');
  perform set_config('request.jwt.claim.sub', v_ops::text, true);
  execute 'set role authenticated';
  perform public.set_account_active(v_departing, false);
  perform public.delete_site_account(v_departing, 'departing@example.com');
  execute 'reset role';
  if exists (select 1 from auth.users where id = v_departing) then
    raise exception 'account was not deleted';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id is null
      and actor_user_id = v_ops
      and table_name = 'account_status'
      and action = 'update'
      and after_data->>'email' = 'departing@example.com'
      and after_data->>'active' = 'false'
  ) then
    raise exception 'deactivation was not audited';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id is null
      and actor_user_id = v_ops
      and table_name = 'account_status'
      and action = 'delete'
      and before_data->>'email' = 'departing@example.com'
  ) then
    raise exception 'account deletion was not audited';
  end if;

  perform set_config('request.jwt.claim.sub', v_ops::text, true);
  execute 'set role authenticated';
  v_other := public.provision_tenant('Ops Workspace', 'ops-workspace');
  v_invite := public.transfer_workspace_owner(v_other, null, 'future-owner@example.com');
  execute 'reset role';
  if (select owner_user_id from public.tenants where id = v_other) is distinct from v_ops then
    raise exception 'ownership invite replaced the owner immediately';
  end if;
  if not exists (
    select 1
    from public.workspace_invitations
    where tenant_id = v_other
      and email = 'future-owner@example.com'
      and becomes_owner
      and accepted_at is null
      and cancelled_at is null
  ) then
    raise exception 'ownership invite was not stored';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id = v_other
      and table_name = 'workspace_invitations'
      and action = 'insert'
      and after_data->>'becomes_owner' = 'true'
      and after_data->>'email' = 'future-owner@example.com'
  ) then
    raise exception 'ownership invite was not audited';
  end if;

  insert into auth.users (id, email) values (v_future, 'future-owner@example.com');
  perform set_config('request.jwt.claim.sub', v_future::text, true);
  execute 'set role authenticated';
  perform public.accept_invitation(v_invite->>'token');
  execute 'reset role';
  if (select owner_user_id from public.tenants where id = v_other) is distinct from v_future then
    raise exception 'accepted ownership invite did not transfer ownership';
  end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_other and user_id = v_ops and role = 'tenant_admin'
  ) then
    raise exception 'previous owner did not become admin';
  end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_other and user_id = v_future and role = 'tenant_admin'
  ) then
    raise exception 'new owner is not an admin';
  end if;

  perform set_config('request.jwt.claim.sub', v_ops::text, true);
  execute 'set role authenticated';
  perform public.transfer_workspace_owner(v_tenant, v_manager, null);
  perform public.delete_workspace(v_other, 'Ops Workspace');
  execute 'reset role';
  if (select owner_user_id from public.tenants where id = v_tenant) is distinct from v_manager then
    raise exception 'member transfer did not change the owner';
  end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_tenant and user_id = v_admin and role = 'tenant_admin'
  ) then
    raise exception 'previous starter owner did not stay admin';
  end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_tenant and user_id = v_manager and role = 'tenant_admin'
  ) then
    raise exception 'new starter owner was not made admin';
  end if;
  if exists (select 1 from public.tenants where id = v_other) then
    raise exception 'workspace was not deleted';
  end if;
  if not exists (
    select 1 from public.audit_log
    where tenant_id is null
      and table_name = 'tenants'
      and action = 'delete'
      and actor_user_id = v_ops
      and before_data->>'name' = 'Ops Workspace'
      and before_data->>'tenant_id' = v_other::text
  ) then
    raise exception 'workspace deletion audit did not survive';
  end if;

  perform set_config('request.jwt.claim.sub', v_ops::text, true);
  execute 'set role authenticated';
  begin
    perform public.remove_tenant_member(v_tenant, v_manager);
    raise exception 'removed the owner';
  exception
    when others then
      if sqlerrm like '%removed the owner%' then
        raise;
      end if;
      if sqlerrm not like '%Transfer ownership%' then
        raise;
      end if;
  end;
  execute 'reset role';
end $$;
SQL

echo "Migrations applied and function grants match the allowlist."
