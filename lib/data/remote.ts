import type { SupabaseClient } from "@supabase/supabase-js";
import { parseColumnConfig } from "@/lib/catalog/columns";
import { withComputed } from "@/lib/catalog/service";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type {
  AuditEntry,
  FieldDefinition,
  LookupOption,
  Member,
  OutcomeMapping,
  Role,
  ServiceCodeMode,
  ServiceRecord,
  Tenant,
} from "@/lib/catalog/types";
import { emptyDb, type CatalogDb } from "@/lib/data/model";
import { readActiveTenantId } from "@/lib/data/storage";

export type Hydration = {
  db: CatalogDb;
  warning: string | null;
};

export async function hydrateFromSupabase(supabase: SupabaseClient): Promise<Hydration> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const user = userData.user;
  if (!user) return { db: emptyDb(), warning: null };

  const session = { userId: user.id, email: user.email ?? user.id };
  const ensured = await supabase.rpc("ensure_practitioner_access");
  if (ensured.error) {
    return { db: { ...emptyDb(), session }, warning: ensured.error.message };
  }

  const tenantQuery = await supabase.from("tenants").select("*").eq("is_active", true).order("name");
  if (tenantQuery.error) throw new Error(tenantQuery.error.message);
  const tenants = (tenantQuery.data ?? []).map(asTenant);
  const ids = tenants.map((tenant) => tenant.id);
  if (ids.length === 0) {
    return { db: { ...emptyDb(), session }, warning: null };
  }

  const [fields, lookups, services, members, audit, frameworks, elements, mappings] = await Promise.all([
    supabase.from("field_definitions").select("*").in("tenant_id", ids),
    supabase.from("lookup_options").select("*").in("tenant_id", ids),
    supabase.from("services").select("*").in("tenant_id", ids),
    supabase.rpc("list_visible_members"),
    supabase.from("audit_log").select("*").in("tenant_id", ids).order("created_at", { ascending: false }).limit(400),
    supabase.from("frameworks").select("*").eq("is_active", true),
    supabase.from("framework_elements").select("*").order("sort_order"),
    supabase.from("service_outcome_mappings").select("*").in("tenant_id", ids),
  ]);
  for (const result of [fields, lookups, services, frameworks, elements, mappings]) {
    if (result.error) throw new Error(result.error.message);
  }
  if (members.error) throw new Error(members.error.message);
  if (audit.error) throw new Error(audit.error.message);

  const preferred = readActiveTenantId();
  const activeTenantId = ids.includes(preferred ?? "") ? preferred : ids[0];

  return {
    db: {
      session,
      activeTenantId,
      tenants,
      members: ((members.data ?? []) as MemberRow[]).map(asMember),
      fields: (fields.data ?? []).map(asField),
      lookups: (lookups.data ?? []).map(asLookup),
      services: (services.data ?? []).map(asService),
      frameworks: (frameworks.data ?? []).map(asFramework),
      elements: (elements.data ?? []).map(asElement),
      mappings: (mappings.data ?? []).map(asMapping),
      audit: (audit.data ?? []).map(asAudit),
    },
    warning: null,
  };
}

export async function persistService(supabase: SupabaseClient, service: ServiceRecord): Promise<void> {
  const row = {
    id: service.id,
    tenant_id: service.tenant_id,
    service_code: service.service_code,
    name: service.name,
    internal_name: service.internal_name,
    category: service.category,
    status: service.status,
    service_tier: service.service_tier,
    summary: service.summary,
    description: service.description,
    in_scope: service.in_scope,
    out_of_scope: service.out_of_scope,
    deliverables: service.deliverables,
    prerequisites: service.prerequisites,
    owner_team: service.owner_team,
    delivery_team: service.delivery_team,
    business_unit: service.business_unit,
    service_owner: service.service_owner,
    delivery_model: service.delivery_model,
    target_audience: service.target_audience,
    intake_method: service.intake_method,
    intake_url: service.intake_url,
    approval_required: service.approval_required,
    approver: service.approver,
    lead_time: service.lead_time,
    support_contact: service.support_contact,
    hours_of_coverage: service.hours_of_coverage,
    sla_response_target: service.sla_response_target,
    sla_resolution_target: service.sla_resolution_target,
    primary_csf_function: service.primary_csf_function,
    capability_rating: service.capability_rating,
    threats_addressed: service.threats_addressed,
    data_classification_handled: service.data_classification_handled,
    kpis_and_metrics: service.kpis_and_metrics,
    current_maturity_cmmi: service.current_maturity_cmmi,
    target_maturity_cmmi: service.target_maturity_cmmi,
    known_gaps_or_risks: service.known_gaps_or_risks,
    third_party_providers: service.third_party_providers,
    cost_model: service.cost_model,
    cost_or_effort_notes: service.cost_or_effort_notes,
    current_tooling_notes: service.current_tooling_notes,
    internal_notes: service.internal_notes,
    review_cadence: service.review_cadence,
    last_reviewed_date: service.last_reviewed_date,
    archived_at: service.archived_at,
    custom_fields: service.custom_fields ?? {},
    created_at: service.created_at,
    created_by: service.created_by,
    updated_by: service.updated_by,
  };
  const { error } = await supabase.from("services").upsert(row);
  if (error) throw new Error(error.message);
}

