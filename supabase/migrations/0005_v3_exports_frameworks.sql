-- Security Service Catalog Builder — V3 audience exports and framework registry.
-- Repeatable. Profiles, optional field groups, tenant-scoped framework imports.
-- Apply after 0004_v2_csf_mappings.sql. This file has no credentials.
-- NIST CSF 2.0 is not replaced. Other frameworks ship without control text.

alter table public.field_definitions
  add column if not exists field_group text;

alter table public.field_definitions
  drop constraint if exists field_definitions_field_group_check;

alter table public.field_definitions
  add constraint field_definitions_field_group_check
  check (field_group is null or field_group in ('geography', 'privacy'));

alter table public.frameworks
  add column if not exists content_state text not null default 'not_loaded',
  add column if not exists license_note text not null default '';

alter table public.frameworks
  drop constraint if exists frameworks_content_state_check;

alter table public.frameworks
  add constraint frameworks_content_state_check
  check (content_state in ('seeded', 'not_loaded'));

update public.frameworks
set content_state = 'seeded'
where code = 'NIST-CSF';

alter table public.framework_elements
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

alter table public.framework_elements
  drop constraint if exists framework_elements_framework_id_code_key;

create unique index if not exists framework_elements_global_code_uidx
  on public.framework_elements (framework_id, code)
  where tenant_id is null;

create unique index if not exists framework_elements_tenant_code_uidx
  on public.framework_elements (tenant_id, framework_id, code)
  where tenant_id is not null;

create index if not exists framework_elements_tenant_idx
  on public.framework_elements (tenant_id, framework_id, sort_order);

create table if not exists public.export_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  audience text not null check (audience in ('public', 'internal')),
  field_keys text[] not null,
  is_default boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create unique index if not exists export_profiles_one_default_uidx
  on public.export_profiles (tenant_id)
  where is_default;

create or replace function public.export_profile_one_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_default then
    update public.export_profiles
      set is_default = false
      where tenant_id = new.tenant_id
        and id <> new.id
        and is_default;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_a_export_profile_default on public.export_profiles;
create trigger trg_a_export_profile_default
  before insert or update on public.export_profiles
  for each row execute function public.export_profile_one_default();

drop trigger if exists trg_b_export_profile_audit on public.export_profiles;
create trigger trg_b_export_profile_audit
  before insert or update or delete on public.export_profiles
  for each row execute function public.write_audit();

create or replace function public.enforce_outcome_mapping()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid;
  v_element_tenant uuid;
  v_type text;
