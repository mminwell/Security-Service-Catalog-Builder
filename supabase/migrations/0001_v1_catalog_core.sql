-- Security Service Catalog Builder — V1 catalog core.
-- Apply in the Supabase SQL editor (or via the Supabase CLI) before supabase/seed.sql.
-- This file has schema, row-level security, and starter dropdowns. It has no credentials.

create extension if not exists pgcrypto;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  service_code_mode text not null default 'sequential'
    check (service_code_mode in ('sequential', 'category_prefix')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('platform_owner', 'tenant_admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  field_key text not null,
  label text not null,
  help_text text not null default '',
  input_type text not null
    check (input_type in ('text', 'textarea', 'dropdown', 'multi_select', 'url', 'date', 'boolean', 'computed')),
  lookup_field_key text,
  is_required boolean not null default false,
  visibility text not null check (visibility in ('public', 'internal')),
  depth_level smallint not null default 1 check (depth_level in (1, 2, 3)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_standard boolean not null default true
);

create unique index field_definitions_template_key_uidx
  on public.field_definitions (field_key)
  where tenant_id is null;

create unique index field_definitions_tenant_key_uidx
  on public.field_definitions (tenant_id, field_key)
  where tenant_id is not null;

create table public.lookup_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  field_key text not null,
  code text not null,
  label text not null,
  description text,
  code_prefix text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index lookup_options_template_code_uidx
  on public.lookup_options (field_key, code)
  where tenant_id is null;

create unique index lookup_options_tenant_code_uidx
  on public.lookup_options (tenant_id, field_key, code)
  where tenant_id is not null;

create index lookup_options_tenant_field_idx
  on public.lookup_options (tenant_id, field_key, sort_order);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  service_code text not null,
  name text not null,
  internal_name text,
  category text,
  status text,
  service_tier text,
  summary text not null default '',
  description text,
  in_scope text,
  out_of_scope text,
  deliverables text,
  prerequisites text,
  owner_team text,
  delivery_team text,
  business_unit text,
  service_owner text,
  delivery_model text,
  target_audience text[] not null default '{}',
  intake_method text,
  intake_url text,
  approval_required boolean not null default false,
  approver text,
  lead_time text,
  support_contact text,
  hours_of_coverage text,
  sla_response_target text,
  sla_resolution_target text,
  primary_csf_function text,
  capability_rating text,
  threats_addressed text,
  data_classification_handled text,
  kpis_and_metrics text,
  current_maturity_cmmi smallint check (current_maturity_cmmi between 0 and 5),
  target_maturity_cmmi smallint check (target_maturity_cmmi between 0 and 5),
  maturity_gap smallint,
  known_gaps_or_risks text,
  third_party_providers text,
  cost_model text,
  cost_or_effort_notes text,
  current_tooling_notes text,
  internal_notes text,
  review_cadence text,
  last_reviewed_date date,
  next_review_date date,
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, service_code)
);

create index services_tenant_idx on public.services (tenant_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid,
  actor_label text not null default 'system',
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);

create table public.starter_service_templates (
  service_code text primary key,
  name text not null,
  internal_name text,
  category text,
  status text,
  service_tier text,
  summary text not null default '',
  description text,
  in_scope text,
  out_of_scope text,
  deliverables text,
  prerequisites text,
  owner_team text,
  delivery_team text,
  business_unit text,
  service_owner text,
  delivery_model text,
  target_audience text[] not null default '{}',
  intake_method text,
  intake_url text,
  approval_required boolean not null default false,
  approver text,
  lead_time text,
  support_contact text,
  hours_of_coverage text,
  sla_response_target text,
  sla_resolution_target text,
  primary_csf_function text,
  capability_rating text,
  threats_addressed text,
  data_classification_handled text,
  kpis_and_metrics text,
  current_maturity_cmmi smallint,
  target_maturity_cmmi smallint,
  known_gaps_or_risks text,
  third_party_providers text,
  cost_model text,
  cost_or_effort_notes text,
  current_tooling_notes text,
  internal_notes text,
  review_cadence text,
  last_reviewed_date date
);

create or replace function public.apply_service_computeds()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_maturity_cmmi is not null and new.target_maturity_cmmi is not null then
    new.maturity_gap := (new.target_maturity_cmmi - new.current_maturity_cmmi)::smallint;
  else
    new.maturity_gap := null;
  end if;

  if new.last_reviewed_date is null or new.review_cadence is null or new.review_cadence = 'on_change' then
    new.next_review_date := null;
  elsif new.review_cadence = 'monthly' then
    new.next_review_date := (new.last_reviewed_date + interval '1 month')::date;
  elsif new.review_cadence = 'quarterly' then
    new.next_review_date := (new.last_reviewed_date + interval '3 months')::date;
  elsif new.review_cadence = 'semi_annual' then
    new.next_review_date := (new.last_reviewed_date + interval '6 months')::date;
  elsif new.review_cadence = 'annual' then
    new.next_review_date := (new.last_reviewed_date + interval '1 year')::date;
  else
    new.next_review_date := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_row uuid;
  v_email text;
begin
  if current_setting('sscb.skip_audit', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_tenant := old.tenant_id;
    v_row := old.id;
  else
    v_tenant := new.tenant_id;
    v_row := new.id;
  end if;

  if v_tenant is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_label, table_name, row_id, action, before_data, after_data
  ) values (
    v_tenant,
    auth.uid(),
    coalesce(v_email, 'system'),
    tg_table_name,
    v_row,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_a_service_compute
  before insert or update on public.services
  for each row execute function public.apply_service_computeds();

create trigger trg_b_service_audit
  before insert or update or delete on public.services
  for each row execute function public.write_audit();

create trigger trg_b_lookup_audit
  before insert or update or delete on public.lookup_options
  for each row execute function public.write_audit();

create trigger trg_b_field_audit
  before insert or update or delete on public.field_definitions
  for each row execute function public.write_audit();

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members
    where user_id = auth.uid()
      and role = 'platform_owner'
  );
$$;

create or replace function public.can_access_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.tenant_members
      where tenant_id = p_tenant
        and user_id = auth.uid()
    );
$$;

create or replace function public.can_write_services(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.tenant_members
      where tenant_id = p_tenant
        and user_id = auth.uid()
        and role in ('tenant_admin', 'editor')
    );
$$;

create or replace function public.can_admin_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.tenant_members
      where tenant_id = p_tenant
        and user_id = auth.uid()
        and role = 'tenant_admin'
    );
