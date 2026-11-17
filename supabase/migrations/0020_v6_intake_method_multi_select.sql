-- Intake Method becomes a multi-select, stored the same way as Target Audience.
-- A stored text value becomes a one-element text[]. Null or blank becomes '{}'.
-- The template field (tenant_id null) and every workspace copy switch to multi_select.
-- Service snapshots in audit_log are rewritten when they still store a JSON string,
-- because the history screen reads those snapshots back.
-- Safe to run more than once. Does not insert workspaces, users, invites, or services.
-- Field updates stay quiet: sscb.skip_audit is on, matching earlier migrations.

do $migration$
declare
  v_udt text;
begin
  perform set_config('sscb.skip_audit', 'on', true);

  select c.udt_name into v_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'services'
    and c.column_name = 'intake_method';

  if v_udt = 'text' then
    execute $conv$
      alter table public.services
        alter column intake_method type text[]
        using (
          case
            when intake_method is null or btrim(intake_method) = '' then '{}'::text[]
            else array[btrim(intake_method)]::text[]
          end
        )
    $conv$;
  elsif v_udt = '_text' then
    update public.services
      set intake_method = '{}'::text[]
      where intake_method is null;
  else
    raise exception 'services.intake_method has unexpected type %', coalesce(v_udt, 'missing');
  end if;

  alter table public.services alter column intake_method set default '{}';
  alter table public.services alter column intake_method set not null;

  select c.udt_name into v_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'starter_service_templates'
    and c.column_name = 'intake_method';

  if v_udt = 'text' then
    execute $conv$
      alter table public.starter_service_templates
        alter column intake_method type text[]
        using (
          case
            when intake_method is null or btrim(intake_method) = '' then '{}'::text[]
            else array[btrim(intake_method)]::text[]
          end
        )
    $conv$;
  elsif v_udt = '_text' then
    update public.starter_service_templates
      set intake_method = '{}'::text[]
      where intake_method is null;
  else
    raise exception 'starter_service_templates.intake_method has unexpected type %', coalesce(v_udt, 'missing');
  end if;

  alter table public.starter_service_templates alter column intake_method set default '{}';
  alter table public.starter_service_templates alter column intake_method set not null;

  update public.field_definitions
  set
    input_type = 'multi_select',
    lookup_field_key = coalesce(nullif(lookup_field_key, ''), 'intake_method'),
    lookup_bound = false,
    lookup_restore = null,
    help_text = case
      when help_text = 'How a request for this service is submitted.'
        then 'How a request for this service is submitted. Select every method that applies.'
      else help_text
    end
  where field_key = 'intake_method'
    and (
      input_type is distinct from 'multi_select'
      or lookup_field_key is distinct from coalesce(nullif(lookup_field_key, ''), 'intake_method')
      or lookup_bound is distinct from false
      or lookup_restore is not null
      or help_text = 'How a request for this service is submitted.'
    );

  update public.audit_log
  set before_data = jsonb_set(
    before_data,
    '{intake_method}',
    case
      when btrim(before_data->>'intake_method') = '' then '[]'::jsonb
      else jsonb_build_array(btrim(before_data->>'intake_method'))
    end
  )
  where before_data is not null
    and jsonb_typeof(before_data->'intake_method') = 'string';

  update public.audit_log
  set after_data = jsonb_set(
    after_data,
    '{intake_method}',
    case
      when btrim(after_data->>'intake_method') = '' then '[]'::jsonb
      else jsonb_build_array(btrim(after_data->>'intake_method'))
    end
  )
  where after_data is not null
    and jsonb_typeof(after_data->'intake_method') = 'string';

  perform set_config('sscb.skip_audit', 'off', true);
end
$migration$;

-- Blueprint checkout used to insert one text code. Accept a list, and still
-- accept a single string so an older payload does not fail after the column change.
-- load_starter_sample_services copies the column, so it needs no change once both
-- services and starter_service_templates are text[].

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
      case
        when jsonb_typeof(v_row->'intake_method') = 'array'
          then array(
            select btrim(item)
            from jsonb_array_elements_text(v_row->'intake_method') as item
            where btrim(item) <> ''
          )
        when nullif(btrim(coalesce(v_row->>'intake_method', '')), '') is not null
          then array[btrim(v_row->>'intake_method')]::text[]
        else '{}'::text[]
      end,
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