export async function persistLookup(supabase: SupabaseClient, option: LookupOption): Promise<void> {
  const { error } = await supabase
    .from("lookup_options")
    .update({
      label: option.label,
      description: option.description,
      code_prefix: option.code_prefix,
      sort_order: option.sort_order,
      is_active: option.is_active,
    })
    .eq("id", option.id);
  if (error) throw new Error(error.message);
}

export async function insertLookup(supabase: SupabaseClient, option: LookupOption): Promise<void> {
  const { error } = await supabase.from("lookup_options").insert({
    id: option.id,
    tenant_id: option.tenant_id,
    field_key: option.field_key,
    code: option.code,
    label: option.label,
    description: option.description,
    code_prefix: option.code_prefix,
    sort_order: option.sort_order,
    is_active: option.is_active,
  });
  if (error) throw new Error(error.message);
}

export async function persistField(supabase: SupabaseClient, field: FieldDefinition): Promise<void> {
  const { error } = await supabase
    .from("field_definitions")
    .update({
      label: field.label,
      help_text: field.help_text,
      visibility: field.visibility,
      depth_level: field.depth_level,
      is_required: field.is_required,
      is_active: field.is_active,
      sort_order: field.sort_order,
    })
    .eq("id", field.id);
  if (error) throw new Error(error.message);
}

export async function persistTenantMode(
  supabase: SupabaseClient,
  tenantId: string,
  mode: ServiceCodeMode,
): Promise<void> {
  const { error } = await supabase.from("tenants").update({ service_code_mode: mode }).eq("id", tenantId);
  if (error) throw new Error(error.message);
}

export async function persistTenantLogo(
  supabase: SupabaseClient,
  tenantId: string,
  logoUrl: string | null,
): Promise<void> {
  const { error } = await supabase.from("tenants").update({ logo_url: logoUrl }).eq("id", tenantId);
  if (error) throw new Error(error.message);
}

export async function persistServiceArchived(
  supabase: SupabaseClient,
  serviceId: string,
  archivedAt: string | null,
): Promise<void> {
  const { error } = await supabase.from("services").update({ archived_at: archivedAt }).eq("id", serviceId);
  if (error) throw new Error(error.message);
}

export async function persistCatalogColumns(
  supabase: SupabaseClient,
  tenantId: string,
  keys: string[],
): Promise<void> {
  const { error } = await supabase.from("tenants").update({ catalog_columns: { keys } }).eq("id", tenantId);
  if (error) throw new Error(error.message);
}