$$;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.field_definitions enable row level security;
alter table public.lookup_options enable row level security;
alter table public.services enable row level security;
alter table public.audit_log enable row level security;
alter table public.starter_service_templates enable row level security;

alter table public.tenants force row level security;
alter table public.tenant_members force row level security;
alter table public.field_definitions force row level security;
alter table public.lookup_options force row level security;
alter table public.services force row level security;
alter table public.audit_log force row level security;
alter table public.starter_service_templates force row level security;

create policy tenants_select on public.tenants
  for select to authenticated
  using (public.can_access_tenant(id));

create policy tenants_update on public.tenants
  for update to authenticated
  using (public.can_admin_tenant(id))
  with check (public.can_admin_tenant(id));

create policy members_select on public.tenant_members
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy fields_select on public.field_definitions
  for select to authenticated
  using (tenant_id is not null and public.can_access_tenant(tenant_id));

create policy fields_insert on public.field_definitions
  for insert to authenticated
  with check (tenant_id is not null and public.can_admin_tenant(tenant_id));

create policy fields_update on public.field_definitions
  for update to authenticated
  using (tenant_id is not null and public.can_admin_tenant(tenant_id))
  with check (tenant_id is not null and public.can_admin_tenant(tenant_id));

create policy lookups_select on public.lookup_options
  for select to authenticated
  using (tenant_id is not null and public.can_access_tenant(tenant_id));

create policy lookups_insert on public.lookup_options
  for insert to authenticated
  with check (tenant_id is not null and public.can_admin_tenant(tenant_id));

create policy lookups_update on public.lookup_options
  for update to authenticated
  using (tenant_id is not null and public.can_admin_tenant(tenant_id))
  with check (tenant_id is not null and public.can_admin_tenant(tenant_id));

create policy services_select on public.services
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy services_insert on public.services
  for insert to authenticated
  with check (public.can_write_services(tenant_id));

create policy services_update on public.services
  for update to authenticated
  using (public.can_write_services(tenant_id))
  with check (public.can_write_services(tenant_id));

create policy services_delete on public.services
  for delete to authenticated
  using (public.can_admin_tenant(tenant_id));

create policy audit_select on public.audit_log
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

-- STARTER_DATA_BEGIN
-- Platform templates. tenant_id is null. provision_tenant copies these into each workspace.

