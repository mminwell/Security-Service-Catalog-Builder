-- Security Service Catalog Builder — V2 NIST CSF 2.0 outcome mapping.
-- Repeatable. Framework reference data, workspace assessments, RLS, and audit.
-- Apply after 0003_v1_2_blueprints_columns_import.sql. This file has no credentials.
-- A saved assessment is a workspace judgment. It is not NIST certification.

create table if not exists public.frameworks (
  id uuid primary key,
  code text not null,
  version text not null,
  name text not null,
  published_on date,
  publication text not null default '',
  publication_url text not null default '',
  source_title text not null default '',
  source_tool text not null default '',
  source_url text not null default '',
  reference_tool_url text not null default '',
  retrieved_on date,
  export_change_log text not null default '',
  export_generated_at text not null default '',
  export_sha256 text not null default '',
  content_sha256 text not null default '',
  id_namespace text not null default '',
  excluded_withdrawn_rows integer not null default 0,
  provenance text not null default '',
  is_active boolean not null default true,
  unique (code, version)
);

create table if not exists public.framework_elements (
  id uuid primary key,
  framework_id uuid not null references public.frameworks (id) on delete cascade,
  element_type text not null check (element_type in ('function', 'category', 'subcategory')),
  code text not null,
  parent_id uuid references public.framework_elements (id) on delete cascade,
  title text not null,
  statement text not null,
  sort_order integer not null,
  unique (framework_id, code)
);

create index if not exists framework_elements_parent_idx
  on public.framework_elements (parent_id, sort_order);

create table if not exists public.service_outcome_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  element_id uuid not null references public.framework_elements (id),
  coverage text not null check (coverage in ('full', 'partial', 'none')),
  rationale text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, element_id)
);

create index if not exists service_outcome_mappings_tenant_idx
  on public.service_outcome_mappings (tenant_id, element_id);

create or replace function public.enforce_outcome_mapping()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid;
  v_type text;
begin
  select tenant_id into v_tenant from public.services where id = new.service_id;
  if v_tenant is null then
    raise exception 'Outcome assessments belong to a service';
  end if;
  if v_tenant <> new.tenant_id then
    raise exception 'Outcome assessments stay in the service workspace';
  end if;
  select element_type into v_type from public.framework_elements where id = new.element_id;
  if v_type is distinct from 'subcategory' then
    raise exception 'Map a CSF subcategory outcome';
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

drop trigger if exists trg_a_mapping_enforce on public.service_outcome_mappings;
create trigger trg_a_mapping_enforce
  before insert or update on public.service_outcome_mappings
  for each row execute function public.enforce_outcome_mapping();

drop trigger if exists trg_b_mapping_audit on public.service_outcome_mappings;
create trigger trg_b_mapping_audit
  before insert or update or delete on public.service_outcome_mappings
  for each row execute function public.write_audit();

alter table public.frameworks enable row level security;
alter table public.framework_elements enable row level security;
alter table public.service_outcome_mappings enable row level security;

alter table public.frameworks force row level security;
alter table public.framework_elements force row level security;
alter table public.service_outcome_mappings force row level security;

drop policy if exists frameworks_select on public.frameworks;
create policy frameworks_select on public.frameworks
  for select to authenticated
  using (is_active);

drop policy if exists framework_elements_select on public.framework_elements;
create policy framework_elements_select on public.framework_elements
  for select to authenticated
  using (
    exists (
      select 1 from public.frameworks
      where frameworks.id = framework_elements.framework_id
        and frameworks.is_active
    )
  );

drop policy if exists mappings_select on public.service_outcome_mappings;
create policy mappings_select on public.service_outcome_mappings
  for select to authenticated
  using (public.can_access_tenant(tenant_id));

drop policy if exists mappings_insert on public.service_outcome_mappings;
create policy mappings_insert on public.service_outcome_mappings
  for insert to authenticated
  with check (public.can_write_services(tenant_id));

drop policy if exists mappings_update on public.service_outcome_mappings;
create policy mappings_update on public.service_outcome_mappings
  for update to authenticated
  using (public.can_write_services(tenant_id))
  with check (public.can_write_services(tenant_id));

drop policy if exists mappings_delete on public.service_outcome_mappings;
create policy mappings_delete on public.service_outcome_mappings
  for delete to authenticated
  using (public.can_write_services(tenant_id));

revoke all on table
  public.frameworks,
  public.framework_elements,
  public.service_outcome_mappings
from anon, public;

grant select on table
  public.frameworks,
  public.framework_elements
to authenticated;

grant select, insert, update, delete on table
  public.service_outcome_mappings
to authenticated;

-- FRAMEWORK_SEED_BEGIN
-- NIST CSF 2.0 core. Idempotent. Withdrawn crosswalk rows are not included.

