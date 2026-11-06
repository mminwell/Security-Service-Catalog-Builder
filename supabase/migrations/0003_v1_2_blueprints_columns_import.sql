-- Security Service Catalog Builder — V1.2.
-- Repeatable. Workspace catalog columns, bulk lookup import, and blueprint checkout.
-- Apply after 0002_v1_1_polish.sql. This file has no credentials.

alter table public.tenants
  add column if not exists catalog_columns jsonb;

comment on column public.tenants.catalog_columns is
  'Workspace default catalog columns. Shape: {"keys":["service_code","name",...]}. Null uses the built-in default. Retired field keys are ignored when the table renders.';

create or replace function public.import_lookup_options(
  p_tenant uuid,
  p_field_key text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_created integer := 0;
  v_updated integer := 0;
  v_row jsonb;
  v_code text;
  v_label text;
  v_description text;
  v_prefix text;
  v_existing uuid;
  v_max integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only a workspace admin can import dropdown options';
  end if;
  if p_field_key is null or length(trim(p_field_key)) = 0 then
    raise exception 'Choose a lookup group';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a list';
  end if;

  select coalesce(max(sort_order), 0) into v_max
  from public.lookup_options
  where tenant_id = p_tenant and field_key = p_field_key;

  perform set_config('sscb.skip_audit', 'on', true);

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_code := lower(trim(coalesce(v_row->>'code', '')));
    v_label := trim(coalesce(v_row->>'label', ''));
    v_description := nullif(trim(coalesce(v_row->>'description', '')), '');
    v_prefix := nullif(upper(trim(coalesce(v_row->>'code_prefix', ''))), '');
    if v_label = '' or v_code !~ '^[a-z0-9_]+$' then
      continue;
    end if;

    select id into v_existing
    from public.lookup_options
    where tenant_id = p_tenant and field_key = p_field_key and code = v_code;

    if v_existing is null then
      v_max := v_max + 10;
      insert into public.lookup_options (
        tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
      ) values (
        p_tenant, p_field_key, v_code, v_label, v_description,
        case when p_field_key = 'category' then v_prefix else null end,
        v_max, true
      );
      v_created := v_created + 1;
    else
      update public.lookup_options
      set label = v_label,
          description = v_description,
          code_prefix = case when p_field_key = 'category' then v_prefix else code_prefix end,
          is_active = true,
          updated_at = now()
      where id = v_existing;
      v_updated := v_updated + 1;
    end if;
  end loop;

  perform set_config('sscb.skip_audit', 'off', true);

  if v_created + v_updated > 0 then
    select email into v_email from auth.users where id = auth.uid();
    insert into public.audit_log (
      tenant_id, actor_user_id, actor_label, table_name, row_id, action, after_data
    ) values (
      p_tenant,
      auth.uid(),
      coalesce(v_email, 'system'),
      'lookup_options',
      p_tenant,
      'insert',
      jsonb_build_object(
        'kind', 'lookup_import',
        'field_key', p_field_key,
        'created', v_created,
        'updated', v_updated
      )
    );
  end if;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

create or replace function public.checkout_blueprint_services(
  p_tenant uuid,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
  v_row jsonb;
  v_id uuid;
  v_codes text[] := '{}';
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_write_services(p_tenant) then
    raise exception 'You do not have permission to add services in this workspace';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The cart is empty';
  end if;

  perform set_config('sscb.skip_audit', 'on', true);

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_code := trim(coalesce(v_row->>'service_code', ''));
    if v_code = '' or length(trim(coalesce(v_row->>'name', ''))) = 0 then
      raise exception 'Every blueprint needs a service code and a name';
    end if;
    if exists (
      select 1 from public.services
      where tenant_id = p_tenant and lower(service_code) = lower(v_code)
    ) then
      raise exception 'Service code % is already used in this workspace', v_code;
    end if;

    v_id := coalesce(nullif(v_row->>'id', '')::uuid, gen_random_uuid());
    insert into public.services (
      id, tenant_id, service_code, name, internal_name, category, status, service_tier, summary,
      description, in_scope, out_of_scope, deliverables, prerequisites, owner_team, delivery_team,
      business_unit, service_owner, delivery_model, target_audience, intake_method, intake_url,
      approval_required, approver, lead_time, support_contact, hours_of_coverage, sla_response_target,
      sla_resolution_target, primary_csf_function, capability_rating, threats_addressed,
      data_classification_handled, kpis_and_metrics, current_maturity_cmmi, target_maturity_cmmi,
      known_gaps_or_risks, third_party_providers, cost_model, cost_or_effort_notes, current_tooling_notes,
      internal_notes, review_cadence, last_reviewed_date, custom_fields
    ) values (
      v_id,
      p_tenant,
      v_code,
      trim(v_row->>'name'),
      nullif(v_row->>'internal_name', ''),
      nullif(v_row->>'category', ''),
      nullif(v_row->>'status', ''),
      nullif(v_row->>'service_tier', ''),
      coalesce(v_row->>'summary', ''),
      nullif(v_row->>'description', ''),
      nullif(v_row->>'in_scope', ''),
      nullif(v_row->>'out_of_scope', ''),
      nullif(v_row->>'deliverables', ''),
      nullif(v_row->>'prerequisites', ''),
      nullif(v_row->>'owner_team', ''),
      nullif(v_row->>'delivery_team', ''),
      nullif(v_row->>'business_unit', ''),
      nullif(v_row->>'service_owner', ''),
      nullif(v_row->>'delivery_model', ''),
      case
        when jsonb_typeof(v_row->'target_audience') = 'array'
          then array(select jsonb_array_elements_text(v_row->'target_audience'))
        else '{}'::text[]
      end,
      nullif(v_row->>'intake_method', ''),
      nullif(v_row->>'intake_url', ''),
      coalesce((v_row->>'approval_required')::boolean, false),
      nullif(v_row->>'approver', ''),
      nullif(v_row->>'lead_time', ''),
      nullif(v_row->>'support_contact', ''),
      nullif(v_row->>'hours_of_coverage', ''),
      nullif(v_row->>'sla_response_target', ''),
      nullif(v_row->>'sla_resolution_target', ''),
      nullif(v_row->>'primary_csf_function', ''),
      nullif(v_row->>'capability_rating', ''),
      nullif(v_row->>'threats_addressed', ''),
      nullif(v_row->>'data_classification_handled', ''),
      nullif(v_row->>'kpis_and_metrics', ''),
      nullif(v_row->>'current_maturity_cmmi', '')::smallint,
      nullif(v_row->>'target_maturity_cmmi', '')::smallint,
      nullif(v_row->>'known_gaps_or_risks', ''),
      nullif(v_row->>'third_party_providers', ''),
      nullif(v_row->>'cost_model', ''),
      nullif(v_row->>'cost_or_effort_notes', ''),
      nullif(v_row->>'current_tooling_notes', ''),
      nullif(v_row->>'internal_notes', ''),
      nullif(v_row->>'review_cadence', ''),
      nullif(v_row->>'last_reviewed_date', '')::date,
      coalesce(v_row->'custom_fields', '{}'::jsonb)
    );
    v_codes := array_append(v_codes, v_code);
    v_count := v_count + 1;
  end loop;

  perform set_config('sscb.skip_audit', 'off', true);

  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (
    tenant_id, actor_user_id, actor_label, table_name, row_id, action, after_data
  ) values (
    p_tenant,
    auth.uid(),
    coalesce(v_email, 'system'),
    'services',
    p_tenant,
    'insert',
    jsonb_build_object('kind', 'blueprint_checkout', 'count', v_count, 'service_codes', to_jsonb(v_codes))
  );

  return jsonb_build_object('count', v_count);
end;
$$;

revoke all on function public.import_lookup_options(uuid, text, jsonb) from public, anon;
revoke all on function public.checkout_blueprint_services(uuid, jsonb) from public, anon;
grant execute on function public.import_lookup_options(uuid, text, jsonb) to authenticated;
grant execute on function public.checkout_blueprint_services(uuid, jsonb) to authenticated;