insert into public.field_definitions (
  tenant_id, field_key, label, help_text, input_type, lookup_field_key,
  is_required, visibility, depth_level, sort_order, is_active, is_standard
) values
  (null, $sscb$service_code$sscb$, $sscb$Service Code$sscb$, $sscb$Unique catalog ID. Suggested as SVC-001, or SEC-SOC-001 when this workspace uses category prefixes. Always editable.$sscb$, $sscb$text$sscb$, null, true, $sscb$public$sscb$, 1, 10, true, true),
  (null, $sscb$name$sscb$, $sscb$Service Name$sscb$, $sscb$Client-facing name. This is the name external readers should see.$sscb$, $sscb$text$sscb$, null, true, $sscb$public$sscb$, 1, 20, true, true),
  (null, $sscb$category$sscb$, $sscb$Category$sscb$, $sscb$Security domain. The category prefix is used only when service IDs are set to category-prefixed mode.$sscb$, $sscb$dropdown$sscb$, $sscb$category$sscb$, true, $sscb$public$sscb$, 1, 30, true, true),
  (null, $sscb$status$sscb$, $sscb$Status$sscb$, $sscb$Lifecycle of the service, from draft through retired.$sscb$, $sscb$dropdown$sscb$, $sscb$status$sscb$, true, $sscb$public$sscb$, 1, 40, true, true),
  (null, $sscb$service_tier$sscb$, $sscb$Service Tier$sscb$, $sscb$How severe a failure of this service is. Read the tier definitions before you choose.$sscb$, $sscb$dropdown$sscb$, $sscb$service_tier$sscb$, false, $sscb$public$sscb$, 1, 50, true, true),
  (null, $sscb$summary$sscb$, $sscb$Executive Summary$sscb$, $sscb$One or two sentences a leader or client can read without the full description.$sscb$, $sscb$textarea$sscb$, null, true, $sscb$public$sscb$, 1, 60, true, true),
  (null, $sscb$owner_team$sscb$, $sscb$Owner Team$sscb$, $sscb$Accountable owner. Security can own a service that another team delivers.$sscb$, $sscb$dropdown$sscb$, $sscb$team$sscb$, true, $sscb$public$sscb$, 1, 70, true, true),
  (null, $sscb$service_owner$sscb$, $sscb$Service Owner$sscb$, $sscb$Named person or role accountable for keeping this entry true.$sscb$, $sscb$text$sscb$, null, false, $sscb$public$sscb$, 1, 80, true, true),
  (null, $sscb$in_scope$sscb$, $sscb$In Scope$sscb$, $sscb$What this service explicitly includes.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 1, 90, true, true),
  (null, $sscb$description$sscb$, $sscb$Full Description$sscb$, $sscb$Complete narrative of how the service is delivered.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 2, 100, true, true),
  (null, $sscb$internal_name$sscb$, $sscb$Internal Name$sscb$, $sscb$Short operational name. Hidden from public preview and public CSV.$sscb$, $sscb$text$sscb$, null, false, $sscb$internal$sscb$, 2, 110, true, true),
  (null, $sscb$delivery_team$sscb$, $sscb$Delivery Team$sscb$, $sscb$Team that operates the service day to day. May differ from the accountable owner.$sscb$, $sscb$dropdown$sscb$, $sscb$team$sscb$, false, $sscb$public$sscb$, 2, 120, true, true),
  (null, $sscb$business_unit$sscb$, $sscb$Business Unit$sscb$, $sscb$Sponsoring or consuming business unit, when one is relevant.$sscb$, $sscb$dropdown$sscb$, $sscb$business_unit$sscb$, false, $sscb$public$sscb$, 2, 130, true, true),
  (null, $sscb$delivery_model$sscb$, $sscb$Delivery Model$sscb$, $sscb$How the service is delivered: managed, co-managed, advisory, project, or self-service.$sscb$, $sscb$dropdown$sscb$, $sscb$delivery_model$sscb$, false, $sscb$public$sscb$, 2, 140, true, true),
  (null, $sscb$target_audience$sscb$, $sscb$Target Audience$sscb$, $sscb$Who the service is for. Select every audience that applies.$sscb$, $sscb$multi_select$sscb$, $sscb$target_audience$sscb$, false, $sscb$public$sscb$, 2, 150, true, true),
  (null, $sscb$out_of_scope$sscb$, $sscb$Out of Scope$sscb$, $sscb$Explicit exclusions. Useful when this entry becomes a statement of work.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 2, 160, true, true),
  (null, $sscb$deliverables$sscb$, $sscb$Deliverables$sscb$, $sscb$Concrete outputs a consumer can expect.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 2, 170, true, true),
  (null, $sscb$prerequisites$sscb$, $sscb$Prerequisites$sscb$, $sscb$What must be true before the service can start.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 2, 180, true, true),
  (null, $sscb$intake_method$sscb$, $sscb$Intake Method$sscb$, $sscb$How a request for this service is submitted.$sscb$, $sscb$dropdown$sscb$, $sscb$intake_method$sscb$, false, $sscb$public$sscb$, 2, 190, true, true),
  (null, $sscb$intake_url$sscb$, $sscb$Intake URL$sscb$, $sscb$Link to the ticket form or portal, if there is one.$sscb$, $sscb$url$sscb$, null, false, $sscb$public$sscb$, 2, 200, true, true),
  (null, $sscb$approval_required$sscb$, $sscb$Approval Required$sscb$, $sscb$Whether a request needs approval before work starts.$sscb$, $sscb$boolean$sscb$, null, false, $sscb$public$sscb$, 2, 210, true, true),
  (null, $sscb$approver$sscb$, $sscb$Approver$sscb$, $sscb$Role or person who approves intake.$sscb$, $sscb$text$sscb$, null, false, $sscb$public$sscb$, 2, 220, true, true),
  (null, $sscb$lead_time$sscb$, $sscb$Lead Time$sscb$, $sscb$Typical time from an approved request to the start of work. Example: 5 business days.$sscb$, $sscb$text$sscb$, null, false, $sscb$public$sscb$, 2, 230, true, true),
  (null, $sscb$support_contact$sscb$, $sscb$Support / Escalation$sscb$, $sscb$Where to escalate when the normal path is not enough.$sscb$, $sscb$text$sscb$, null, false, $sscb$public$sscb$, 2, 240, true, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$Hours of Coverage$sscb$, $sscb$When the service is staffed or available.$sscb$, $sscb$dropdown$sscb$, $sscb$hours_of_coverage$sscb$, false, $sscb$public$sscb$, 2, 250, true, true),
  (null, $sscb$sla_response_target$sscb$, $sscb$SLA Response$sscb$, $sscb$Response target by severity. Example: P1 15 min / P2 4 hrs.$sscb$, $sscb$text$sscb$, null, false, $sscb$public$sscb$, 2, 260, true, true),
  (null, $sscb$sla_resolution_target$sscb$, $sscb$SLA Resolution$sscb$, $sscb$Resolution or containment target by severity.$sscb$, $sscb$text$sscb$, null, false, $sscb$public$sscb$, 2, 270, true, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$Primary CSF Function$sscb$, $sscb$Primary NIST CSF 2.0 function. Detailed control mapping comes in a later version.$sscb$, $sscb$dropdown$sscb$, $sscb$primary_csf_function$sscb$, false, $sscb$public$sscb$, 2, 280, true, true),
  (null, $sscb$capability_rating$sscb$, $sscb$Capability Rating$sscb$, $sscb$Whether the service fully delivers, partially delivers, or does not yet deliver its declared scope.$sscb$, $sscb$dropdown$sscb$, $sscb$capability_rating$sscb$, false, $sscb$public$sscb$, 2, 290, true, true),
  (null, $sscb$current_tooling_notes$sscb$, $sscb$Current Tooling$sscb$, $sscb$Tools used to run the service today. Internal until linked artifacts exist.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$internal$sscb$, 2, 300, true, true),
  (null, $sscb$internal_notes$sscb$, $sscb$Internal Notes$sscb$, $sscb$Caveats, runbook pointers, and other notes that must not appear in a public export.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$internal$sscb$, 2, 310, true, true),
  (null, $sscb$threats_addressed$sscb$, $sscb$Threats Addressed$sscb$, $sscb$Threat classes this service is meant to mitigate.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 3, 320, true, true),
  (null, $sscb$data_classification_handled$sscb$, $sscb$Data Classification$sscb$, $sscb$Highest classification of data this service routinely handles.$sscb$, $sscb$dropdown$sscb$, $sscb$data_classification$sscb$, false, $sscb$public$sscb$, 3, 330, true, true),
  (null, $sscb$kpis_and_metrics$sscb$, $sscb$KPIs & Metrics$sscb$, $sscb$How effectiveness is measured.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$public$sscb$, 3, 340, true, true),
  (null, $sscb$current_maturity_cmmi$sscb$, $sscb$Current Maturity (CMMI)$sscb$, $sscb$Pragmatic per-service view of ISACA CMMI 0–5. This is not a formal organizational appraisal.$sscb$, $sscb$dropdown$sscb$, $sscb$maturity_cmmi$sscb$, false, $sscb$internal$sscb$, 3, 350, true, true),
  (null, $sscb$target_maturity_cmmi$sscb$, $sscb$Target Maturity (CMMI)$sscb$, $sscb$Target on the same 0–5 lens. The gap is computed and cannot be typed in.$sscb$, $sscb$dropdown$sscb$, $sscb$maturity_cmmi$sscb$, false, $sscb$internal$sscb$, 3, 360, true, true),
  (null, $sscb$maturity_gap$sscb$, $sscb$Maturity Gap$sscb$, $sscb$Target maturity minus current maturity. Computed. A positive number means the target is still ahead.$sscb$, $sscb$computed$sscb$, null, false, $sscb$internal$sscb$, 3, 370, true, true),
  (null, $sscb$known_gaps_or_risks$sscb$, $sscb$Known Gaps / Risks$sscb$, $sscb$Honest gaps in coverage, hours, or tooling.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$internal$sscb$, 3, 380, true, true),
  (null, $sscb$third_party_providers$sscb$, $sscb$Third-Party Providers$sscb$, $sscb$Vendors or service providers involved in delivery.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$internal$sscb$, 3, 390, true, true),
  (null, $sscb$cost_model$sscb$, $sscb$Cost Model$sscb$, $sscb$How the service is funded or charged. Internal.$sscb$, $sscb$dropdown$sscb$, $sscb$cost_model$sscb$, false, $sscb$internal$sscb$, 3, 400, true, true),
  (null, $sscb$cost_or_effort_notes$sscb$, $sscb$Cost / Effort Notes$sscb$, $sscb$Sizing, effort, or cost-band notes. Internal.$sscb$, $sscb$textarea$sscb$, null, false, $sscb$internal$sscb$, 3, 410, true, true),
  (null, $sscb$review_cadence$sscb$, $sscb$Review Cadence$sscb$, $sscb$How often this catalog entry should be reviewed. On Change does not calculate a next date.$sscb$, $sscb$dropdown$sscb$, $sscb$review_cadence$sscb$, false, $sscb$public$sscb$, 3, 420, true, true),
  (null, $sscb$last_reviewed_date$sscb$, $sscb$Last Reviewed$sscb$, $sscb$Date this entry was last reviewed.$sscb$, $sscb$date$sscb$, null, false, $sscb$public$sscb$, 3, 430, true, true),
  (null, $sscb$next_review_date$sscb$, $sscb$Next Review$sscb$, $sscb$Computed from the last reviewed date and the review cadence.$sscb$, $sscb$computed$sscb$, null, false, $sscb$public$sscb$, 3, 440, true, true)