export async function importLookupRows(
  supabase: SupabaseClient,
  tenantId: string,
  fieldKey: string,
  rows: Array<{ code: string; label: string; description: string | null; code_prefix: string | null }>,
): Promise<{ created: number; updated: number }> {
  const { data, error } = await supabase.rpc("import_lookup_options", {
    p_tenant: tenantId,
    p_field_key: fieldKey,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as { created?: number; updated?: number };
  return { created: Number(payload.created ?? 0), updated: Number(payload.updated ?? 0) };
}

export async function checkoutBlueprintRows(supabase: SupabaseClient, tenantId: string, rows: ServiceRecord[]): Promise<number> {
  const payload = rows.map((service) => ({
    id: service.id,
    service_code: service.service_code,
    name: service.name,
    internal_name: service.internal_name,
    category: service.category,
    status: service.status,
    service_tier: service.service_tier,
    summary: service.summary,
    description: service.description,
    in_scope: service.in_scope,
    out_of_scope: service.out_of_scope,
    deliverables: service.deliverables,
    prerequisites: service.prerequisites,
    owner_team: service.owner_team,
    delivery_team: service.delivery_team,
    business_unit: service.business_unit,
    service_owner: service.service_owner,
    delivery_model: service.delivery_model,
    target_audience: service.target_audience,
    intake_method: service.intake_method,
    intake_url: service.intake_url,
    approval_required: service.approval_required,
    approver: service.approver,
    lead_time: service.lead_time,
    support_contact: service.support_contact,
    hours_of_coverage: service.hours_of_coverage,
    sla_response_target: service.sla_response_target,
    sla_resolution_target: service.sla_resolution_target,
    primary_csf_function: service.primary_csf_function,
    capability_rating: service.capability_rating,
    threats_addressed: service.threats_addressed,
    data_classification_handled: service.data_classification_handled,
    kpis_and_metrics: service.kpis_and_metrics,
    current_maturity_cmmi: service.current_maturity_cmmi,
    target_maturity_cmmi: service.target_maturity_cmmi,
    known_gaps_or_risks: service.known_gaps_or_risks,
    third_party_providers: service.third_party_providers,
    cost_model: service.cost_model,
    cost_or_effort_notes: service.cost_or_effort_notes,
    current_tooling_notes: service.current_tooling_notes,
    internal_notes: service.internal_notes,
    review_cadence: service.review_cadence,
    last_reviewed_date: service.last_reviewed_date,
    custom_fields: service.custom_fields ?? {},
  }));
  const { data, error } = await supabase.rpc("checkout_blueprint_services", {
    p_tenant: tenantId,
    p_rows: payload,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { count?: number };
  return Number(result.count ?? rows.length);
}

export async function deleteServiceRow(supabase: SupabaseClient, serviceId: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) throw new Error(error.message);
}

export async function persistOutcomeMapping(supabase: SupabaseClient, mapping: OutcomeMapping): Promise<void> {
  const { error } = await supabase.from("service_outcome_mappings").upsert(
    {
      id: mapping.id,
      tenant_id: mapping.tenant_id,
      service_id: mapping.service_id,
      element_id: mapping.element_id,
      coverage: mapping.coverage,
      rationale: mapping.rationale,
      notes: mapping.notes,
    },
    { onConflict: "service_id,element_id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteOutcomeMappingRow(supabase: SupabaseClient, mappingId: string): Promise<void> {
  const { error } = await supabase.from("service_outcome_mappings").delete().eq("id", mappingId);
  if (error) throw new Error(error.message);
}

function asFramework(row: Record<string, unknown>): FrameworkRelease {
  return {
    id: String(row.id),
    code: String(row.code),
    version: String(row.version),
    name: String(row.name),
    published_on: String(row.published_on ?? ""),
    publication: String(row.publication ?? ""),
    publication_url: String(row.publication_url ?? ""),
    source_title: String(row.source_title ?? ""),
    source_tool: String(row.source_tool ?? ""),
    source_url: String(row.source_url ?? ""),
    reference_tool_url: String(row.reference_tool_url ?? ""),
    retrieved_on: String(row.retrieved_on ?? ""),
    export_change_log: String(row.export_change_log ?? ""),
    export_generated_at: String(row.export_generated_at ?? ""),
    export_sha256: String(row.export_sha256 ?? ""),
    content_sha256: String(row.content_sha256 ?? ""),
    id_namespace: String(row.id_namespace ?? ""),
    excluded_withdrawn_rows: Number(row.excluded_withdrawn_rows ?? 0),
    provenance: String(row.provenance ?? ""),
    is_active: row.is_active !== false,
  };
}

function asElement(row: Record<string, unknown>): FrameworkElement {
  const elementType = row.element_type === "function" || row.element_type === "category" ? row.element_type : "subcategory";
  return {
    id: String(row.id),
    framework_id: String(row.framework_id),
    element_type: elementType,
    code: String(row.code),
    parent_id: row.parent_id == null ? null : String(row.parent_id),
    title: String(row.title ?? ""),
    statement: String(row.statement ?? ""),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function asMapping(row: Record<string, unknown>): OutcomeMapping {
  const coverage = row.coverage === "full" || row.coverage === "partial" || row.coverage === "none" ? row.coverage : "none";
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    service_id: String(row.service_id),
    element_id: String(row.element_id),
    coverage,
    rationale: textOrNull(row.rationale),
    notes: textOrNull(row.notes),
    created_by: textOrNull(row.created_by),
    updated_by: textOrNull(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asTenant(row: Record<string, unknown>): Tenant {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    service_code_mode: row.service_code_mode === "category_prefix" ? "category_prefix" : "sequential",
    logo_url: typeof row.logo_url === "string" && row.logo_url.trim() ? row.logo_url : null,
    catalog_columns: parseColumnConfig(row.catalog_columns),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asField(row: Record<string, unknown>): FieldDefinition {
  return {
    id: String(row.id),
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
    field_key: String(row.field_key),
    label: String(row.label),
    help_text: String(row.help_text ?? ""),
    input_type: row.input_type as FieldDefinition["input_type"],
    lookup_field_key: row.lookup_field_key == null ? null : String(row.lookup_field_key),
    is_required: Boolean(row.is_required),
    visibility: row.visibility === "internal" ? "internal" : "public",
    depth_level: Number(row.depth_level) as FieldDefinition["depth_level"],
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
    is_standard: Boolean(row.is_standard),
  };
}

function asLookup(row: Record<string, unknown>): LookupOption {
  return {
    id: String(row.id),
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
    field_key: String(row.field_key),
    code: String(row.code),
    label: String(row.label),
    description: row.description == null ? null : String(row.description),
    code_prefix: row.code_prefix == null ? null : String(row.code_prefix),
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
  };
}

function asService(row: Record<string, unknown>): ServiceRecord {
  const audience = Array.isArray(row.target_audience) ? row.target_audience.map(String) : [];
  return withComputed({
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    service_code: String(row.service_code ?? ""),
    name: String(row.name ?? ""),
    internal_name: textOrNull(row.internal_name),
    category: textOrNull(row.category),
    status: textOrNull(row.status),
    service_tier: textOrNull(row.service_tier),
    summary: String(row.summary ?? ""),
    description: textOrNull(row.description),
    in_scope: textOrNull(row.in_scope),
    out_of_scope: textOrNull(row.out_of_scope),
    deliverables: textOrNull(row.deliverables),
    prerequisites: textOrNull(row.prerequisites),
    owner_team: textOrNull(row.owner_team),
    delivery_team: textOrNull(row.delivery_team),
    business_unit: textOrNull(row.business_unit),
    service_owner: textOrNull(row.service_owner),
    delivery_model: textOrNull(row.delivery_model),
    target_audience: audience,
    intake_method: textOrNull(row.intake_method),
    intake_url: textOrNull(row.intake_url),
    approval_required: Boolean(row.approval_required),
    approver: textOrNull(row.approver),
    lead_time: textOrNull(row.lead_time),
    support_contact: textOrNull(row.support_contact),
    hours_of_coverage: textOrNull(row.hours_of_coverage),
    sla_response_target: textOrNull(row.sla_response_target),
    sla_resolution_target: textOrNull(row.sla_resolution_target),
    primary_csf_function: textOrNull(row.primary_csf_function),
    capability_rating: textOrNull(row.capability_rating),
    threats_addressed: textOrNull(row.threats_addressed),
    data_classification_handled: textOrNull(row.data_classification_handled),
    kpis_and_metrics: textOrNull(row.kpis_and_metrics),
    current_maturity_cmmi: asInt(row.current_maturity_cmmi),
    target_maturity_cmmi: asInt(row.target_maturity_cmmi),
    maturity_gap: asInt(row.maturity_gap),
    known_gaps_or_risks: textOrNull(row.known_gaps_or_risks),
    third_party_providers: textOrNull(row.third_party_providers),
    cost_model: textOrNull(row.cost_model),
    cost_or_effort_notes: textOrNull(row.cost_or_effort_notes),
    current_tooling_notes: textOrNull(row.current_tooling_notes),
    internal_notes: textOrNull(row.internal_notes),
    review_cadence: textOrNull(row.review_cadence),
    last_reviewed_date: textOrNull(row.last_reviewed_date),
    next_review_date: textOrNull(row.next_review_date),
    archived_at: textOrNull(row.archived_at),
    custom_fields:
      row.custom_fields && typeof row.custom_fields === "object" && !Array.isArray(row.custom_fields)
        ? (row.custom_fields as Record<string, unknown>)
        : {},
    created_by: textOrNull(row.created_by),
    updated_by: textOrNull(row.updated_by),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  });
}

type MemberRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string | null;
  role: Role;
  created_at: string;
};

function asMember(row: MemberRow): Member {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    email: row.email ?? row.user_id,
    role: row.role,
    created_at: row.created_at,
  };
}

function asAudit(row: Record<string, unknown>): AuditEntry {
  const action = row.action === "delete" || row.action === "update" ? row.action : "insert";
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    actor_user_id: row.actor_user_id == null ? null : String(row.actor_user_id),
    actor_label: String(row.actor_label ?? "Unknown"),
    table_name: String(row.table_name),
    row_id: String(row.row_id),
    action,
    before_data: asJson(row.before_data),
    after_data: asJson(row.after_data),
    created_at: String(row.created_at),
  };
}

function asJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.length === 0 ? null : text;
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
