-- Security Service Catalog Builder — V6 profiles.
-- Repeatable where noted. Apply after 0011_v5_rename_workspace.sql. This file has no credentials.
-- Stores the signed-in person's first name, last name, and company.
-- It does not backfill existing accounts and does not rename workspaces that already exist.
-- A company name is used only when this account's first workspace is created automatically.
-- Authorization does not read auth user metadata. The profile row is the stored name.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  company text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_first_name_len check (char_length(btrim(first_name)) between 1 and 80),
  constraint user_profiles_last_name_len check (char_length(btrim(last_name)) between 1 and 80),
  constraint user_profiles_company_len check (char_length(btrim(company)) between 2 and 80),
  constraint user_profiles_trimmed check (
    first_name = btrim(first_name)
    and last_name = btrim(last_name)
    and company = btrim(company)
  ),
  constraint user_profiles_no_controls check (
    first_name !~ '[[:cntrl:]]'
    and last_name !~ '[[:cntrl:]]'
    and company !~ '[[:cntrl:]]'
  )
);

comment on table public.user_profiles is
  'Name and company for the signed-in account. Each person can read and update only their own row. Existing accounts get a row when they save it.';

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.user_profiles from anon, public;
grant select, insert, update on table public.user_profiles to authenticated;

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
  if v_first is null or v_last is null or v_company is null then
    return new;
  end if;
  if char_length(v_first) > 80 or char_length(v_last) > 80 then
    return new;
  end if;
  if char_length(v_company) < 2 or char_length(v_company) > 80 then
    return new;
  end if;
  if v_first ~ '[[:cntrl:]]' or v_last ~ '[[:cntrl:]]' or v_company ~ '[[:cntrl:]]' then
    return new;
  end if;

  insert into public.user_profiles (user_id, first_name, last_name, company)
  values (new.id, v_first, v_last, v_company)
  on conflict (user_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        company = excluded.company,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.copy_signup_profile() from public, anon, authenticated;

drop trigger if exists trg_auth_user_profile on auth.users;
create trigger trg_auth_user_profile
  after insert on auth.users
  for each row execute function public.copy_signup_profile();

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

revoke all on function public.ensure_practitioner_access() from public, anon;
grant execute on function public.ensure_practitioner_access() to authenticated;