on conflict (field_key) where tenant_id is null do nothing;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
  (null, $sscb$service_tier$sscb$, $sscb$tier_0$sscb$, $sscb$Tier 0 — Mission-Critical / Crown Jewel$sscb$, $sscb$Failure immediately exposes the organization or halts operations (e.g., SSO/IAM, 24×7 SOC detection & IR, secrets/key management). Highest resilience, tightest SLAs, zero single-person dependencies.$sscb$, null, 10, true),
  (null, $sscb$service_tier$sscb$, $sscb$tier_1$sscb$, $sscb$Tier 1 — Core Operational$sscb$, $sscb$Everyday defensive controls where degradation creates material exposure within hours (e.g., EDR, vulnerability scanning, cloud posture, firewall/WAF ops).$sscb$, null, 20, true),
  (null, $sscb$service_tier$sscb$, $sscb$tier_2$sscb$, $sscb$Tier 2 — Standard Programmatic$sscb$, $sscb$Scheduled or business-hours security functions (e.g., pen tests, third-party risk assessments, architecture reviews, access recertifications).$sscb$, null, 30, true),
  (null, $sscb$service_tier$sscb$, $sscb$tier_3$sscb$, $sscb$Tier 3 — Advisory & Enablement$sscb$, $sscb$Consultative or best-effort services (e.g., awareness training, policy consultations, tabletop exercises).$sscb$, null, 40, true),
  (null, $sscb$category$sscb$, $sscb$grc$sscb$, $sscb$Governance, Risk & Compliance$sscb$, $sscb$Policies, risk decisions, control assurance, and the management system around them.$sscb$, $sscb$GRC$sscb$, 10, true),
  (null, $sscb$category$sscb$, $sscb$secops$sscb$, $sscb$Security Operations & Monitoring$sscb$, $sscb$Monitoring, detection, and the day-to-day operational watch.$sscb$, $sscb$SOC$sscb$, 20, true),
  (null, $sscb$category$sscb$, $sscb$incident_response$sscb$, $sscb$Incident Response & Forensics$sscb$, $sscb$Response, containment, recovery coordination, and investigative work after a detection.$sscb$, $sscb$IRF$sscb$, 30, true),
  (null, $sscb$category$sscb$, $sscb$vuln_mgmt$sscb$, $sscb$Vulnerability & Exposure Management$sscb$, $sscb$Finding, prioritizing, and driving down exploitable weakness.$sscb$, $sscb$VUL$sscb$, 40, true),
  (null, $sscb$category$sscb$, $sscb$iam$sscb$, $sscb$Identity & Access Management$sscb$, $sscb$Workforce and privileged identity, authentication, and access decisions.$sscb$, $sscb$IAM$sscb$, 50, true),
  (null, $sscb$category$sscb$, $sscb$network$sscb$, $sscb$Network Security$sscb$, $sscb$Perimeter, segmentation, and network control operations.$sscb$, $sscb$NET$sscb$, 60, true),
  (null, $sscb$category$sscb$, $sscb$endpoint$sscb$, $sscb$Endpoint Security$sscb$, $sscb$Protection and response on user devices, servers, and managed endpoints.$sscb$, $sscb$END$sscb$, 70, true),
  (null, $sscb$category$sscb$, $sscb$cloud_infra$sscb$, $sscb$Cloud & Infrastructure Security$sscb$, $sscb$Cloud posture, infrastructure baselines, and platform guardrails.$sscb$, $sscb$CLD$sscb$, 80, true),
  (null, $sscb$category$sscb$, $sscb$appsec$sscb$, $sscb$Application & Product Security$sscb$, $sscb$Secure design, testing, and remediation for software the organization builds or buys.$sscb$, $sscb$APP$sscb$, 90, true),
  (null, $sscb$category$sscb$, $sscb$data_privacy$sscb$, $sscb$Data Privacy & Protection$sscb$, $sscb$Privacy obligations, data protection, and handling of sensitive information.$sscb$, $sscb$PRV$sscb$, 100, true),
  (null, $sscb$category$sscb$, $sscb$ai_security$sscb$, $sscb$AI Security & Governance$sscb$, $sscb$Review and control of AI systems, model use, and related risk.$sscb$, $sscb$AIS$sscb$, 110, true),
  (null, $sscb$category$sscb$, $sscb$sec_architecture$sscb$, $sscb$Security Architecture & Engineering$sscb$, $sscb$Reference architectures, security engineering, and design review.$sscb$, $sscb$ARC$sscb$, 120, true),
  (null, $sscb$category$sscb$, $sscb$third_party$sscb$, $sscb$Third-Party & Vendor Risk$sscb$, $sscb$Assessment and oversight of suppliers and other outside parties.$sscb$, $sscb$TPR$sscb$, 130, true),
  (null, $sscb$category$sscb$, $sscb$awareness$sscb$, $sscb$Security Awareness & Training$sscb$, $sscb$Education, phishing exercises, and workforce security behavior.$sscb$, $sscb$SAT$sscb$, 140, true),
  (null, $sscb$status$sscb$, $sscb$draft$sscb$, $sscb$Draft$sscb$, $sscb$Work in progress; not published to clients.$sscb$, null, 10, true),
  (null, $sscb$status$sscb$, $sscb$planned$sscb$, $sscb$Planned$sscb$, $sscb$Committed on the roadmap; not yet live.$sscb$, null, 20, true),
  (null, $sscb$status$sscb$, $sscb$pilot$sscb$, $sscb$Pilot$sscb$, $sscb$Limited rollout / soft launch.$sscb$, null, 30, true),
  (null, $sscb$status$sscb$, $sscb$active$sscb$, $sscb$Active$sscb$, $sscb$In production and offered.$sscb$, null, 40, true),
  (null, $sscb$status$sscb$, $sscb$deprecated$sscb$, $sscb$Deprecated$sscb$, $sscb$Still running; do not start new consumers.$sscb$, null, 50, true),
  (null, $sscb$status$sscb$, $sscb$retired$sscb$, $sscb$Retired$sscb$, $sscb$Fully decommissioned; retained for history.$sscb$, null, 60, true),
  (null, $sscb$capability_rating$sscb$, $sscb$full$sscb$, $sscb$Full$sscb$, $sscb$Service fully delivers the intended capability for its declared scope.$sscb$, null, 10, true),
  (null, $sscb$capability_rating$sscb$, $sscb$partial$sscb$, $sscb$Partial$sscb$, $sscb$Material capability exists, but known gaps remain in coverage, hours, or tooling.$sscb$, null, 20, true),
  (null, $sscb$capability_rating$sscb$, $sscb$none$sscb$, $sscb$None$sscb$, $sscb$Capability is planned or aspirational; not currently delivered.$sscb$, null, 30, true),
  (null, $sscb$maturity_cmmi$sscb$, $sscb$0$sscb$, $sscb$0 — Incomplete$sscb$, $sscb$Work is not performed or is performed in an ad-hoc, incomplete way.$sscb$, null, 10, true),
  (null, $sscb$maturity_cmmi$sscb$, $sscb$1$sscb$, $sscb$1 — Initial$sscb$, $sscb$Unpredictable, reactive; success depends on heroes.$sscb$, null, 20, true),
  (null, $sscb$maturity_cmmi$sscb$, $sscb$2$sscb$, $sscb$2 — Managed$sscb$, $sscb$Planned, performed, measured, and controlled at the work-group level.$sscb$, null, 30, true),
  (null, $sscb$maturity_cmmi$sscb$, $sscb$3$sscb$, $sscb$3 — Defined$sscb$, $sscb$Organization-wide standards; proactive and consistent.$sscb$, null, 40, true),
  (null, $sscb$maturity_cmmi$sscb$, $sscb$4$sscb$, $sscb$4 — Quantitatively Managed$sscb$, $sscb$Quantitative objectives; statistical/predictive control.$sscb$, null, 50, true),
  (null, $sscb$maturity_cmmi$sscb$, $sscb$5$sscb$, $sscb$5 — Optimizing$sscb$, $sscb$Stable and flexible; continuous improvement focused on performance.$sscb$, null, 60, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$govern$sscb$, $sscb$Govern$sscb$, $sscb$Establish, communicate, and monitor the organization’s cybersecurity risk management strategy, expectations, and policy.$sscb$, null, 10, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$identify$sscb$, $sscb$Identify$sscb$, $sscb$Understand the organization’s current cybersecurity risks.$sscb$, null, 20, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$protect$sscb$, $sscb$Protect$sscb$, $sscb$Use safeguards to manage the organization’s cybersecurity risks.$sscb$, null, 30, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$detect$sscb$, $sscb$Detect$sscb$, $sscb$Find and analyze possible cybersecurity attacks and compromises.$sscb$, null, 40, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$respond$sscb$, $sscb$Respond$sscb$, $sscb$Act on a detected cybersecurity incident.$sscb$, null, 50, true),
  (null, $sscb$primary_csf_function$sscb$, $sscb$recover$sscb$, $sscb$Recover$sscb$, $sscb$Restore assets and operations that a cybersecurity incident affected.$sscb$, null, 60, true),
  (null, $sscb$data_classification$sscb$, $sscb$public$sscb$, $sscb$Public$sscb$, $sscb$Approved for unrestricted disclosure.$sscb$, null, 10, true),
  (null, $sscb$data_classification$sscb$, $sscb$internal$sscb$, $sscb$Internal$sscb$, $sscb$Internal use; not for external release without review.$sscb$, null, 20, true),
  (null, $sscb$data_classification$sscb$, $sscb$confidential$sscb$, $sscb$Confidential$sscb$, $sscb$Sensitive business or personal data; need-to-know.$sscb$, null, 30, true),
  (null, $sscb$data_classification$sscb$, $sscb$restricted$sscb$, $sscb$Restricted$sscb$, $sscb$Highest sensitivity (secrets, regulated PII/PHI, crown-jewel data).$sscb$, null, 40, true),
  (null, $sscb$cost_model$sscb$, $sscb$no_charge_core$sscb$, $sscb$No Charge / Core Funded$sscb$, $sscb$Funded as part of the core security program. Not charged per request.$sscb$, null, 10, true),
  (null, $sscb$cost_model$sscb$, $sscb$fixed_fee$sscb$, $sscb$Fixed Fee$sscb$, $sscb$A set fee for an agreed scope.$sscb$, null, 20, true),
  (null, $sscb$cost_model$sscb$, $sscb$per_user$sscb$, $sscb$Per User$sscb$, $sscb$Charged or allocated per person covered.$sscb$, null, 30, true),
  (null, $sscb$cost_model$sscb$, $sscb$per_asset$sscb$, $sscb$Per Asset$sscb$, $sscb$Charged or allocated per system or asset.$sscb$, null, 40, true),
  (null, $sscb$cost_model$sscb$, $sscb$per_engagement$sscb$, $sscb$Per Engagement$sscb$, $sscb$Priced each time the service is requested.$sscb$, null, 50, true),
  (null, $sscb$cost_model$sscb$, $sscb$subscription$sscb$, $sscb$Subscription$sscb$, $sscb$Recurring subscription or retainer.$sscb$, null, 60, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$24x7x365$sscb$, $sscb$24×7×365$sscb$, $sscb$Staffed or monitored every hour of the year.$sscb$, null, 10, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$extended_12x5$sscb$, $sscb$Extended (12×5)$sscb$, $sscb$Extended weekday hours, typically twelve by five.$sscb$, null, 20, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$business_8x5$sscb$, $sscb$Business Hours (8×5)$sscb$, $sscb$Standard business hours on weekdays.$sscb$, null, 30, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$on_call$sscb$, $sscb$On-Call$sscb$, $sscb$Reached through an on-call rotation rather than a staffed queue.$sscb$, null, 40, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$on_request$sscb$, $sscb$On Request$sscb$, $sscb$Available when requested, without standing coverage.$sscb$, null, 50, true),
  (null, $sscb$hours_of_coverage$sscb$, $sscb$scheduled_periodic$sscb$, $sscb$Scheduled / Periodic$sscb$, $sscb$Runs on a calendar, such as monthly or quarterly, rather than continuously.$sscb$, null, 60, true),
  (null, $sscb$delivery_model$sscb$, $sscb$managed_continuous$sscb$, $sscb$Managed / Continuous$sscb$, $sscb$Operated as an ongoing managed service.$sscb$, null, 10, true),
  (null, $sscb$delivery_model$sscb$, $sscb$co_managed$sscb$, $sscb$Co-Managed$sscb$, $sscb$Shared between the security organization and another team or provider.$sscb$, null, 20, true),
  (null, $sscb$delivery_model$sscb$, $sscb$advisory_consulting$sscb$, $sscb$Advisory / Consulting$sscb$, $sscb$Advice and guidance. The consumer remains the operator.$sscb$, null, 30, true),
  (null, $sscb$delivery_model$sscb$, $sscb$project_assessment$sscb$, $sscb$Project / Assessment$sscb$, $sscb$A bounded project, review, or assessment.$sscb$, null, 40, true),
  (null, $sscb$delivery_model$sscb$, $sscb$automated_self_service$sscb$, $sscb$Automated / Self-Service$sscb$, $sscb$The consumer starts it themselves through a portal or automation.$sscb$, null, 50, true),
  (null, $sscb$team$sscb$, $sscb$corp_security_grc$sscb$, $sscb$Corporate Security / GRC$sscb$, $sscb$Often the accountable owner team.$sscb$, null, 10, true),
  (null, $sscb$team$sscb$, $sscb$soc$sscb$, $sscb$SOC / SecOps$sscb$, $sscb$Owner or delivery. The operational watch.$sscb$, null, 20, true),
  (null, $sscb$team$sscb$, $sscb$iam$sscb$, $sscb$Identity & Access Management$sscb$, $sscb$Owner or delivery for identity services.$sscb$, null, 30, true),
  (null, $sscb$team$sscb$, $sscb$appsec$sscb$, $sscb$Application Security$sscb$, $sscb$Owner or delivery for product and application security.$sscb$, null, 40, true),
  (null, $sscb$team$sscb$, $sscb$privacy_ai_gov$sscb$, $sscb$Privacy & AI Governance$sscb$, $sscb$Owner or delivery for privacy and AI governance.$sscb$, null, 50, true),
  (null, $sscb$team$sscb$, $sscb$sec_engineering$sscb$, $sscb$Security Engineering$sscb$, $sscb$Owner or delivery for security engineering and architecture support.$sscb$, null, 60, true),
  (null, $sscb$team$sscb$, $sscb$vciso_leadership$sscb$, $sscb$vCISO / Security Leadership$sscb$, $sscb$Often the accountable owner for leadership and program services.$sscb$, null, 70, true),
  (null, $sscb$team$sscb$, $sscb$it_infrastructure$sscb$, $sscb$IT Infrastructure$sscb$, $sscb$Often the operating delivery team when IT runs the control.$sscb$, null, 80, true),
  (null, $sscb$team$sscb$, $sscb$service_desk$sscb$, $sscb$Service Desk$sscb$, $sscb$Often the delivery path for intake and user-facing support.$sscb$, null, 90, true),
  (null, $sscb$team$sscb$, $sscb$cloud_engineering$sscb$, $sscb$Cloud Engineering$sscb$, $sscb$Often the delivery team for cloud platforms.$sscb$, null, 100, true),
  (null, $sscb$team$sscb$, $sscb$external_mssp$sscb$, $sscb$External MSSP$sscb$, $sscb$Often the delivery team when a provider operates the service.$sscb$, null, 110, true),
  (null, $sscb$business_unit$sscb$, $sscb$enterprise$sscb$, $sscb$Enterprise / Corporate$sscb$, $sscb$Company-wide or corporate functions.$sscb$, null, 10, true),
  (null, $sscb$business_unit$sscb$, $sscb$technology$sscb$, $sscb$Technology / IT$sscb$, $sscb$Technology, product platforms, or central IT.$sscb$, null, 20, true),
  (null, $sscb$business_unit$sscb$, $sscb$operations$sscb$, $sscb$Operations$sscb$, $sscb$Operational business units.$sscb$, null, 30, true),
  (null, $sscb$business_unit$sscb$, $sscb$finance$sscb$, $sscb$Finance$sscb$, $sscb$Finance and related control functions.$sscb$, null, 40, true),
  (null, $sscb$business_unit$sscb$, $sscb$hr$sscb$, $sscb$Human Resources$sscb$, $sscb$People and workforce functions.$sscb$, null, 50, true),
  (null, $sscb$business_unit$sscb$, $sscb$product$sscb$, $sscb$Product / R&D$sscb$, $sscb$Product, engineering, or research organizations.$sscb$, null, 60, true),
  (null, $sscb$business_unit$sscb$, $sscb$customer_facing$sscb$, $sscb$Customer-Facing Business Units$sscb$, $sscb$Units that serve customers directly.$sscb$, null, 70, true),
  (null, $sscb$business_unit$sscb$, $sscb$other$sscb$, $sscb$Other / Cross-Functional$sscb$, $sscb$Cross-functional, or a unit not listed yet.$sscb$, null, 80, true),
  (null, $sscb$review_cadence$sscb$, $sscb$monthly$sscb$, $sscb$Monthly$sscb$, $sscb$Adds 1 month to the last reviewed date.$sscb$, null, 10, true),
  (null, $sscb$review_cadence$sscb$, $sscb$quarterly$sscb$, $sscb$Quarterly$sscb$, $sscb$Adds 3 months to the last reviewed date.$sscb$, null, 20, true),
  (null, $sscb$review_cadence$sscb$, $sscb$semi_annual$sscb$, $sscb$Semi-Annual$sscb$, $sscb$Adds 6 months to the last reviewed date.$sscb$, null, 30, true),
  (null, $sscb$review_cadence$sscb$, $sscb$annual$sscb$, $sscb$Annual$sscb$, $sscb$Adds 12 months to the last reviewed date.$sscb$, null, 40, true),
  (null, $sscb$review_cadence$sscb$, $sscb$on_change$sscb$, $sscb$On Change$sscb$, $sscb$No automatic next date. Review when the service changes.$sscb$, null, 50, true),
  (null, $sscb$intake_method$sscb$, $sscb$itsm_ticket$sscb$, $sscb$ITSM / Ticket$sscb$, $sscb$Request opens a ticket in the work-management tool.$sscb$, null, 10, true),
  (null, $sscb$intake_method$sscb$, $sscb$self_service_portal$sscb$, $sscb$Self-Service Portal$sscb$, $sscb$The consumer submits through a portal or form.$sscb$, null, 20, true),
  (null, $sscb$intake_method$sscb$, $sscb$email$sscb$, $sscb$Email Request$sscb$, $sscb$Request arrives by email to a named mailbox.$sscb$, null, 30, true),
  (null, $sscb$intake_method$sscb$, $sscb$chat$sscb$, $sscb$Chat / Collaboration Channel$sscb$, $sscb$Request arrives in an agreed chat channel.$sscb$, null, 40, true),
  (null, $sscb$intake_method$sscb$, $sscb$scheduled$sscb$, $sscb$Scheduled / Recurring$sscb$, $sscb$The service runs on a schedule without a per-request intake.$sscb$, null, 50, true),
  (null, $sscb$intake_method$sscb$, $sscb$account_team$sscb$, $sscb$Account Team Request$sscb$, $sscb$The account or relationship owner submits the request.$sscb$, null, 60, true),
  (null, $sscb$target_audience$sscb$, $sscb$all_workforce$sscb$, $sscb$All Workforce$sscb$, $sscb$Every employee and contractor in scope.$sscb$, null, 10, true),
  (null, $sscb$target_audience$sscb$, $sscb$executives$sscb$, $sscb$Executives & Board$sscb$, $sscb$Senior leadership and board audiences.$sscb$, null, 20, true),
  (null, $sscb$target_audience$sscb$, $sscb$it_engineering$sscb$, $sscb$IT & Engineering$sscb$, $sscb$Technology operators and builders.$sscb$, null, 30, true),
  (null, $sscb$target_audience$sscb$, $sscb$security_team$sscb$, $sscb$Security Team$sscb$, $sscb$The security organization itself.$sscb$, null, 40, true),
  (null, $sscb$target_audience$sscb$, $sscb$business_owners$sscb$, $sscb$Business Owners$sscb$, $sscb$Owners of business processes and services.$sscb$, null, 50, true),
  (null, $sscb$target_audience$sscb$, $sscb$external_parties$sscb$, $sscb$External Parties$sscb$, $sscb$Suppliers, partners, or other outside parties.$sscb$, null, 60, true),
  (null, $sscb$target_audience$sscb$, $sscb$customers$sscb$, $sscb$Customers$sscb$, $sscb$The organization’s customers.$sscb$, null, 70, true)
