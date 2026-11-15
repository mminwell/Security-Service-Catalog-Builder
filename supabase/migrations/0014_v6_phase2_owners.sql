-- Security Service Catalog Builder — V6 Phase 2, Service Owner directory.
-- Repeatable where noted. Apply after 0013_v6_phase2_members.sql. This file has no credentials.
--
-- Existing rows:
--   services.service_owner text is kept. A value that splits into a first and last name
--   (for example "Minwell, Mike" or "Mike Minwell") becomes one directory row per workspace,
--   deduped on the split names when email is empty, and services.owner_id points at it.
--   The text column is then the generated "Last, First" form. History reason is import.
--   A value that does not split cleanly (for example "SOC Manager" or
--   "Security Architecture (to be named)") is not turned into a person. The original text
--   stays in services.service_owner and is copied to services.owner_review, and
--   services.owner_needed is set true.
--   Blank service_owner values stay blank. owner_id stays null. owner_needed stays false.
--   starter_service_templates.service_owner is not rewritten. Those rows are workspace-neutral
--   source text. Inserting them into a workspace runs the same split on the new service row.
--   No owner row is deleted. There is no delete policy.

create table if not exists public.service_owners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  title text,
  team_code text,
  is_active boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,
  deactivated_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_owners_first_len check (char_length(btrim(first_name)) between 1 and 80),
  constraint service_owners_last_len check (char_length(btrim(last_name)) between 1 and 80),
  constraint service_owners_trimmed check (first_name = btrim(first_name) and last_name = btrim(last_name)),
  constraint service_owners_no_controls check (first_name !~ '[[:cntrl:]]' and last_name !~ '[[:cntrl:]]')
);

create index if not exists service_owners_tenant_last_idx
  on public.service_owners (tenant_id, last_name, first_name);

create table if not exists public.service_owner_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  owner_id uuid not null references public.service_owners (id),
  assignment_role text not null default 'primary'
    check (assignment_role in ('primary', 'backup', 'co_owner')),
  created_at timestamptz not null default now(),
  unique (service_id, assignment_role)
);

comment on table public.service_owner_assignments is
  'One primary person-owner per service today. backup and co_owner are reserved so a later co-owner does not need a new table.';

