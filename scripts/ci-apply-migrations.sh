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

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
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
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  execute 'set role authenticated';
  v_tenant := public.ensure_practitioner_access();
  if v_tenant is null then
    raise exception 'ensure_practitioner_access returned null';
  end if;

  v_invite := public.add_tenant_member(v_tenant, 'editor@example.com', 'editor');
  if v_invite->>'status' is distinct from 'invited' then
    raise exception 'invite did not stay pending: %', v_invite;
  end if;

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
    select 1 from public.tenants where id = v_tenant and name = 'Starter Workspace'
  ) then
    raise exception 'Starter Workspace was not created';
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

-- anon and PUBLIC must not execute any public function. authenticated keeps the allowlist.
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
    'can_admin_tenant'
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
    if has_function_privilege('anon', r.oid, 'execute') then
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
SQL

echo "Migrations applied and function grants match the allowlist."