on conflict (field_key, code) where tenant_id is null do nothing;

insert into public.starter_service_templates (
  service_code, name, internal_name, category, status, service_tier, summary, description, in_scope, out_of_scope, deliverables, prerequisites, owner_team, delivery_team, business_unit, service_owner, delivery_model, target_audience, intake_method, intake_url, approval_required, approver, lead_time, support_contact, hours_of_coverage, sla_response_target, sla_resolution_target, primary_csf_function, capability_rating, threats_addressed, data_classification_handled, kpis_and_metrics, current_maturity_cmmi, target_maturity_cmmi, known_gaps_or_risks, third_party_providers, cost_model, cost_or_effort_notes, current_tooling_notes, internal_notes, review_cadence, last_reviewed_date
) values
  ($sscb$SVC-001$sscb$, $sscb$Security Monitoring and Detection$sscb$, $sscb$Monitoring$sscb$, $sscb$secops$sscb$, $sscb$active$sscb$, $sscb$tier_0$sscb$, $sscb$Monitor agreed log sources, triage detections, and escalate confirmed incidents.$sscb$, $sscb$A starter entry. Replace the summary, hours, and tooling with the real service.$sscb$, $sscb$Log sources listed in the onboarding register.$sscb$, null, null, null, $sscb$soc$sscb$, $sscb$soc$sscb$, null, $sscb$Security operations lead$sscb$, $sscb$managed_continuous$sscb$, '{}'::text[], null, null, false, null, null, null, $sscb$24x7x365$sscb$, null, null, $sscb$detect$sscb$, $sscb$partial$sscb$, null, null, null, 2, 3, null, null, null, null, null, $sscb$Sample entry. Edit or retire it once the real service is written.$sscb$, $sscb$quarterly$sscb$, $sscb$2026-08-01$sscb$::date),
  ($sscb$SVC-002$sscb$, $sscb$Identity and Access Administration$sscb$, null, $sscb$iam$sscb$, $sscb$active$sscb$, $sscb$tier_0$sscb$, $sscb$Joiners, movers, leavers, and privileged access for workforce accounts.$sscb$, $sscb$Security owns the standard. The identity team operates the requests.$sscb$, null, null, null, null, $sscb$corp_security_grc$sscb$, $sscb$iam$sscb$, null, $sscb$Identity lead$sscb$, $sscb$co_managed$sscb$, '{}'::text[], null, null, true, $sscb$Manager$sscb$, null, null, $sscb$business_8x5$sscb$, null, null, $sscb$protect$sscb$, $sscb$full$sscb$, null, null, null, 2, 3, null, null, null, null, null, null, $sscb$quarterly$sscb$, $sscb$2026-08-01$sscb$::date),
  ($sscb$SVC-003$sscb$, $sscb$Vulnerability Management$sscb$, null, $sscb$vuln_mgmt$sscb$, $sscb$active$sscb$, $sscb$tier_1$sscb$, $sscb$Find priority weaknesses and track them through remediation or an approved exception.$sscb$, null, null, null, null, null, $sscb$sec_engineering$sscb$, $sscb$it_infrastructure$sscb$, null, $sscb$Exposure lead$sscb$, $sscb$co_managed$sscb$, '{}'::text[], null, null, false, null, null, null, null, null, null, $sscb$identify$sscb$, $sscb$partial$sscb$, null, null, null, 1, 3, $sscb$Sample gap: state which networks are actually scanned.$sscb$, null, null, null, null, null, $sscb$quarterly$sscb$, $sscb$2026-08-01$sscb$::date),
  ($sscb$SVC-004$sscb$, $sscb$Security Awareness Training$sscb$, null, $sscb$awareness$sscb$, $sscb$active$sscb$, $sscb$tier_3$sscb$, $sscb$Baseline security training and a periodic phishing exercise for the workforce.$sscb$, null, null, null, null, null, $sscb$vciso_leadership$sscb$, $sscb$service_desk$sscb$, null, $sscb$Security awareness lead$sscb$, $sscb$managed_continuous$sscb$, array[$sscb$all_workforce$sscb$]::text[], null, null, false, null, null, null, $sscb$scheduled_periodic$sscb$, null, null, $sscb$govern$sscb$, $sscb$full$sscb$, null, null, null, 2, 3, null, null, null, null, null, null, $sscb$annual$sscb$, $sscb$2026-01-15$sscb$::date)