create table if not exists public.service_owner_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  actor_user_id uuid,
  old_owner_id uuid,
  new_owner_id uuid,
  reason text not null check (reason in ('archive', 'reassign', 'import', 'edit', 'reconcile')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists service_owner_history_service_idx
  on public.service_owner_history (service_id, created_at desc);

alter table public.services
  add column if not exists owner_id uuid,
  add column if not exists owner_needed boolean not null default false,
  add column if not exists owner_review text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_owner_id_fkey') then
    alter table public.services
      add constraint services_owner_id_fkey
      foreign key (owner_id) references public.service_owners (id);
  end if;
end $$;

create or replace function public.owner_name_part_ok(p_part text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_words text[];
  v_word text;
  v_roles text[] := array[
    'manager', 'lead', 'officer', 'engineer', 'architect', 'architecture', 'administration', 'admin',
    'security', 'identity', 'exposure', 'privacy', 'incident', 'response', 'endpoint', 'access',
    'operations', 'awareness', 'risk', 'governance', 'soc', 'director', 'head', 'analyst',
    'specialist', 'coordinator', 'owner', 'team', 'third-party', 'third', 'party'
  ];
begin
  if p_part is null or btrim(p_part) = '' then
    return false;
  end if;
  v_words := regexp_split_to_array(btrim(p_part), '\s+');
  if coalesce(array_length(v_words, 1), 0) < 1 or coalesce(array_length(v_words, 1), 0) > 3 then
    return false;
  end if;
  foreach v_word in array v_words loop
    if lower(v_word) = any (v_roles) then
      return false;
    end if;
    if v_word !~ '^[[:alpha:]][[:alpha:]''’.-]{0,79}$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.split_person_name(p_raw text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_raw, '')), '\s+', ' ', 'g');
  v_left text;
  v_right text;
  v_words text[];
begin
  if v = '' then
    return jsonb_build_object('ok', false, 'reason', 'Name is empty.');
  end if;
  if length(v) > 160 or v ~ '[0-9()\[\]{}]' or v ~* 'to be named' or v ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'reason', 'This looks like a title or a note, not a first and last name.');
  end if;
  if position(',' in v) > 0 then
    if array_length(regexp_split_to_array(v, '\s*,\s*'), 1) <> 2 then
      return jsonb_build_object('ok', false, 'reason', 'A comma-separated name needs exactly a last name and a first name.');
    end if;
    v_left := btrim(split_part(v, ',', 1));
    v_right := btrim(split_part(v, ',', 2));
    if not public.owner_name_part_ok(v_left) or not public.owner_name_part_ok(v_right) then
      return jsonb_build_object('ok', false, 'reason', 'Could not split this name cleanly.');
    end if;
    return jsonb_build_object('ok', true, 'first_name', v_right, 'last_name', v_left);
  end if;
  v_words := regexp_split_to_array(v, ' ');
  if coalesce(array_length(v_words, 1), 0) <> 2
     or not public.owner_name_part_ok(v_words[1])
     or not public.owner_name_part_ok(v_words[2]) then
    return jsonb_build_object('ok', false, 'reason', 'Could not split this name into a first and last name.');
  end if;
  return jsonb_build_object('ok', true, 'first_name', v_words[1], 'last_name', v_words[2]);
end;
$$;

create or replace function public.find_or_create_owner(
  p_tenant uuid,
  p_first text,
  p_last text,
  p_email text,
  p_title text,
  p_team text,
  p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select id into v_id
  from public.service_owners
  where tenant_id = p_tenant
    and lower(first_name) = lower(p_first)
    and lower(last_name) = lower(p_last)
    and lower(coalesce(email, '')) = coalesce(v_email, '')
  order by is_active desc, created_at
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.service_owners (tenant_id, first_name, last_name, email, title, team_code, user_id)
  values (p_tenant, p_first, p_last, v_email, nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_team, '')), ''), p_user)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.apply_service_owner_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_split jsonb;
  v_first text;
  v_last text;
  v_active boolean;