insert into public.frameworks (
  id, code, version, name, published_on, publication, publication_url,
  source_title, source_tool, source_url, reference_tool_url, retrieved_on,
  export_change_log, export_generated_at, export_sha256, content_sha256,
  id_namespace, excluded_withdrawn_rows, provenance, is_active
) values (
  $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid,
  $sscb$NIST-CSF$sscb$,
  $sscb$2.0$sscb$,
  $sscb$NIST Cybersecurity Framework (CSF) 2.0$sscb$,
  $sscb$2024-02-26$sscb$::date,
  $sscb$NIST CSWP 29$sscb$,
  $sscb$https://doi.org/10.6028/NIST.CSWP.29$sscb$,
  $sscb$The NIST Cybersecurity Framework (CSF) 2.0$sscb$,
  $sscb$NIST Cybersecurity Framework (CSF) 2.0 Reference Tool$sscb$,
  $sscb$https://csrc.nist.gov/extensions/nudp/services/json/csf/download?olirids=all$sscb$,
  $sscb$https://csrc.nist.gov/Projects/cybersecurity-framework/Filters#/csf/filters$sscb$,
  $sscb$2026-11-06$sscb$::date,
  $sscb$Final$sscb$,
  $sscb$2026-11-06 17:35:34.123000$sscb$,
  $sscb$7afe88bfbad7a8ed6ac54d88d4a14715d31398367d4bf164d8b089127f808ed6$sscb$,
  $sscb$1104ec7ac38bab958c2159083bd7240a8261647447cf77ada39f73204a2693b8$sscb$,
  $sscb$uuid5(uuid5(NAMESPACE_URL, https://doi.org/10.6028/NIST.CSWP.29), NIST-CSF:2.0[:CODE])$sscb$,
  91,
  $sscb$Functions, categories, and subcategory outcome statements extracted from the NIST CSF 2.0 Reference Tool export. Implementation Examples and Informative References in that export are not seeded. Rows whose statement begins with [Withdrawn are CSF 1.1 crosswalk notes and are not CSF 2.0 outcomes. A mapping in this catalog is a workspace assessment. It is not NIST certification.$sscb$,
  true
)
on conflict (code, version) do update set
  name = excluded.name,
  published_on = excluded.published_on,
  publication = excluded.publication,
  publication_url = excluded.publication_url,
  source_title = excluded.source_title,
  source_tool = excluded.source_tool,
  source_url = excluded.source_url,
  reference_tool_url = excluded.reference_tool_url,
  retrieved_on = excluded.retrieved_on,
  export_change_log = excluded.export_change_log,
  export_generated_at = excluded.export_generated_at,
  export_sha256 = excluded.export_sha256,
  content_sha256 = excluded.content_sha256,
  id_namespace = excluded.id_namespace,
  excluded_withdrawn_rows = excluded.excluded_withdrawn_rows,
  provenance = excluded.provenance,
  is_active = excluded.is_active;

insert into public.framework_elements (
  id, framework_id, element_type, code, parent_id, title, statement, sort_order
) values
  ($sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$function$sscb$, $sscb$GV$sscb$, null, $sscb$GOVERN$sscb$, $sscb$The organization's cybersecurity risk management strategy, expectations, and policy are established, communicated, and monitored$sscb$, 1),
  ($sscb$b3c2b9ce-7156-566b-930b-90f08bf5d561$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$function$sscb$, $sscb$ID$sscb$, null, $sscb$IDENTIFY$sscb$, $sscb$The organization's current cybersecurity risks are understood$sscb$, 39),
  ($sscb$eb843e7a-92c6-5aae-bae1-5ae148fe9de7$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$function$sscb$, $sscb$PR$sscb$, null, $sscb$PROTECT$sscb$, $sscb$Safeguards to manage the organization's cybersecurity risks are used$sscb$, 64),
  ($sscb$8a502742-5861-503e-849f-17f473941a42$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$function$sscb$, $sscb$DE$sscb$, null, $sscb$DETECT$sscb$, $sscb$Possible cybersecurity attacks and compromises are found and analyzed$sscb$, 92),
  ($sscb$20bede1b-1d1b-5c16-8112-43685e645c5c$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$function$sscb$, $sscb$RS$sscb$, null, $sscb$RESPOND$sscb$, $sscb$Actions regarding a detected cybersecurity incident are taken$sscb$, 106),
  ($sscb$5c80b5f5-f942-5ec8-a7f4-127cebb2da97$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$function$sscb$, $sscb$RC$sscb$, null, $sscb$RECOVER$sscb$, $sscb$Assets and operations affected by a cybersecurity incident are restored$sscb$, 124)
on conflict (framework_id, code) do update set
  element_type = excluded.element_type,
  parent_id = excluded.parent_id,
  title = excluded.title,
  statement = excluded.statement,
  sort_order = excluded.sort_order;

insert into public.framework_elements (
  id, framework_id, element_type, code, parent_id, title, statement, sort_order
) values
  ($sscb$0dd9b4ca-2825-517e-907b-f07776f48784$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$GV.OC$sscb$, $sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$Organizational Context$sscb$, $sscb$The circumstances - mission, stakeholder expectations, dependencies, and legal, regulatory, and contractual requirements - surrounding the organization's cybersecurity risk management decisions are understood$sscb$, 2),
  ($sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$GV.RM$sscb$, $sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$Risk Management Strategy$sscb$, $sscb$The organization's priorities, constraints, risk tolerance and appetite statements, and assumptions are established, communicated, and used to support operational risk decisions$sscb$, 8),
  ($sscb$a1bfcffc-70ea-563b-bdd5-787ffaec2e73$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$GV.RR$sscb$, $sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$Roles, Responsibilities, and Authorities$sscb$, $sscb$Cybersecurity roles, responsibilities, and authorities to foster accountability, performance assessment, and continuous improvement are established and communicated$sscb$, 16),
  ($sscb$da67002b-16c4-5fad-ba38-59459b872e9a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$GV.PO$sscb$, $sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$Policy$sscb$, $sscb$Organizational cybersecurity policy is established, communicated, and enforced$sscb$, 21),
  ($sscb$4cfab221-201e-5307-957d-57e9cbaf387a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$GV.OV$sscb$, $sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$Oversight$sscb$, $sscb$Results of organization-wide cybersecurity risk management activities and performance are used to inform, improve, and adjust the risk management strategy$sscb$, 24),
  ($sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$GV.SC$sscb$, $sscb$f75cd82b-1b1a-51bf-aeb2-e0ebbdb1df7c$sscb$::uuid, $sscb$Cybersecurity Supply Chain Risk Management$sscb$, $sscb$Cyber supply chain risk management processes are identified, established, managed, monitored, and improved by organizational stakeholders$sscb$, 28),
  ($sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$ID.AM$sscb$, $sscb$b3c2b9ce-7156-566b-930b-90f08bf5d561$sscb$::uuid, $sscb$Asset Management$sscb$, $sscb$Assets (e.g., data, hardware, software, systems, facilities, services, people) that enable the organization to achieve business purposes are identified and managed consistent with their relative importance to organizational objectives and the organization's risk strategy$sscb$, 40),
  ($sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$ID.RA$sscb$, $sscb$b3c2b9ce-7156-566b-930b-90f08bf5d561$sscb$::uuid, $sscb$Risk Assessment$sscb$, $sscb$The cybersecurity risk to the organization, assets, and individuals is understood by the organization$sscb$, 48),
  ($sscb$2bf6a723-81fd-5b67-91ae-2b89e0d5e74b$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$ID.IM$sscb$, $sscb$b3c2b9ce-7156-566b-930b-90f08bf5d561$sscb$::uuid, $sscb$Improvement$sscb$, $sscb$Improvements to organizational cybersecurity risk management processes, procedures and activities are identified across all CSF Functions$sscb$, 59),
  ($sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$PR.AA$sscb$, $sscb$eb843e7a-92c6-5aae-bae1-5ae148fe9de7$sscb$::uuid, $sscb$Identity Management, Authentication, and Access Control$sscb$, $sscb$Access to physical and logical assets is limited to authorized users, services, and hardware and  managed commensurate with the assessed risk of unauthorized access$sscb$, 65),
  ($sscb$0216f08e-621f-5cfa-b21e-d76601fe5060$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$PR.AT$sscb$, $sscb$eb843e7a-92c6-5aae-bae1-5ae148fe9de7$sscb$::uuid, $sscb$Awareness and Training$sscb$, $sscb$The organization's personnel are provided with cybersecurity awareness and training so that they can perform their cybersecurity-related tasks$sscb$, 72),
  ($sscb$63c7e5ec-4572-5d2f-9afa-0b0022f9ea1a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$PR.DS$sscb$, $sscb$eb843e7a-92c6-5aae-bae1-5ae148fe9de7$sscb$::uuid, $sscb$Data Security$sscb$, $sscb$Data are managed consistent with the organization's risk strategy to protect the confidentiality, integrity, and availability of information$sscb$, 75),
  ($sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$PR.PS$sscb$, $sscb$eb843e7a-92c6-5aae-bae1-5ae148fe9de7$sscb$::uuid, $sscb$Platform Security$sscb$, $sscb$The hardware, software (e.g., firmware, operating systems, applications), and services of physical and virtual platforms are managed consistent with the organization's risk strategy to protect their confidentiality, integrity, and availability$sscb$, 80),
  ($sscb$bbbcd250-a097-5038-9fc7-67066ea7003a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$PR.IR$sscb$, $sscb$eb843e7a-92c6-5aae-bae1-5ae148fe9de7$sscb$::uuid, $sscb$Technology Infrastructure Resilience$sscb$, $sscb$Security architectures are managed with the organization's risk strategy to protect asset confidentiality, integrity, and availability, and organizational resilience$sscb$, 87),
  ($sscb$6a6eaa07-2230-5fae-9a84-d060bcb30dff$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$DE.CM$sscb$, $sscb$8a502742-5861-503e-849f-17f473941a42$sscb$::uuid, $sscb$Continuous Monitoring$sscb$, $sscb$Assets are monitored to find anomalies, indicators of compromise, and other potentially adverse events$sscb$, 93),
  ($sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$DE.AE$sscb$, $sscb$8a502742-5861-503e-849f-17f473941a42$sscb$::uuid, $sscb$Adverse Event Analysis$sscb$, $sscb$Anomalies, indicators of compromise, and other potentially adverse events are analyzed to characterize the events and detect cybersecurity incidents$sscb$, 99),
  ($sscb$3a094c11-ed1e-50d4-b39b-10b874f81753$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$RS.MA$sscb$, $sscb$20bede1b-1d1b-5c16-8112-43685e645c5c$sscb$::uuid, $sscb$Incident Management$sscb$, $sscb$Responses to detected cybersecurity incidents are managed$sscb$, 107),
  ($sscb$fec33079-b0ef-5145-b03e-1560630b4e71$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$RS.AN$sscb$, $sscb$20bede1b-1d1b-5c16-8112-43685e645c5c$sscb$::uuid, $sscb$Incident Analysis$sscb$, $sscb$Investigations are conducted to ensure effective response and support forensics and recovery activities$sscb$, 113),
  ($sscb$8ceec8bb-b8c3-5e95-989d-06dee6fd35d5$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$RS.CO$sscb$, $sscb$20bede1b-1d1b-5c16-8112-43685e645c5c$sscb$::uuid, $sscb$Incident Response Reporting and Communication$sscb$, $sscb$Response activities are coordinated with internal and external stakeholders as required by laws, regulations, or policies$sscb$, 118),
  ($sscb$3f8c1ec9-bdcf-5bc6-b22a-36fd67087f4f$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$RS.MI$sscb$, $sscb$20bede1b-1d1b-5c16-8112-43685e645c5c$sscb$::uuid, $sscb$Incident Mitigation$sscb$, $sscb$Activities are performed to prevent expansion of an event and mitigate its effects$sscb$, 121),
  ($sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$RC.RP$sscb$, $sscb$5c80b5f5-f942-5ec8-a7f4-127cebb2da97$sscb$::uuid, $sscb$Incident Recovery Plan Execution$sscb$, $sscb$Restoration activities are performed to ensure operational availability of systems and services affected by cybersecurity incidents$sscb$, 125),
  ($sscb$48163add-cd9f-53f0-8dfd-aedcd9651008$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$category$sscb$, $sscb$RC.CO$sscb$, $sscb$5c80b5f5-f942-5ec8-a7f4-127cebb2da97$sscb$::uuid, $sscb$Incident Recovery Communication$sscb$, $sscb$Restoration activities are coordinated with internal and external parties$sscb$, 132)
on conflict (framework_id, code) do update set
  element_type = excluded.element_type,
  parent_id = excluded.parent_id,
  title = excluded.title,
  statement = excluded.statement,
  sort_order = excluded.sort_order;

insert into public.framework_elements (
  id, framework_id, element_type, code, parent_id, title, statement, sort_order
) values
  ($sscb$1ca3110e-ba0f-538a-9b53-c58c4032dbce$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OC-01$sscb$, $sscb$0dd9b4ca-2825-517e-907b-f07776f48784$sscb$::uuid, $sscb$GV.OC-01$sscb$, $sscb$The organizational mission is understood and informs cybersecurity risk management$sscb$, 3),
  ($sscb$0aa5f6c2-41cd-5247-8ef3-6c54a5cf5721$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OC-02$sscb$, $sscb$0dd9b4ca-2825-517e-907b-f07776f48784$sscb$::uuid, $sscb$GV.OC-02$sscb$, $sscb$Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered$sscb$, 4),
  ($sscb$4b281203-9932-5ed7-8e5c-a1c4e9d3e611$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OC-03$sscb$, $sscb$0dd9b4ca-2825-517e-907b-f07776f48784$sscb$::uuid, $sscb$GV.OC-03$sscb$, $sscb$Legal, regulatory, and contractual requirements regarding cybersecurity - including privacy and civil liberties obligations - are understood and managed$sscb$, 5),
  ($sscb$bc9c4221-4901-5817-b40a-f329c9a382cc$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OC-04$sscb$, $sscb$0dd9b4ca-2825-517e-907b-f07776f48784$sscb$::uuid, $sscb$GV.OC-04$sscb$, $sscb$Critical objectives, capabilities, and services that external stakeholders depend on or expect from the organization are understood and communicated$sscb$, 6),
  ($sscb$a465737a-e8f1-51b6-8802-67dc8f2572f1$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OC-05$sscb$, $sscb$0dd9b4ca-2825-517e-907b-f07776f48784$sscb$::uuid, $sscb$GV.OC-05$sscb$, $sscb$Outcomes, capabilities, and services that the organization depends on are understood and communicated$sscb$, 7),
  ($sscb$fd85f4e6-e195-55dc-985a-df43a5195165$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-01$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-01$sscb$, $sscb$Risk management objectives are established and agreed to by organizational stakeholders$sscb$, 9),
  ($sscb$a8e54b71-261e-58b1-93dd-dda97e388fc7$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-02$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-02$sscb$, $sscb$Risk appetite and risk tolerance statements are established, communicated, and maintained$sscb$, 10),
  ($sscb$57e8b0dc-42c6-52df-ac5f-850cfdf6da38$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-03$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-03$sscb$, $sscb$Cybersecurity risk management activities and outcomes are included in enterprise risk management processes$sscb$, 11),
  ($sscb$f1c997b4-27dd-5ac2-9fcd-d1f2e0e2ad00$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-04$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-04$sscb$, $sscb$Strategic direction that describes appropriate risk response options is established and communicated$sscb$, 12),
  ($sscb$3b081ca3-51e1-572f-8be0-0c2e6dc745f9$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-05$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-05$sscb$, $sscb$Lines of communication across the organization are established for cybersecurity risks, including risks from suppliers and other third parties$sscb$, 13),
  ($sscb$fc83d6bc-b606-5c0b-8796-dbcd24a62c52$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-06$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-06$sscb$, $sscb$A standardized method for calculating, documenting, categorizing, and prioritizing cybersecurity risks is established and communicated$sscb$, 14),
  ($sscb$62c8bc2d-9210-51a7-82d1-b817e293a335$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RM-07$sscb$, $sscb$14d84c86-7254-59fc-8a85-bb78e32b8722$sscb$::uuid, $sscb$GV.RM-07$sscb$, $sscb$Strategic opportunities (i.e., positive risks) are characterized and are included in organizational cybersecurity risk discussions$sscb$, 15),
  ($sscb$1b256f16-e841-5c40-b6be-7371ac4517f4$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RR-01$sscb$, $sscb$a1bfcffc-70ea-563b-bdd5-787ffaec2e73$sscb$::uuid, $sscb$GV.RR-01$sscb$, $sscb$Organizational leadership is responsible and accountable for cybersecurity risk and fosters a culture that is risk-aware, ethical, and continually improving$sscb$, 17),
  ($sscb$22b4382a-9d58-5c1e-b8ad-5a5c24c2f9e9$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RR-02$sscb$, $sscb$a1bfcffc-70ea-563b-bdd5-787ffaec2e73$sscb$::uuid, $sscb$GV.RR-02$sscb$, $sscb$Roles, responsibilities, and authorities related to cybersecurity risk management are established, communicated, understood, and enforced$sscb$, 18),
  ($sscb$770b80ba-bd37-5f99-9643-14b25d03a0c5$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RR-03$sscb$, $sscb$a1bfcffc-70ea-563b-bdd5-787ffaec2e73$sscb$::uuid, $sscb$GV.RR-03$sscb$, $sscb$Adequate resources are allocated commensurate with the cybersecurity risk strategy, roles, responsibilities, and policies$sscb$, 19),
  ($sscb$0177647d-79c9-5aa9-9b81-6bb5805f63a5$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.RR-04$sscb$, $sscb$a1bfcffc-70ea-563b-bdd5-787ffaec2e73$sscb$::uuid, $sscb$GV.RR-04$sscb$, $sscb$Cybersecurity is included in human resources practices$sscb$, 20),
  ($sscb$98a19cad-7341-5d0a-b88f-069585233446$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.PO-01$sscb$, $sscb$da67002b-16c4-5fad-ba38-59459b872e9a$sscb$::uuid, $sscb$GV.PO-01$sscb$, $sscb$Policy for managing cybersecurity risks is established based on organizational context, cybersecurity strategy, and priorities and is communicated and enforced$sscb$, 22),
  ($sscb$4ed3a9f1-78c3-5241-8700-04eab22ac88e$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.PO-02$sscb$, $sscb$da67002b-16c4-5fad-ba38-59459b872e9a$sscb$::uuid, $sscb$GV.PO-02$sscb$, $sscb$Policy for managing cybersecurity risks is reviewed, updated, communicated, and enforced to reflect changes in requirements, threats, technology, and organizational mission$sscb$, 23),
  ($sscb$f7ad0b28-d224-55fb-9f65-d7bad3ba3b59$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OV-01$sscb$, $sscb$4cfab221-201e-5307-957d-57e9cbaf387a$sscb$::uuid, $sscb$GV.OV-01$sscb$, $sscb$Cybersecurity risk management strategy outcomes are reviewed to inform and adjust strategy and direction$sscb$, 25),
  ($sscb$98ec5923-3e22-52fd-8418-d0fddef93c64$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OV-02$sscb$, $sscb$4cfab221-201e-5307-957d-57e9cbaf387a$sscb$::uuid, $sscb$GV.OV-02$sscb$, $sscb$The cybersecurity risk management strategy is reviewed and adjusted to ensure coverage of organizational requirements and risks$sscb$, 26),
  ($sscb$6447f53c-ded8-5fb0-8661-4df3a8befd0b$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.OV-03$sscb$, $sscb$4cfab221-201e-5307-957d-57e9cbaf387a$sscb$::uuid, $sscb$GV.OV-03$sscb$, $sscb$Organizational cybersecurity risk management performance is evaluated and reviewed for adjustments needed$sscb$, 27),
  ($sscb$4cf75137-da28-5680-92e9-d0c8aecf8319$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-01$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-01$sscb$, $sscb$A cybersecurity supply chain risk management program, strategy, objectives, policies, and processes are established and agreed to by organizational stakeholders$sscb$, 29),
  ($sscb$9fd1a66c-0aff-52f9-96eb-dd795ae206ba$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-02$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-02$sscb$, $sscb$Cybersecurity roles and responsibilities for suppliers, customers, and partners are established, communicated, and coordinated internally and externally$sscb$, 30),
  ($sscb$62a35412-db7a-5f29-8cae-afd6341ecc19$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-03$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-03$sscb$, $sscb$Cybersecurity supply chain risk management is integrated into cybersecurity and enterprise risk management, risk assessment, and improvement processes$sscb$, 31),
  ($sscb$d48e194a-6714-5a44-a0fb-0c5e6b7e0f56$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-04$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-04$sscb$, $sscb$Suppliers are known and prioritized by criticality$sscb$, 32),
  ($sscb$9ef33bd2-6875-5368-90eb-4cde20714cc4$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-05$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-05$sscb$, $sscb$Requirements to address cybersecurity risks in supply chains are established, prioritized, and integrated into contracts and other types of agreements with suppliers and other relevant third parties$sscb$, 33),
  ($sscb$9441d5d6-9172-559f-b847-e918fec743a0$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-06$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-06$sscb$, $sscb$Planning and due diligence are performed to reduce risks before entering into formal supplier or other third-party relationships$sscb$, 34),
  ($sscb$9fbd6c8a-49ab-51d9-803f-0a702979aef6$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-07$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-07$sscb$, $sscb$The risks posed by a supplier, their products and services, and other third parties are understood, recorded, prioritized, assessed, responded to, and monitored over the course of the relationship$sscb$, 35),
  ($sscb$62af2439-2b04-5c57-a553-c30e3a367908$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-08$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-08$sscb$, $sscb$Relevant suppliers and other third parties are included in incident planning, response, and recovery activities$sscb$, 36),
  ($sscb$c9e46a23-6bdf-5566-a4a5-3c4e0693d84a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-09$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-09$sscb$, $sscb$Supply chain security practices are integrated into cybersecurity and enterprise risk management programs, and their performance is monitored throughout the technology product and service life cycle$sscb$, 37),
  ($sscb$f35bebe5-5001-51a6-bbf7-438da59148a5$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$GV.SC-10$sscb$, $sscb$0c5fe38b-4160-56c3-813a-bdedd64dd5f6$sscb$::uuid, $sscb$GV.SC-10$sscb$, $sscb$Cybersecurity supply chain risk management plans include provisions for activities that occur after the conclusion of a partnership or service agreement$sscb$, 38),
  ($sscb$1922ce8b-07aa-5275-ad41-8743f5419db8$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-01$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-01$sscb$, $sscb$Inventories of hardware managed by the organization are maintained$sscb$, 41),
  ($sscb$c97dc4dc-db2e-5819-9847-5578b149310b$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-02$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-02$sscb$, $sscb$Inventories of software, services, and systems managed by the organization are maintained$sscb$, 42),
  ($sscb$94bb73cd-06f1-5e54-8db5-a754ef86f5e7$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-03$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-03$sscb$, $sscb$Representations of the organization's authorized network communication and internal and external network data flows are maintained$sscb$, 43),
  ($sscb$7a896e7d-a98d-5e70-a287-4aaa98123159$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-04$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-04$sscb$, $sscb$Inventories of services provided by suppliers are maintained$sscb$, 44),
  ($sscb$cb8b4e11-c76a-5f51-ba7a-8b68e6170fc0$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-05$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-05$sscb$, $sscb$Assets are prioritized based on classification, criticality, resources, and impact on the mission$sscb$, 45),
  ($sscb$6bfda6f4-e325-5424-8b2d-2c7de5a85142$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-07$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-07$sscb$, $sscb$Inventories of data and corresponding metadata for designated data types are maintained$sscb$, 46),
  ($sscb$7dfd79ad-5760-5bee-b1fc-f48fc3c8366c$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.AM-08$sscb$, $sscb$c38fe127-6051-5ecc-83b3-94cc453f1f69$sscb$::uuid, $sscb$ID.AM-08$sscb$, $sscb$Systems, hardware, software, services, and data are managed throughout their life cycles$sscb$, 47),
  ($sscb$121843ad-0ec9-5482-864e-8d54519d345f$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-01$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-01$sscb$, $sscb$Vulnerabilities in assets are identified, validated, and recorded$sscb$, 49),
  ($sscb$be60c3bb-74f0-5aec-9550-6a49036abde9$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-02$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-02$sscb$, $sscb$Cyber threat intelligence is received from information sharing forums and sources$sscb$, 50),
  ($sscb$93e4a052-9eb3-5a3c-a2b9-ba6a4d1e459e$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-03$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-03$sscb$, $sscb$Internal and external threats to the organization are identified and recorded$sscb$, 51),
  ($sscb$6d5bf5ae-b820-5e8e-976c-8a093210e50e$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-04$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-04$sscb$, $sscb$Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded$sscb$, 52),
  ($sscb$2fbc5254-9288-5c86-87d0-cbbca4f97d57$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-05$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-05$sscb$, $sscb$Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk and inform risk response prioritization$sscb$, 53),
  ($sscb$4edb3688-45b6-597e-a687-94fa5e55fc7b$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-06$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-06$sscb$, $sscb$Risk responses are chosen, prioritized, planned, tracked, and communicated$sscb$, 54),
  ($sscb$8a28d637-b6dc-5058-bab3-8e8c3536a049$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-07$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-07$sscb$, $sscb$Changes and exceptions are managed, assessed for risk impact, recorded, and tracked$sscb$, 55),
  ($sscb$48fc528d-d809-55e3-aa89-1d01b647312b$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-08$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-08$sscb$, $sscb$Processes for receiving, analyzing, and responding to vulnerability disclosures are established$sscb$, 56),
  ($sscb$8b593a40-b7f8-5b0f-9a4d-9fb8141d5a74$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-09$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-09$sscb$, $sscb$The authenticity and integrity of hardware and software are assessed prior to acquisition and use$sscb$, 57),
  ($sscb$b7ab7958-e29f-5697-90ed-d27c97c38c1a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.RA-10$sscb$, $sscb$2adf30b2-cee9-5388-bb6a-155b6c734280$sscb$::uuid, $sscb$ID.RA-10$sscb$, $sscb$Critical suppliers are assessed prior to acquisition$sscb$, 58),
  ($sscb$d868b8a4-9767-5afc-9cf7-1f10b2eb20e0$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.IM-01$sscb$, $sscb$2bf6a723-81fd-5b67-91ae-2b89e0d5e74b$sscb$::uuid, $sscb$ID.IM-01$sscb$, $sscb$Improvements are identified from evaluations$sscb$, 60),
  ($sscb$7848de31-a3ea-5074-88d7-7c5f1e169134$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.IM-02$sscb$, $sscb$2bf6a723-81fd-5b67-91ae-2b89e0d5e74b$sscb$::uuid, $sscb$ID.IM-02$sscb$, $sscb$Improvements are identified from security tests and exercises, including those done in coordination with suppliers and relevant third parties$sscb$, 61),
  ($sscb$cb55b140-0b5b-53c3-b2d0-c1b99db5700d$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.IM-03$sscb$, $sscb$2bf6a723-81fd-5b67-91ae-2b89e0d5e74b$sscb$::uuid, $sscb$ID.IM-03$sscb$, $sscb$Improvements are identified from execution of operational processes, procedures, and activities$sscb$, 62),
  ($sscb$139c7feb-5b54-5a40-a992-51b848f741b6$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$ID.IM-04$sscb$, $sscb$2bf6a723-81fd-5b67-91ae-2b89e0d5e74b$sscb$::uuid, $sscb$ID.IM-04$sscb$, $sscb$Incident response plans and other cybersecurity plans that affect operations are established, communicated, maintained, and improved$sscb$, 63),
  ($sscb$1f97fd0b-e362-57ad-896d-41445757ed03$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AA-01$sscb$, $sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$PR.AA-01$sscb$, $sscb$Identities and credentials for authorized users, services, and hardware are managed by the organization$sscb$, 66),
  ($sscb$be783620-59bd-57cb-8ec4-d97e02b68d54$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AA-02$sscb$, $sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$PR.AA-02$sscb$, $sscb$Identities are proofed and bound to credentials based on the context of interactions$sscb$, 67),
  ($sscb$3d50eb6a-2fe9-5136-9fee-317d577bb277$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AA-03$sscb$, $sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$PR.AA-03$sscb$, $sscb$Users, services, and hardware are authenticated$sscb$, 68),
  ($sscb$4d9b1265-e26c-5fda-afe6-369b57ee3f09$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AA-04$sscb$, $sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$PR.AA-04$sscb$, $sscb$Identity assertions are protected, conveyed, and verified$sscb$, 69),
  ($sscb$83b3e39f-738e-5137-bb79-d87602c96655$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AA-05$sscb$, $sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$PR.AA-05$sscb$, $sscb$Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties$sscb$, 70),
  ($sscb$3306c76d-ea3e-5897-9a5d-0f83679c1ca7$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AA-06$sscb$, $sscb$c5933d4b-d5f0-537d-9bc3-209d7aae6581$sscb$::uuid, $sscb$PR.AA-06$sscb$, $sscb$Physical access to assets is managed, monitored, and enforced commensurate with risk$sscb$, 71),
  ($sscb$d99bce10-6abc-5b8d-a305-ee512b9f95ba$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AT-01$sscb$, $sscb$0216f08e-621f-5cfa-b21e-d76601fe5060$sscb$::uuid, $sscb$PR.AT-01$sscb$, $sscb$Personnel are provided with awareness and training so that they possess the knowledge and skills to perform general tasks with cybersecurity risks in mind$sscb$, 73),
  ($sscb$0cbc9a3e-61e1-5faa-8f6e-76d187158aac$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.AT-02$sscb$, $sscb$0216f08e-621f-5cfa-b21e-d76601fe5060$sscb$::uuid, $sscb$PR.AT-02$sscb$, $sscb$Individuals in specialized roles are provided with awareness and training so that they possess the knowledge and skills to perform relevant tasks with cybersecurity risks in mind$sscb$, 74),
  ($sscb$94aa4b56-ec34-51a2-a06c-409a6a68951b$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.DS-01$sscb$, $sscb$63c7e5ec-4572-5d2f-9afa-0b0022f9ea1a$sscb$::uuid, $sscb$PR.DS-01$sscb$, $sscb$The confidentiality, integrity, and availability of data-at-rest are protected$sscb$, 76),
  ($sscb$1bee5273-2d49-5e7c-9108-acf0f6a5affa$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.DS-02$sscb$, $sscb$63c7e5ec-4572-5d2f-9afa-0b0022f9ea1a$sscb$::uuid, $sscb$PR.DS-02$sscb$, $sscb$The confidentiality, integrity, and availability of data-in-transit are protected$sscb$, 77),
  ($sscb$a29109d0-c004-51cb-9d0f-ca4d9f8efe7a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.DS-10$sscb$, $sscb$63c7e5ec-4572-5d2f-9afa-0b0022f9ea1a$sscb$::uuid, $sscb$PR.DS-10$sscb$, $sscb$The confidentiality, integrity, and availability of data-in-use are protected$sscb$, 78),
  ($sscb$36d7792d-48c6-5ca2-979c-598732bd56e8$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.DS-11$sscb$, $sscb$63c7e5ec-4572-5d2f-9afa-0b0022f9ea1a$sscb$::uuid, $sscb$PR.DS-11$sscb$, $sscb$Backups of data are created, protected, maintained, and tested$sscb$, 79),
  ($sscb$5894254a-a30a-5412-84da-049c7cae886e$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.PS-01$sscb$, $sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$PR.PS-01$sscb$, $sscb$Configuration management practices are established and applied$sscb$, 81),
  ($sscb$a22744c2-4908-5e81-882f-7b93638359dd$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.PS-02$sscb$, $sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$PR.PS-02$sscb$, $sscb$Software is maintained, replaced, and removed commensurate with risk$sscb$, 82),
  ($sscb$04177737-3b9a-50fb-ba8e-359d075ded56$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.PS-03$sscb$, $sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$PR.PS-03$sscb$, $sscb$Hardware is maintained, replaced, and removed commensurate with risk$sscb$, 83),
  ($sscb$3e1b0bc6-a785-51bb-9f2e-de4a4370a1c0$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.PS-04$sscb$, $sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$PR.PS-04$sscb$, $sscb$Log records are generated and made available for continuous monitoring$sscb$, 84),
  ($sscb$75d2a3f4-0544-579e-8c1b-667db53a8af7$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.PS-05$sscb$, $sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$PR.PS-05$sscb$, $sscb$Installation and execution of unauthorized software are prevented$sscb$, 85),
  ($sscb$66bfb88d-6c8f-55a0-9388-bba2b7fa2159$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.PS-06$sscb$, $sscb$f7c5c70d-8f60-5611-ab82-0826ba0d9a45$sscb$::uuid, $sscb$PR.PS-06$sscb$, $sscb$Secure software development practices are integrated, and their performance is monitored throughout the software development life cycle$sscb$, 86),
  ($sscb$b2d0ed53-4d6e-571f-b33b-7c3df171fc6c$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.IR-01$sscb$, $sscb$bbbcd250-a097-5038-9fc7-67066ea7003a$sscb$::uuid, $sscb$PR.IR-01$sscb$, $sscb$Networks and environments are protected from unauthorized logical access and usage$sscb$, 88),
  ($sscb$2b378f68-76d1-5b75-95ee-6c133427a0cf$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.IR-02$sscb$, $sscb$bbbcd250-a097-5038-9fc7-67066ea7003a$sscb$::uuid, $sscb$PR.IR-02$sscb$, $sscb$The organization's technology assets are protected from environmental threats$sscb$, 89),
  ($sscb$9b74d8a3-84b2-5c48-9904-4b79e998e567$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.IR-03$sscb$, $sscb$bbbcd250-a097-5038-9fc7-67066ea7003a$sscb$::uuid, $sscb$PR.IR-03$sscb$, $sscb$Mechanisms are implemented to achieve resilience requirements in normal and adverse situations$sscb$, 90),
  ($sscb$f444fdc5-48bb-5854-9dae-0cee0f10580d$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$PR.IR-04$sscb$, $sscb$bbbcd250-a097-5038-9fc7-67066ea7003a$sscb$::uuid, $sscb$PR.IR-04$sscb$, $sscb$Adequate resource capacity to ensure availability is maintained$sscb$, 91),
  ($sscb$e36f6f50-2e9a-53d0-afb7-2b1cd4872b74$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.CM-01$sscb$, $sscb$6a6eaa07-2230-5fae-9a84-d060bcb30dff$sscb$::uuid, $sscb$DE.CM-01$sscb$, $sscb$Networks and network services are monitored to find potentially adverse events$sscb$, 94),
  ($sscb$95019fef-5629-5ea1-b2b6-e9cf718532e6$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.CM-02$sscb$, $sscb$6a6eaa07-2230-5fae-9a84-d060bcb30dff$sscb$::uuid, $sscb$DE.CM-02$sscb$, $sscb$The physical environment is monitored to find potentially adverse events$sscb$, 95),
  ($sscb$da64a720-0cf0-5e0f-b773-fda7a18fddca$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.CM-03$sscb$, $sscb$6a6eaa07-2230-5fae-9a84-d060bcb30dff$sscb$::uuid, $sscb$DE.CM-03$sscb$, $sscb$Personnel activity and technology usage are monitored to find potentially adverse events$sscb$, 96),
  ($sscb$a40e0347-49bf-565f-9644-0d2561bc810e$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.CM-06$sscb$, $sscb$6a6eaa07-2230-5fae-9a84-d060bcb30dff$sscb$::uuid, $sscb$DE.CM-06$sscb$, $sscb$External service provider activities and services are monitored to find potentially adverse events$sscb$, 97),
  ($sscb$4ac493d9-a6c1-5e3c-b29a-5115ddabdec1$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.CM-09$sscb$, $sscb$6a6eaa07-2230-5fae-9a84-d060bcb30dff$sscb$::uuid, $sscb$DE.CM-09$sscb$, $sscb$Computing hardware and software, runtime environments, and their data are monitored to find potentially adverse events$sscb$, 98),
  ($sscb$776c67f9-578f-59bf-b2cb-b1cd7ea38895$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.AE-02$sscb$, $sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$DE.AE-02$sscb$, $sscb$Potentially adverse events are analyzed to better understand associated activities$sscb$, 100),
  ($sscb$b53e9037-4247-5cc7-9759-97984718e594$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.AE-03$sscb$, $sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$DE.AE-03$sscb$, $sscb$Information is correlated from multiple sources$sscb$, 101),
  ($sscb$f5e1b76c-7883-5e82-941e-f74be9d389b1$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.AE-04$sscb$, $sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$DE.AE-04$sscb$, $sscb$The estimated impact and scope of adverse events are understood$sscb$, 102),
  ($sscb$de2bdab6-c8ef-5d8b-b792-0653faa28b4a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.AE-06$sscb$, $sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$DE.AE-06$sscb$, $sscb$Information on adverse events is provided to authorized staff and tools$sscb$, 103),
  ($sscb$cacbc301-2307-5ece-9d76-645297f53928$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.AE-07$sscb$, $sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$DE.AE-07$sscb$, $sscb$Cyber threat intelligence and other contextual information are integrated into the analysis$sscb$, 104),
  ($sscb$5bc25b92-4481-5996-bb0e-d2638287cc8f$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$DE.AE-08$sscb$, $sscb$47dc25f8-ca01-5188-8725-98f4f0771937$sscb$::uuid, $sscb$DE.AE-08$sscb$, $sscb$Incidents are declared when adverse events meet the defined incident criteria$sscb$, 105),
  ($sscb$6f8a31f3-0851-5ef7-bf2a-e9858021b0bc$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MA-01$sscb$, $sscb$3a094c11-ed1e-50d4-b39b-10b874f81753$sscb$::uuid, $sscb$RS.MA-01$sscb$, $sscb$The incident response plan is executed in coordination with relevant third parties once an incident is declared$sscb$, 108),
  ($sscb$609bad0b-c2bc-5198-af0a-ad27743381c3$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MA-02$sscb$, $sscb$3a094c11-ed1e-50d4-b39b-10b874f81753$sscb$::uuid, $sscb$RS.MA-02$sscb$, $sscb$Incident reports are triaged and validated$sscb$, 109),
  ($sscb$20e23223-2155-5e13-8820-8d88e8840151$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MA-03$sscb$, $sscb$3a094c11-ed1e-50d4-b39b-10b874f81753$sscb$::uuid, $sscb$RS.MA-03$sscb$, $sscb$Incidents are categorized and prioritized$sscb$, 110),
  ($sscb$0fe79bf9-bbf2-5cc0-a5c9-52095b42e8b2$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MA-04$sscb$, $sscb$3a094c11-ed1e-50d4-b39b-10b874f81753$sscb$::uuid, $sscb$RS.MA-04$sscb$, $sscb$Incidents are escalated or elevated as needed$sscb$, 111),
  ($sscb$181a5a83-e3f3-5c36-b87e-0804faff9127$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MA-05$sscb$, $sscb$3a094c11-ed1e-50d4-b39b-10b874f81753$sscb$::uuid, $sscb$RS.MA-05$sscb$, $sscb$The criteria for initiating incident recovery are applied$sscb$, 112),
  ($sscb$032cefb5-3010-5abe-b8e6-122c4260d5e4$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.AN-03$sscb$, $sscb$fec33079-b0ef-5145-b03e-1560630b4e71$sscb$::uuid, $sscb$RS.AN-03$sscb$, $sscb$Analysis is performed to establish what has taken place during an incident and the root cause of the incident$sscb$, 114),
  ($sscb$ff2665cc-78ff-558a-9e48-45a0ad846774$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.AN-06$sscb$, $sscb$fec33079-b0ef-5145-b03e-1560630b4e71$sscb$::uuid, $sscb$RS.AN-06$sscb$, $sscb$Actions performed during an investigation are recorded, and the records' integrity and provenance are preserved$sscb$, 115),
  ($sscb$ff49b94a-6b57-5ef1-928d-6958a1d6fb5a$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.AN-07$sscb$, $sscb$fec33079-b0ef-5145-b03e-1560630b4e71$sscb$::uuid, $sscb$RS.AN-07$sscb$, $sscb$Incident data and metadata are collected, and their integrity and provenance are preserved$sscb$, 116),
  ($sscb$5e47369f-24da-51a8-b7ba-445a3882c734$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.AN-08$sscb$, $sscb$fec33079-b0ef-5145-b03e-1560630b4e71$sscb$::uuid, $sscb$RS.AN-08$sscb$, $sscb$An incident's magnitude is estimated and validated$sscb$, 117),
  ($sscb$49a3b0e1-25e9-514a-bedd-2029c22d2b2c$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.CO-02$sscb$, $sscb$8ceec8bb-b8c3-5e95-989d-06dee6fd35d5$sscb$::uuid, $sscb$RS.CO-02$sscb$, $sscb$Internal and external stakeholders are notified of incidents$sscb$, 119),
  ($sscb$ebe74f75-b292-51cb-8b36-6af2b2b52692$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.CO-03$sscb$, $sscb$8ceec8bb-b8c3-5e95-989d-06dee6fd35d5$sscb$::uuid, $sscb$RS.CO-03$sscb$, $sscb$Information is shared with designated internal and external stakeholders$sscb$, 120),
  ($sscb$d7d1da90-4de4-592f-a589-fc6122e70eb5$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MI-01$sscb$, $sscb$3f8c1ec9-bdcf-5bc6-b22a-36fd67087f4f$sscb$::uuid, $sscb$RS.MI-01$sscb$, $sscb$Incidents are contained$sscb$, 122),
  ($sscb$118e5ef1-07c7-51cb-88ff-75347f67ed2e$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RS.MI-02$sscb$, $sscb$3f8c1ec9-bdcf-5bc6-b22a-36fd67087f4f$sscb$::uuid, $sscb$RS.MI-02$sscb$, $sscb$Incidents are eradicated$sscb$, 123),
  ($sscb$8a06e820-2730-59c5-aeed-2f265eb84317$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.RP-01$sscb$, $sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$RC.RP-01$sscb$, $sscb$The recovery portion of the incident response plan is executed once initiated from the incident response process$sscb$, 126),
  ($sscb$d9e369e1-92e6-556f-9caa-4d205b377bf3$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.RP-02$sscb$, $sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$RC.RP-02$sscb$, $sscb$Recovery actions are selected, scoped, prioritized, and performed$sscb$, 127),
  ($sscb$663e6424-aa37-58e9-ab42-f5314973c725$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.RP-03$sscb$, $sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$RC.RP-03$sscb$, $sscb$The integrity of backups and other restoration assets is verified before using them for restoration$sscb$, 128),
  ($sscb$584a78fb-1a19-5842-b9d2-74009b7efa3d$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.RP-04$sscb$, $sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$RC.RP-04$sscb$, $sscb$Critical mission functions and cybersecurity risk management are considered to establish post-incident operational norms$sscb$, 129),
  ($sscb$e0d81abc-2c01-5385-8d7d-1ce898d394f5$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.RP-05$sscb$, $sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$RC.RP-05$sscb$, $sscb$The integrity of restored assets is verified, systems and services are restored, and normal operating status is confirmed$sscb$, 130),
  ($sscb$89a7f4e0-cf5b-52fc-af4c-38daa6b4404f$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.RP-06$sscb$, $sscb$e1d463fc-021e-5372-bcae-1378976fe51d$sscb$::uuid, $sscb$RC.RP-06$sscb$, $sscb$The end of incident recovery is declared based on criteria, and incident-related documentation is completed$sscb$, 131),
  ($sscb$3c6a04fb-0eeb-5800-aa3c-5d7cdb0c2a94$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.CO-03$sscb$, $sscb$48163add-cd9f-53f0-8dfd-aedcd9651008$sscb$::uuid, $sscb$RC.CO-03$sscb$, $sscb$Recovery activities and progress in restoring operational capabilities are communicated to designated internal and external stakeholders$sscb$, 133),
  ($sscb$08bf6a20-99f1-5538-9964-aa9167e4f3c0$sscb$::uuid, $sscb$024f2c3f-f4dd-5372-8c0a-893c132c5aef$sscb$::uuid, $sscb$subcategory$sscb$, $sscb$RC.CO-04$sscb$, $sscb$48163add-cd9f-53f0-8dfd-aedcd9651008$sscb$::uuid, $sscb$RC.CO-04$sscb$, $sscb$Public updates on incident recovery are shared using approved methods and messaging$sscb$, 134)
on conflict (framework_id, code) do update set
  element_type = excluded.element_type,
  parent_id = excluded.parent_id,
  title = excluded.title,
  statement = excluded.statement,
  sort_order = excluded.sort_order;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
) values
  (null, $sscb$outcome_coverage$sscb$, $sscb$full$sscb$, $sscb$Full$sscb$, $sscb$This service addresses the outcome, as assessed by this workspace. Full is not a certification and does not add partial credit from other services.$sscb$, null, 10, true),
  (null, $sscb$outcome_coverage$sscb$, $sscb$partial$sscb$, $sscb$Partial$sscb$, $sscb$This service addresses part of the outcome. Partial is not half of a full assessment and is not added into a percentage.$sscb$, null, 20, true),
  (null, $sscb$outcome_coverage$sscb$, $sscb$none$sscb$, $sscb$None$sscb$, $sscb$An assessor recorded that this service does not address the outcome. None is different from leaving the outcome unmapped.$sscb$, null, 30, true)
on conflict (field_key, code) where tenant_id is null do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.lookup_options (
  tenant_id, field_key, code, label, description, code_prefix, sort_order, is_active
)
select t.id, s.field_key, s.code, s.label, s.description, s.code_prefix, s.sort_order, s.is_active
from public.tenants t
join public.lookup_options s
  on s.tenant_id is null
 and s.field_key = 'outcome_coverage'
where not exists (
  select 1
  from public.lookup_options existing
  where existing.tenant_id = t.id
    and existing.field_key = s.field_key
    and existing.code = s.code
);
-- FRAMEWORK_SEED_END

update public.field_definitions
set help_text = 'Primary NIST CSF 2.0 function for this service. This dropdown is not an outcome assessment and does not count as coverage.'
where field_key = 'primary_csf_function'
  and help_text = 'Primary NIST CSF 2.0 function. Detailed control mapping comes in a later version.';