begin
  select tenant_id into v_tenant from public.services where id = new.service_id;
  if v_tenant is null then
    raise exception 'Outcome assessments belong to a service';
  end if;
  if v_tenant <> new.tenant_id then
    raise exception 'Outcome assessments stay in the service workspace';
  end if;
  select tenant_id, element_type into v_element_tenant, v_type
  from public.framework_elements
  where id = new.element_id;
  if v_type is distinct from 'subcategory' then
    raise exception 'Map a subcategory outcome';
  end if;
  if v_element_tenant is not null and v_element_tenant <> new.tenant_id then
    raise exception 'That outcome belongs to another workspace';
  end if;
  if new.coverage not in ('full', 'partial', 'none') then
    raise exception 'Coverage must be full, partial, or none';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function public.import_framework_elements(
  p_tenant uuid,
  p_framework uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_version text;
  v_row jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_id uuid;
  v_count integer;
begin
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only a workspace admin can import framework content';
  end if;
  select code, version into v_code, v_version
  from public.frameworks
  where id = p_framework
    and is_active;
  if v_code is null then
    raise exception 'That framework is not available';
  end if;
  if v_code = 'NIST-CSF' then
    raise exception 'NIST CSF 2.0 stays on the reference-tool core';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import is limited to 5000 rows';
  end if;

  select count(*) into v_count
  from jsonb_array_elements(p_rows) as item(value)
  where coalesce(value->>'version', '') is distinct from v_version
     or coalesce(value->>'code', '') = ''
     or coalesce(value->>'title', '') = ''
     or coalesce(value->>'statement', '') = ''
     or coalesce(value->>'element_type', '') not in ('function', 'category', 'subcategory');
  if v_count > 0 then
    raise exception 'Each row needs an id, title, outcome, a supported type, and version %', v_version;
  end if;

  select count(*) into v_count
  from jsonb_array_elements(p_rows) as item(value)
  where nullif(value->>'parent_code', '') is not null
    and not exists (
      select 1
      from jsonb_array_elements(p_rows) as parent(value)
      where parent.value->>'code' = item.value->>'parent_code'
    )
    and not exists (
      select 1
      from public.framework_elements as existing
      where existing.tenant_id = p_tenant
        and existing.framework_id = p_framework
        and existing.code = item.value->>'parent_code'
    );
  if v_count > 0 then
    raise exception 'A parent id is missing from this import';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    select id into v_id
    from public.framework_elements
    where tenant_id = p_tenant
      and framework_id = p_framework
      and code = left(v_row->>'code', 80);
    if v_id is null then
      insert into public.framework_elements (
        tenant_id, framework_id, element_type, code, parent_id, title, statement, sort_order
      ) values (
        p_tenant,
        p_framework,
        v_row->>'element_type',
        left(v_row->>'code', 80),
        null,
        left(v_row->>'title', 300),
        left(v_row->>'statement', 4000),
        coalesce(nullif(v_row->>'sort_order', '')::integer, 0)
      );
      v_created := v_created + 1;
    else
      update public.framework_elements
      set element_type = v_row->>'element_type',
          title = left(v_row->>'title', 300),
          statement = left(v_row->>'statement', 4000),
          sort_order = coalesce(nullif(v_row->>'sort_order', '')::integer, sort_order)
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  update public.framework_elements as child
  set parent_id = parent.id
  from jsonb_array_elements(p_rows) as item(value)
  join public.framework_elements as parent
    on parent.tenant_id = p_tenant
   and parent.framework_id = p_framework
   and parent.code = nullif(item.value->>'parent_code', '')
  where child.tenant_id = p_tenant
    and child.framework_id = p_framework
    and child.code = item.value->>'code'
    and nullif(item.value->>'parent_code', '') is not null;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

create or replace function public.log_catalog_export(p_tenant uuid, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_codes jsonb := '[]'::jsonb;
begin
  if not public.can_access_tenant(p_tenant) then
    raise exception 'You do not have access to this workspace';
  end if;
  select email into v_actor from auth.users where id = auth.uid();
  if jsonb_typeof(p_meta->'framework_codes') = 'array' then
    select coalesce(jsonb_agg(left(item.value, 40)), '[]'::jsonb)
      into v_codes
    from (
      select value
      from jsonb_array_elements_text(p_meta->'framework_codes') as item(value)
      limit 12
    ) as item;
  end if;
  insert into public.audit_log (
    tenant_id, actor_user_id, actor_label, table_name, row_id, action, before_data, after_data
  ) values (
    p_tenant,
    auth.uid(),
    coalesce(v_actor, 'member'),
    'catalog_exports',
    gen_random_uuid(),
    'insert',
    null,
    jsonb_build_object(
      'format', left(coalesce(p_meta->>'format', ''), 32),
      'profile_id', nullif(left(coalesce(p_meta->>'profile_id', ''), 80), ''),
      'profile_name', left(coalesce(p_meta->>'profile_name', ''), 120),
      'audience', case when p_meta->>'audience' = 'internal' then 'internal' else 'public' end,
      'field_count', case
        when coalesce(p_meta->>'field_count', '') ~ '^[0-9]+$' then least((p_meta->>'field_count')::integer, 10000)
        else 0
      end,
      'row_count', case
        when coalesce(p_meta->>'row_count', '') ~ '^[0-9]+$' then least((p_meta->>'row_count')::integer, 100000)
        else 0
      end,
      'marking', coalesce(p_meta->>'marking', '') in ('true', 't', '1'),
      'framework_codes', v_codes
    )
  );
end;
$$;

alter table public.export_profiles enable row level security;
alter table public.export_profiles force row level security;

drop policy if exists export_profiles_select on public.export_profiles;
create policy export_profiles_select on public.export_profiles
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

drop policy if exists export_profiles_insert on public.export_profiles;
create policy export_profiles_insert on public.export_profiles
  for insert to authenticated
  with check (public.can_admin_tenant(tenant_id));

drop policy if exists export_profiles_update on public.export_profiles;
create policy export_profiles_update on public.export_profiles
  for update to authenticated
  using (public.can_admin_tenant(tenant_id))
  with check (public.can_admin_tenant(tenant_id));

drop policy if exists export_profiles_delete on public.export_profiles;
create policy export_profiles_delete on public.export_profiles
  for delete to authenticated
  using (public.can_admin_tenant(tenant_id));

drop policy if exists framework_elements_select on public.framework_elements;
create policy framework_elements_select on public.framework_elements
  for select to authenticated
  using (
    (
      tenant_id is null
      and exists (
        select 1 from public.frameworks
        where frameworks.id = framework_elements.framework_id
          and frameworks.is_active
      )
    )
    or (tenant_id is not null and public.can_access_tenant(tenant_id))
  );

drop policy if exists framework_elements_insert on public.framework_elements;
create policy framework_elements_insert on public.framework_elements
  for insert to authenticated
  with check (
    tenant_id is not null
    and public.can_admin_tenant(tenant_id)
    and exists (
      select 1 from public.frameworks
      where frameworks.id = framework_elements.framework_id
        and frameworks.code <> 'NIST-CSF'
    )
  );

drop policy if exists framework_elements_update on public.framework_elements;
create policy framework_elements_update on public.framework_elements
  for update to authenticated
  using (tenant_id is not null and public.can_admin_tenant(tenant_id))
  with check (
    tenant_id is not null
    and public.can_admin_tenant(tenant_id)
    and exists (
      select 1 from public.frameworks
      where frameworks.id = framework_elements.framework_id
        and frameworks.code <> 'NIST-CSF'
    )
  );

drop policy if exists framework_elements_delete on public.framework_elements;
create policy framework_elements_delete on public.framework_elements
  for delete to authenticated
  using (
    tenant_id is not null
    and public.can_admin_tenant(tenant_id)
    and exists (
      select 1 from public.frameworks
      where frameworks.id = framework_elements.framework_id
        and frameworks.code <> 'NIST-CSF'
    )
  );

revoke all on table public.export_profiles from anon, public;
grant select, insert, update, delete on table public.export_profiles to authenticated;

revoke all on function public.import_framework_elements(uuid, uuid, jsonb) from public, anon;
revoke all on function public.log_catalog_export(uuid, jsonb) from public, anon;
grant execute on function public.import_framework_elements(uuid, uuid, jsonb) to authenticated;
grant execute on function public.log_catalog_export(uuid, jsonb) to authenticated;

-- OPTIONAL_CATALOG_BEGIN
-- Optional geography and privacy fields. Inactive until an admin enables the group.
-- Re-running does not turn a group back off and does not delete stored values.

insert into public.field_definitions (
  tenant_id, field_key, label, help_text, input_type, lookup_field_key,
  is_required, visibility, depth_level, sort_order, is_active, is_standard
) values
  (null, $sscb$data_residency_regions$sscb$, $sscb$Data residency regions$sscb$, $sscb$Regions this workspace has recorded for where the service runs or stores data. A recorded region is not a legal residency determination.$sscb$, $sscb$multi_select$sscb$, $sscb$data_residency_region$sscb$, false, $sscb$public$sscb$, 2, 450, false, true),
  (null, $sscb$hosting_model$sscb$, $sscb$Hosting model$sscb$, $sscb$Where the workspace says this service is hosted. This is an operational note, not a finding about sovereignty or a contract.$sscb$, $sscb$dropdown$sscb$, $sscb$hosting_model$sscb$, false, $sscb$public$sscb$, 2, 460, false, true),
  (null, $sscb$personal_data_recorded$sscb$, $sscb$Personal data recorded$sscb$, $sscb$Whether this workspace has recorded that the service handles personal data. Yes is not a legal classification and does not mean a privacy law applies.$sscb$, $sscb$dropdown$sscb$, $sscb$personal_data_recorded$sscb$, false, $sscb$public$sscb$, 2, 470, false, true),
  (null, $sscb$recorded_jurisdictions$sscb$, $sscb$Recorded jurisdictions$sscb$, $sscb$Jurisdictions the workspace has noted for people whose data the service may handle. This is not a finding that a privacy law applies.$sscb$, $sscb$multi_select$sscb$, $sscb$recorded_jurisdiction$sscb$, false, $sscb$public$sscb$, 2, 480, false, true),
  (null, $sscb$privacy_operations_notes$sscb$, $sscb$Privacy operations notes$sscb$, $sscb$Operational privacy notes for this service. This catalog does not conclude that a law, contract, or framework is met.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 3, 490, false, true)
on conflict (field_key) where tenant_id is null do nothing;

insert into public.field_definitions (
  tenant_id, field_key, label, help_text, input_type, lookup_field_key,
  is_required, visibility, depth_level, sort_order, is_active, is_standard
)
select t.id, s.field_key, s.label, s.help_text, s.input_type, s.lookup_field_key,
  s.is_required, s.visibility, s.depth_level, s.sort_order, s.is_active, s.is_standard
from public.tenants t
join public.field_definitions s
  on s.tenant_id is null
 and s.field_key in ($sscb$data_residency_regions$sscb$, $sscb$hosting_model$sscb$, $sscb$personal_data_recorded$sscb$, $sscb$recorded_jurisdictions$sscb$, $sscb$privacy_operations_notes$sscb$)
where not exists (
  select 1 from public.field_definitions existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
);

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
  (null, $sscb$data_residency_region$sscb$, $sscb$not_recorded$sscb$, $sscb$Not recorded$sscb$, $sscb$The workspace has not recorded a region.$sscb$, null, 10, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$customer_environment$sscb$, $sscb$Customer environment$sscb$, $sscb$The service runs in the customer’s own environment.$sscb$, null, 20, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$on_premises$sscb$, $sscb$On premises$sscb$, $sscb$The workspace records this service as on premises.$sscb$, null, 30, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$us$sscb$, $sscb$United States$sscb$, $sscb$A United States region the workspace recorded. Not a legal conclusion.$sscb$, null, 40, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$ca$sscb$, $sscb$Canada$sscb$, $sscb$A Canada region the workspace recorded. Not a legal conclusion.$sscb$, null, 50, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$uk$sscb$, $sscb$United Kingdom$sscb$, $sscb$A United Kingdom region the workspace recorded. Not a legal conclusion.$sscb$, null, 60, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$eea$sscb$, $sscb$European Economic Area$sscb$, $sscb$An EEA region the workspace recorded. Not a legal conclusion.$sscb$, null, 70, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$apac$sscb$, $sscb$Asia Pacific$sscb$, $sscb$An Asia Pacific region the workspace recorded. Not a legal conclusion.$sscb$, null, 80, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$latam$sscb$, $sscb$Latin America$sscb$, $sscb$A Latin America region the workspace recorded. Not a legal conclusion.$sscb$, null, 90, true),
  (null, $sscb$data_residency_region$sscb$, $sscb$other$sscb$, $sscb$Other recorded region$sscb$, $sscb$Another region named in the service notes.$sscb$, null, 100, true),
  (null, $sscb$hosting_model$sscb$, $sscb$not_recorded$sscb$, $sscb$Not recorded$sscb$, $sscb$The workspace has not recorded a hosting model.$sscb$, null, 10, true),
  (null, $sscb$hosting_model$sscb$, $sscb$customer_environment$sscb$, $sscb$Customer environment$sscb$, $sscb$Hosted in the customer’s environment.$sscb$, null, 20, true),
  (null, $sscb$hosting_model$sscb$, $sscb$on_premises$sscb$, $sscb$On premises$sscb$, $sscb$Hosted on premises.$sscb$, null, 30, true),
  (null, $sscb$hosting_model$sscb$, $sscb$single_region$sscb$, $sscb$Single region$sscb$, $sscb$The workspace records a single hosting region.$sscb$, null, 40, true),
  (null, $sscb$hosting_model$sscb$, $sscb$multi_region$sscb$, $sscb$Multiple regions$sscb$, $sscb$The workspace records more than one hosting region.$sscb$, null, 50, true),
  (null, $sscb$personal_data_recorded$sscb$, $sscb$not_recorded$sscb$, $sscb$Not recorded$sscb$, $sscb$The workspace has not recorded whether personal data is handled.$sscb$, null, 10, true),
  (null, $sscb$personal_data_recorded$sscb$, $sscb$no$sscb$, $sscb$No$sscb$, $sscb$The workspace recorded that this service does not handle personal data.$sscb$, null, 20, true),
  (null, $sscb$personal_data_recorded$sscb$, $sscb$yes$sscb$, $sscb$Yes$sscb$, $sscb$The workspace recorded that this service handles personal data. This is not a legal classification.$sscb$, null, 30, true),
  (null, $sscb$recorded_jurisdiction$sscb$, $sscb$not_recorded$sscb$, $sscb$Not recorded$sscb$, $sscb$The workspace has not recorded a jurisdiction.$sscb$, null, 10, true),
  (null, $sscb$recorded_jurisdiction$sscb$, $sscb$us$sscb$, $sscb$United States$sscb$, $sscb$Noted by the workspace. Not a finding that a US privacy law applies.$sscb$, null, 20, true),
  (null, $sscb$recorded_jurisdiction$sscb$, $sscb$ca$sscb$, $sscb$Canada$sscb$, $sscb$Noted by the workspace. Not a finding that a Canadian privacy law applies.$sscb$, null, 30, true),
  (null, $sscb$recorded_jurisdiction$sscb$, $sscb$uk$sscb$, $sscb$United Kingdom$sscb$, $sscb$Noted by the workspace. Not a finding that a UK privacy law applies.$sscb$, null, 40, true),
  (null, $sscb$recorded_jurisdiction$sscb$, $sscb$eea$sscb$, $sscb$European Economic Area$sscb$, $sscb$Noted by the workspace. Not a finding that an EEA privacy law applies.$sscb$, null, 50, true),
  (null, $sscb$recorded_jurisdiction$sscb$, $sscb$other$sscb$, $sscb$Other$sscb$, $sscb$Another jurisdiction named in the service notes.$sscb$, null, 60, true)
on conflict (field_key, code) where tenant_id is null do nothing;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
)
select t.id, s.field_key, s.code, s.label, s.description, s.code_prefix, s.sort_order, s.is_active
from public.tenants t
join public.lookup_options s
  on s.tenant_id is null
 and s.field_key in ($sscb$data_residency_region$sscb$, $sscb$hosting_model$sscb$, $sscb$personal_data_recorded$sscb$, $sscb$recorded_jurisdiction$sscb$)
where not exists (
  select 1 from public.lookup_options existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
    and existing.code = s.code
);

update public.field_definitions
set field_group = $sscb$geography$sscb$
where field_key in ($sscb$data_residency_regions$sscb$, $sscb$hosting_model$sscb$)
  and field_group is distinct from $sscb$geography$sscb$;

update public.field_definitions
set field_group = $sscb$privacy$sscb$
where field_key in ($sscb$personal_data_recorded$sscb$, $sscb$recorded_jurisdictions$sscb$, $sscb$privacy_operations_notes$sscb$)
  and field_group is distinct from $sscb$privacy$sscb$;
-- OPTIONAL_CATALOG_END

-- FRAMEWORK_REGISTRY_BEGIN
-- Selectable frameworks with no control text. NIST CSF 2.0 is not updated here.

insert into public.frameworks (
  id, code, version, name, published_on, publication, publication_url,
  source_title, source_tool, source_url, reference_tool_url, retrieved_on,
  export_change_log, export_generated_at, export_sha256, content_sha256,
  id_namespace, excluded_withdrawn_rows, provenance, is_active, content_state, license_note
) values
  ($sscb$ddbb042c-94ed-534b-b984-cf73b4d118bd$sscb$::uuid, $sscb$ISO-27001$sscb$, $sscb$2022$sscb$, $sscb$ISO/IEC 27001$sscb$, $sscb$2022-10-25$sscb$::date, $sscb$ISO/IEC 27001:2022$sscb$, $sscb$sscb$, $sscb$ISO/IEC 27001:2022$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, null, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, 0, $sscb$ISO/IEC 27001:2022 control text is not included. The standard is licensed. Import an authorized CSV if your organization has the rights to use that text.$sscb$, true, $sscb$not_loaded$sscb$, $sscb$ISO/IEC 27001:2022 is copyrighted by ISO. This catalog does not ship its control set.$sscb$),
  ($sscb$5e572c39-1e18-50b2-a156-70fb3a8f99ff$sscb$::uuid, $sscb$SOC2-TSC$sscb$, $sscb$2017$sscb$, $sscb$AICPA Trust Services Criteria$sscb$, $sscb$2017-04-01$sscb$::date, $sscb$TSP section 100 (2017)$sscb$, $sscb$sscb$, $sscb$TSP section 100 (2017)$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, null, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, 0, $sscb$Trust Services Criteria text is not included. The criteria are copyrighted by the AICPA. Import an authorized CSV if your organization has the rights to use that text.$sscb$, true, $sscb$not_loaded$sscb$, $sscb$The AICPA Trust Services Criteria are copyrighted. This catalog does not ship them.$sscb$),
  ($sscb$fbc75172-4771-5432-90f8-65554708166b$sscb$::uuid, $sscb$CIS-V8$sscb$, $sscb$8$sscb$, $sscb$CIS Controls$sscb$, $sscb$2021-05-01$sscb$::date, $sscb$CIS Controls v8$sscb$, $sscb$sscb$, $sscb$CIS Controls v8$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, null, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, 0, $sscb$CIS Controls v8 safeguards are not included. They are licensed by CIS. Import an authorized CSV if your organization has the rights to use that text.$sscb$, true, $sscb$not_loaded$sscb$, $sscb$CIS Controls are copyrighted by the Center for Internet Security. This catalog does not ship them.$sscb$),
  ($sscb$e1d4e213-aef9-50d8-9879-9de7cf0cea55$sscb$::uuid, $sscb$HIPAA-SR$sscb$, $sscb$45-CFR-164$sscb$, $sscb$HIPAA Security Rule$sscb$, $sscb$2013-01-25$sscb$::date, $sscb$45 CFR Part 164 Subpart C$sscb$, $sscb$sscb$, $sscb$45 CFR Part 164 Subpart C$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, null, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, 0, $sscb$The HIPAA Security Rule is public regulation. This release does not ship a reconstructed control list. Import a CSV your team prepared from 45 CFR Part 164 Subpart C if you want those citations in the catalog.$sscb$, true, $sscb$not_loaded$sscb$, $sscb$45 CFR Part 164 Subpart C is public regulation. No control text is seeded, so the catalog cannot imply a complete HIPAA catalog.$sscb$),
  ($sscb$b8773c64-04ed-53f5-aae5-fb79f19c8dcb$sscb$::uuid, $sscb$NIST-AI-RMF$sscb$, $sscb$1.0$sscb$, $sscb$NIST AI Risk Management Framework$sscb$, $sscb$2023-01-26$sscb$::date, $sscb$NIST AI 100-1$sscb$, $sscb$sscb$, $sscb$NIST AI 100-1$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, null, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, 0, $sscb$NIST AI RMF 1.0 is a public NIST publication. This release does not include an unverified copy of its functions and categories. Import a CSV taken from the publication you use.$sscb$, true, $sscb$not_loaded$sscb$, $sscb$No AI RMF core is seeded in this release. Coverage stays empty until an authorized import.$sscb$),
  ($sscb$9252398c-caaa-573a-aac6-07d125cc568b$sscb$::uuid, $sscb$NIST-PF$sscb$, $sscb$1.0$sscb$, $sscb$NIST Privacy Framework$sscb$, $sscb$2020-01-16$sscb$::date, $sscb$NIST Privacy Framework 1.0$sscb$, $sscb$sscb$, $sscb$NIST Privacy Framework 1.0$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, null, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, $sscb$sscb$, 0, $sscb$The NIST Privacy Framework 1.0 is a public NIST publication. This release does not include an unverified copy of its core. Import a CSV taken from the publication you use.$sscb$, true, $sscb$not_loaded$sscb$, $sscb$No Privacy Framework core is seeded in this release. Coverage stays empty until an authorized import.$sscb$)
on conflict (code, version) do update set
  name = excluded.name,
  publication = excluded.publication,
  provenance = excluded.provenance,
  license_note = excluded.license_note,
  content_state = excluded.content_state,
  is_active = excluded.is_active
where public.frameworks.code <> 'NIST-CSF';
-- FRAMEWORK_REGISTRY_END