begin
  if new.owner_id is null
     and new.owner_review is null
     and btrim(coalesce(new.service_owner, '')) <> ''
     and coalesce(current_setting('app.skip_owner_link', true), '') <> 'on' then
    v_split := public.split_person_name(new.service_owner);
    if v_split->>'ok' = 'true' then
      new.owner_id := public.find_or_create_owner(
        new.tenant_id,
        v_split->>'first_name',
        v_split->>'last_name',
        null,
        null,
        null,
        null
      );
      new.owner_needed := false;
    else
      new.owner_review := btrim(new.service_owner);
      new.owner_needed := true;
    end if;
  end if;

  if new.owner_id is not null then
    select first_name, last_name, is_active into v_first, v_last, v_active
    from public.service_owners
    where id = new.owner_id and tenant_id = new.tenant_id;
    if v_first is null then
      raise exception 'That owner is not in this workspace';
    end if;
    if coalesce(current_setting('app.skip_owner_link', true), '') <> 'on' then
      new.service_owner := v_last || ', ' || v_first;
    end if;
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id) then
      if v_active then
        new.owner_needed := false;
        new.owner_review := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.record_service_owner_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    v_reason := coalesce(nullif(current_setting('app.owner_change_reason', true), ''), 'edit');
    if v_reason not in ('archive', 'reassign', 'import', 'edit', 'reconcile') then
      v_reason := 'edit';
    end if;
    insert into public.service_owner_history (
      tenant_id, service_id, actor_user_id, old_owner_id, new_owner_id, reason
    ) values (
      new.tenant_id, new.id, auth.uid(), old.owner_id, new.owner_id, v_reason
    );
  elsif tg_op = 'INSERT' and new.owner_id is not null then
    v_reason := coalesce(nullif(current_setting('app.owner_change_reason', true), ''), 'import');
    if v_reason not in ('archive', 'reassign', 'import', 'edit', 'reconcile') then
      v_reason := 'import';
    end if;
    insert into public.service_owner_history (
      tenant_id, service_id, actor_user_id, old_owner_id, new_owner_id, reason, note
    ) values (
      new.tenant_id, new.id, auth.uid(), null, new.owner_id, v_reason, 'Linked when the service was saved'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_c_service_owner on public.services;
create trigger trg_c_service_owner
  before insert or update on public.services
  for each row execute function public.apply_service_owner_link();

drop trigger if exists trg_c_service_owner_history on public.services;
create trigger trg_c_service_owner_history
  after insert or update of owner_id on public.services
  for each row execute function public.record_service_owner_history();

create or replace function public.sync_primary_owner_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return null;
  end if;
  delete from public.service_owner_assignments
  where service_id = new.id and assignment_role = 'primary';
  if new.owner_id is not null then
    insert into public.service_owner_assignments (tenant_id, service_id, owner_id, assignment_role)
    values (new.tenant_id, new.id, new.owner_id, 'primary');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_d_service_owner_assignment on public.services;
create trigger trg_d_service_owner_assignment
  after insert or update of owner_id on public.services
  for each row execute function public.sync_primary_owner_assignment();

create or replace function public.refresh_owner_display()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.skip_owner_link', 'on', true);
  update public.services
  set service_owner = new.last_name || ', ' || new.first_name
  where owner_id = new.id;
  perform set_config('app.skip_owner_link', '', true);
  return new;
end;
$$;

drop trigger if exists trg_owner_display on public.service_owners;
create trigger trg_owner_display
  after update of first_name, last_name on public.service_owners
  for each row
  when (old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name)
  execute function public.refresh_owner_display();

select set_config('app.owner_change_reason', 'import', true);
update public.services
set updated_at = updated_at
where owner_id is null
  and owner_review is null
  and btrim(coalesce(service_owner, '')) <> '';
select set_config('app.owner_change_reason', '', true);

update public.field_definitions
set help_text = 'Person accountable for this service. Choose an active Service Owner. The name is shown as Last, First.'
where field_key = 'service_owner'
  and help_text = 'Named person or role accountable for keeping this entry true.';

alter table public.service_owners enable row level security;
alter table public.service_owners force row level security;
alter table public.service_owner_assignments enable row level security;
alter table public.service_owner_assignments force row level security;
alter table public.service_owner_history enable row level security;
alter table public.service_owner_history force row level security;

drop policy if exists service_owners_select on public.service_owners;
create policy service_owners_select on public.service_owners
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

drop policy if exists service_owners_insert on public.service_owners;
create policy service_owners_insert on public.service_owners
  for insert to authenticated
  with check (public.can_admin_tenant(tenant_id));

drop policy if exists service_owners_update on public.service_owners;
create policy service_owners_update on public.service_owners
  for update to authenticated
  using (public.can_admin_tenant(tenant_id))
  with check (public.can_admin_tenant(tenant_id));

drop policy if exists owner_assignments_select on public.service_owner_assignments;
create policy owner_assignments_select on public.service_owner_assignments
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

drop policy if exists owner_history_select on public.service_owner_history;
create policy owner_history_select on public.service_owner_history
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

revoke all on table public.service_owners from anon, public;
grant select, insert, update on table public.service_owners to authenticated;
revoke all on table public.service_owner_assignments from anon, public;
grant select on table public.service_owner_assignments to authenticated;
revoke all on table public.service_owner_history from anon, public;
grant select on table public.service_owner_history to authenticated;

create or replace function public.can_edit_service(p_service uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_services((select s.tenant_id from public.services s where s.id = p_service))
    or exists (
      select 1
      from public.services s
      join public.service_owners o on o.id = s.owner_id and o.tenant_id = s.tenant_id
      join public.tenant_members m
        on m.tenant_id = s.tenant_id
       and m.user_id = auth.uid()
       and m.role = 'service_manager'
      where s.id = p_service
        and o.user_id = auth.uid()
        and o.is_active
        and not o.deactivated_user
        and public.account_is_active()
    );
$$;

create or replace function public.service_owner_unchanged(p_service uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.services
    where id = p_service
      and owner_id is not distinct from p_owner
  );
$$;

drop policy if exists services_update on public.services;
create policy services_update on public.services
  for update to authenticated
  using (public.can_write_services(tenant_id) or public.can_edit_service(id))
  with check (
    public.can_write_services(tenant_id)
    or (
      public.can_edit_service(id)
      and public.service_owner_unchanged(id, owner_id)
    )
  );

drop policy if exists mappings_insert on public.service_outcome_mappings;
create policy mappings_insert on public.service_outcome_mappings
  for insert to authenticated
  with check (public.can_write_services(tenant_id) or public.can_edit_service(service_id));

drop policy if exists mappings_update on public.service_outcome_mappings;
create policy mappings_update on public.service_outcome_mappings
  for update to authenticated
  using (public.can_write_services(tenant_id) or public.can_edit_service(service_id))
  with check (public.can_write_services(tenant_id) or public.can_edit_service(service_id));

drop policy if exists mappings_delete on public.service_outcome_mappings;
create policy mappings_delete on public.service_outcome_mappings
  for delete to authenticated
  using (public.can_write_services(tenant_id) or public.can_edit_service(service_id));

drop policy if exists artifact_links_insert on public.artifact_service_links;
create policy artifact_links_insert on public.artifact_service_links
  for insert to authenticated
  with check (public.can_write_services(tenant_id) or public.can_edit_service(service_id));

drop policy if exists artifact_links_update on public.artifact_service_links;
create policy artifact_links_update on public.artifact_service_links
  for update to authenticated
  using (public.can_write_services(tenant_id) or public.can_edit_service(service_id))
  with check (public.can_write_services(tenant_id) or public.can_edit_service(service_id));

drop policy if exists artifact_links_delete on public.artifact_service_links;
create policy artifact_links_delete on public.artifact_service_links
  for delete to authenticated
  using (public.can_write_services(tenant_id) or public.can_edit_service(service_id));

create or replace function public.upsert_service_owner(p_tenant uuid, p_owner jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_owner->>'id', '')::uuid;
  v_first text := btrim(coalesce(p_owner->>'first_name', ''));
  v_last text := btrim(coalesce(p_owner->>'last_name', ''));
  v_email text := nullif(lower(btrim(coalesce(p_owner->>'email', ''))), '');
  v_title text := nullif(btrim(coalesce(p_owner->>'title', '')), '');
  v_team text := nullif(btrim(coalesce(p_owner->>'team_code', '')), '');
  v_user uuid := nullif(p_owner->>'user_id', '')::uuid;
  v_deactivated boolean := false;
  v_history text := coalesce(nullif(p_owner->>'history_reason', ''), 'edit');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can edit the Service Owner directory';
  end if;
  if char_length(v_first) < 1 or char_length(v_first) > 80 or char_length(v_last) < 1 or char_length(v_last) > 80 then
    raise exception 'First name and last name are required';
  end if;
  if v_first ~ '[[:cntrl:]]' or v_last ~ '[[:cntrl:]]' then
    raise exception 'Names cannot include control characters';
  end if;
  if public.split_person_name(v_last || ', ' || v_first)->>'ok' <> 'true' then
    raise exception 'Enter a real first and last name';
  end if;
  if v_email is not null and (v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 320) then
    raise exception 'Enter a valid email address';
  end if;
  if v_team is not null and not exists (
    select 1
    from public.lookup_options
    where tenant_id = p_tenant and field_key = 'team' and code = v_team and is_active
  ) then
    raise exception 'Team is not in the team lookup';
  end if;
  if v_user is not null and not exists (
    select 1 from public.tenant_members where tenant_id = p_tenant and user_id = v_user
  ) then
    raise exception 'That account is not a member of this workspace';
  end if;
  if v_user is not null and v_email is null then
    select lower(email) into v_email from auth.users where id = v_user;
  end if;
  if v_user is not null and exists (
    select 1 from public.account_status where user_id = v_user and deactivated_at is not null
  ) then
    v_deactivated := true;
  end if;
  if v_history not in ('archive', 'reassign', 'import', 'edit', 'reconcile') then
    v_history := 'edit';
  end if;

  if v_id is null then
    insert into public.service_owners (
      tenant_id, first_name, last_name, email, title, team_code, user_id, deactivated_user
    ) values (
      p_tenant, v_first, v_last, v_email, v_title, v_team, v_user, v_deactivated
    ) returning id into v_id;
    insert into public.service_owner_history (
      tenant_id, service_id, actor_user_id, new_owner_id, reason, note
    ) values (
      p_tenant, null, auth.uid(), v_id, v_history, 'Added to the directory'
    );
    return v_id;
  end if;

  if not exists (select 1 from public.service_owners where id = v_id and tenant_id = p_tenant) then
    raise exception 'That owner is not in this workspace';
  end if;
  update public.service_owners
  set
    first_name = v_first,
    last_name = v_last,
    email = v_email,
    title = v_title,
    team_code = v_team,
    user_id = v_user,
    deactivated_user = v_deactivated,
    updated_at = now()
  where id = v_id;
  insert into public.service_owner_history (
    tenant_id, service_id, actor_user_id, old_owner_id, new_owner_id, reason, note
  ) values (
    p_tenant, null, auth.uid(), v_id, v_id, v_history, 'Directory record updated'
  );
  return v_id;
end;
$$;

create or replace function public.archive_service_owner(p_owner uuid, p_replacement uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_count integer := 0;
  v_service record;
  v_reason text := coalesce(p_reason, 'archive');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if v_reason not in ('archive', 'reconcile') then
    raise exception 'Unknown archive reason';
  end if;
  select tenant_id into v_tenant from public.service_owners where id = p_owner;
  if v_tenant is null then
    raise exception 'That owner is not in this workspace';
  end if;
  if not public.can_admin_tenant(v_tenant) then
    raise exception 'Only an Admin can archive an owner';
  end if;
  if p_replacement is not null then
    if p_replacement = p_owner then
      raise exception 'Choose a different replacement owner';
    end if;
    if not exists (
      select 1 from public.service_owners
      where id = p_replacement and tenant_id = v_tenant and is_active and not deactivated_user
    ) then
      raise exception 'The replacement owner must be active';
    end if;
  end if;

  perform set_config('app.owner_change_reason', v_reason, true);
  if p_replacement is null then
    update public.service_owners set is_active = false, updated_at = now() where id = p_owner;
    for v_service in
      select id from public.services where tenant_id = v_tenant and owner_id = p_owner
    loop
      update public.services
      set owner_needed = true, updated_at = now()
      where id = v_service.id;
      insert into public.service_owner_history (
        tenant_id, service_id, actor_user_id, old_owner_id, new_owner_id, reason, note
      ) values (
        v_tenant, v_service.id, auth.uid(), p_owner, null, v_reason, 'No replacement. Marked Owner needed.'
      );
      v_count := v_count + 1;
    end loop;
  else
    update public.services
    set owner_id = p_replacement, owner_needed = false, updated_at = now()
    where tenant_id = v_tenant and owner_id = p_owner;
    get diagnostics v_count = row_count;
    update public.service_owners set is_active = false, updated_at = now() where id = p_owner;
  end if;
  perform set_config('app.owner_change_reason', '', true);
  return v_count;
end;
$$;

create or replace function public.reactivate_service_owner(p_owner uuid)
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
  select tenant_id into v_tenant from public.service_owners where id = p_owner;
  if v_tenant is null then
    raise exception 'That owner is not in this workspace';
  end if;
  if not public.can_admin_tenant(v_tenant) then
    raise exception 'Only an Admin can reactivate an owner';
  end if;
  update public.service_owners
  set is_active = true, updated_at = now()
  where id = p_owner;
  update public.services
  set owner_needed = false
  where owner_id = p_owner and owner_needed;
end;
$$;

create or replace function public.import_service_owners(p_tenant uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_first text;
  v_last text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can import owners';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a list';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_first := btrim(coalesce(v_row->>'first_name', ''));
    v_last := btrim(coalesce(v_row->>'last_name', ''));
    if public.split_person_name(v_last || ', ' || v_first)->>'ok' <> 'true' then
      raise exception 'A row could not be split into a first and last name';
    end if;
    select id into v_id
    from public.service_owners
    where tenant_id = p_tenant
      and lower(first_name) = lower(v_first)
      and lower(last_name) = lower(v_last)
      and lower(coalesce(email, '')) = coalesce(nullif(lower(btrim(coalesce(v_row->>'email', ''))), ''), '');
    perform public.upsert_service_owner(p_tenant, jsonb_build_object(
      'id', v_id,
      'first_name', v_first,
      'last_name', v_last,
      'email', nullif(btrim(coalesce(v_row->>'email', '')), ''),
      'title', v_row->>'title',
      'team_code', v_row->>'team_code',
      'user_id', v_row->>'user_id',
      'history_reason', 'import'
    ));
    if v_id is null then
      v_created := v_created + 1;
    else
      v_updated := v_updated + 1;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

create or replace function public.apply_owner_reconciliation(p_tenant uuid, p_owner_ids uuid[], p_replacement uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_total integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only an Admin can reconcile owners';
  end if;
  if p_owner_ids is null then
    return 0;
  end if;
  foreach v_owner in array p_owner_ids loop
    if not exists (select 1 from public.service_owners where id = v_owner and tenant_id = p_tenant) then
      raise exception 'That owner is not in this workspace';
    end if;
    v_total := v_total + public.archive_service_owner(v_owner, p_replacement, 'reconcile');
  end loop;
  return v_total;
end;
$$;

revoke all on function public.owner_name_part_ok(text) from public, anon, authenticated;
revoke all on function public.split_person_name(text) from public, anon, authenticated;
revoke all on function public.find_or_create_owner(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.apply_service_owner_link() from public, anon, authenticated;
revoke all on function public.record_service_owner_history() from public, anon, authenticated;
revoke all on function public.sync_primary_owner_assignment() from public, anon, authenticated;
revoke all on function public.refresh_owner_display() from public, anon, authenticated;
revoke all on function public.service_owner_unchanged(uuid, uuid) from public, anon;
grant execute on function public.service_owner_unchanged(uuid, uuid) to authenticated;

revoke all on function public.can_edit_service(uuid) from public, anon;
grant execute on function public.can_edit_service(uuid) to authenticated;

revoke all on function public.upsert_service_owner(uuid, jsonb) from public, anon;
grant execute on function public.upsert_service_owner(uuid, jsonb) to authenticated;

revoke all on function public.archive_service_owner(uuid, uuid, text) from public, anon;
grant execute on function public.archive_service_owner(uuid, uuid, text) to authenticated;

revoke all on function public.reactivate_service_owner(uuid) from public, anon;
grant execute on function public.reactivate_service_owner(uuid) to authenticated;

revoke all on function public.import_service_owners(uuid, jsonb) from public, anon;
grant execute on function public.import_service_owners(uuid, jsonb) to authenticated;

revoke all on function public.apply_owner_reconciliation(uuid, uuid[], uuid) from public, anon;
grant execute on function public.apply_owner_reconciliation(uuid, uuid[], uuid) to authenticated;

create or replace function public.reassign_owned_services(p_owner uuid, p_replacement uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_count integer := 0;
  v_service record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select tenant_id into v_tenant from public.service_owners where id = p_owner;
  if v_tenant is null then
    raise exception 'That owner is not in this workspace';
  end if;
  if not public.can_admin_tenant(v_tenant) then
    raise exception 'Only an Admin can reassign services';
  end if;
  if p_replacement is not null and not exists (
    select 1 from public.service_owners
    where id = p_replacement and tenant_id = v_tenant and is_active
  ) then
    raise exception 'The replacement owner must be active';
  end if;
  perform set_config('app.owner_change_reason', 'reassign', true);
  if p_replacement is null then
    for v_service in select id from public.services where tenant_id = v_tenant and owner_id = p_owner loop
      update public.services set owner_needed = true, updated_at = now() where id = v_service.id;
      insert into public.service_owner_history (
        tenant_id, service_id, actor_user_id, old_owner_id, new_owner_id, reason, note
      ) values (
        v_tenant, v_service.id, auth.uid(), p_owner, null, 'reassign', 'No replacement. Marked Owner needed.'
      );
      v_count := v_count + 1;
    end loop;
  else
    update public.services
    set owner_id = p_replacement, owner_needed = false, updated_at = now()
    where tenant_id = v_tenant and owner_id = p_owner;
    get diagnostics v_count = row_count;
  end if;
  perform set_config('app.owner_change_reason', '', true);
  return v_count;
end;
$$;

revoke all on function public.reassign_owned_services(uuid, uuid) from public, anon;
grant execute on function public.reassign_owned_services(uuid, uuid) to authenticated;