on conflict (service_code) do nothing;
-- STARTER_DATA_END

create or replace function public.provision_tenant_internal(
  p_name text,
  p_slug text,
  p_user uuid,
  p_role text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text;
begin
  if p_role not in ('platform_owner', 'tenant_admin', 'editor', 'viewer') then
    raise exception 'Unknown role';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug must be lowercase letters, numbers, and hyphens';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'Workspace name is required';
  end if;

  insert into public.tenants (id, slug, name)
  values (v_id, p_slug, trim(p_name));

  if p_user is not null then
    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_id, p_user, p_role);
    select email into v_email from auth.users where id = p_user;
  end if;

  perform set_config('sscb.skip_audit', 'on', true);

  insert into public.field_definitions (
    tenant_id, field_key, label, help_text, input_type, lookup_field_key,
    is_required, visibility, depth_level, sort_order, is_active, is_standard
  )
  select
    v_id, field_key, label, help_text, input_type, lookup_field_key,
    is_required, visibility, depth_level, sort_order, is_active, is_standard
  from public.field_definitions
  where tenant_id is null;

  insert into public.lookup_options (
    tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
  )
  select
    v_id, field_key, code, label, description, code_prefix, sort_order, is_active
  from public.lookup_options
  where tenant_id is null;

  perform set_config('sscb.skip_audit', 'off', true);

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_label, table_name, row_id, action, after_data
  ) values (
    v_id,
    p_user,
    coalesce(v_email, 'system'),
    'tenants',
    v_id,
    'insert',
    jsonb_build_object('name', trim(p_name), 'slug', p_slug)
  );

  return v_id;
end;
$$;

create or replace function public.provision_tenant(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_platform_owner() then
    raise exception 'Only a platform owner can provision a workspace';
  end if;
  return public.provision_tenant_internal(p_name, p_slug, auth.uid(), 'platform_owner');
end;
$$;

create or replace function public.ensure_practitioner_access()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(481001);

  select tenant_id into v_existing
  from public.tenant_members
  where user_id = v_uid
  order by created_at
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  if exists (select 1 from public.tenant_members where role = 'platform_owner') then
    raise exception 'No workspace membership for this account. A platform owner must add you to a workspace.';
  end if;

  v_slug := 'starter-workspace';
  if exists (select 1 from public.tenants where slug = v_slug) then
    v_slug := 'starter-workspace-' || substr(replace(v_uid::text, '-', ''), 1, 8);
  end if;

  return public.provision_tenant_internal('Starter Workspace', v_slug, v_uid, 'platform_owner');
end;
$$;

create or replace function public.load_starter_sample_services(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_write_services(p_tenant_id) then
    raise exception 'You do not have permission to add services in this workspace';
  end if;
  if exists (select 1 from public.services where tenant_id = p_tenant_id) then
    raise exception 'Starter services can only be loaded into an empty workspace';
  end if;

  insert into public.services (
    tenant_id, service_code, name, internal_name, category, status, service_tier, summary, description,
    in_scope, out_of_scope, deliverables, prerequisites, owner_team, delivery_team, business_unit,
    service_owner, delivery_model, target_audience, intake_method, intake_url, approval_required, approver,
    lead_time, support_contact, hours_of_coverage, sla_response_target, sla_resolution_target,
    primary_csf_function, capability_rating, threats_addressed, data_classification_handled, kpis_and_metrics,
    current_maturity_cmmi, target_maturity_cmmi, known_gaps_or_risks, third_party_providers, cost_model,
    cost_or_effort_notes, current_tooling_notes, internal_notes, review_cadence, last_reviewed_date
  )
  select
    p_tenant_id, service_code, name, internal_name, category, status, service_tier, summary, description,
    in_scope, out_of_scope, deliverables, prerequisites, owner_team, delivery_team, business_unit,
    service_owner, delivery_model, target_audience, intake_method, intake_url, approval_required, approver,
    lead_time, support_contact, hours_of_coverage, sla_response_target, sla_resolution_target,
    primary_csf_function, capability_rating, threats_addressed, data_classification_handled, kpis_and_metrics,
    current_maturity_cmmi, target_maturity_cmmi, known_gaps_or_risks, third_party_providers, cost_model,
    cost_or_effort_notes, current_tooling_notes, internal_notes, review_cadence, last_reviewed_date
  from public.starter_service_templates
  order by service_code;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.add_tenant_member(p_tenant uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_admin_tenant(p_tenant) then
    raise exception 'Only a workspace admin can add members';
  end if;
  if p_role not in ('tenant_admin', 'editor', 'viewer', 'platform_owner') then
    raise exception 'Unknown role';
  end if;
  if p_role = 'platform_owner' and not public.is_platform_owner() then
    raise exception 'Only a platform owner can grant platform owner';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account exists for that email yet. Ask them to sign up first.';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (p_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.list_visible_members()
returns table (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.tenant_id, m.user_id, u.email::text, m.role, m.created_at
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where public.can_access_tenant(m.tenant_id);
$$;

revoke all on function public.provision_tenant_internal(text, text, uuid, text) from public, anon;
revoke all on function public.provision_tenant(text, text) from public, anon;
revoke all on function public.ensure_practitioner_access() from public, anon;
revoke all on function public.load_starter_sample_services(uuid) from public, anon;
revoke all on function public.add_tenant_member(uuid, text, text) from public, anon;
revoke all on function public.list_visible_members() from public, anon;
revoke all on function public.is_platform_owner() from public, anon;
revoke all on function public.can_access_tenant(uuid) from public, anon;
revoke all on function public.can_write_services(uuid) from public, anon;
revoke all on function public.can_admin_tenant(uuid) from public, anon;

grant execute on function public.provision_tenant(text, text) to authenticated;
grant execute on function public.ensure_practitioner_access() to authenticated;
grant execute on function public.load_starter_sample_services(uuid) to authenticated;
grant execute on function public.add_tenant_member(uuid, text, text) to authenticated;
grant execute on function public.list_visible_members() to authenticated;
grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.can_access_tenant(uuid) to authenticated;
grant execute on function public.can_write_services(uuid) to authenticated;
grant execute on function public.can_admin_tenant(uuid) to authenticated;

revoke all on table
  public.tenants,
  public.tenant_members,
  public.field_definitions,
  public.lookup_options,
  public.services,
  public.audit_log,
  public.starter_service_templates
from anon, public;

grant select, insert, update, delete on table
  public.tenants,
  public.tenant_members,
  public.field_definitions,
  public.lookup_options,
  public.services,
  public.audit_log
to authenticated;
