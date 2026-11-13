import type { SupabaseClient, User } from "@supabase/supabase-js";
import { accountProfileFromMetadata, type AccountProfile } from "@/lib/auth/profile";
import { parseColumnConfig } from "@/lib/catalog/columns";
import { withArtifactComputed } from "@/lib/catalog/artifacts";
import { withComputed } from "@/lib/catalog/service";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type {
  Artifact,
  ArtifactLink,
  AuditEntry,
  ExportProfile,
  FieldDefinition,
  Invitation,
  LookupOption,
  Member,
  OutcomeMapping,
  OwnerHistoryEntry,
  ServiceOwner,
  Role,
  ServiceCodeMode,
  ServiceRecord,
  Tenant,
  Visibility,
} from "@/lib/catalog/types";
import type { ExportLogMeta } from "@/lib/catalog/export-plan";
import type { PlannedElement } from "@/lib/catalog/framework-import";
import { emptyDb, type CatalogDb } from "@/lib/data/model";
import { readActiveTenantId } from "@/lib/data/storage";

export type Hydration = {
  db: CatalogDb;
  invitations: Invitation[];
  owners: ServiceOwner[];
  ownerHistory: OwnerHistoryEntry[];
  ownersReady: boolean;
  warning: string | null;
};

export async function hydrateFromSupabase(supabase: SupabaseClient): Promise<Hydration> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const user = userData.user;
  if (!user) return { db: emptyDb(), invitations: [], owners: [], ownerHistory: [], ownersReady: false, warning: null };

  const profile = await loadSessionProfile(supabase, user);
  const session = {
    userId: user.id,
    email: user.email ?? user.id,
    firstName: profile?.firstName ?? null,
    lastName: profile?.lastName ?? null,
    company: profile?.company ?? null,
  };
  const ensured = await supabase.rpc("ensure_practitioner_access");
  if (ensured.error) {
    return { db: { ...emptyDb(), session }, invitations: [], owners: [], ownerHistory: [], ownersReady: false, warning: ensured.error.message };
  }

  const tenantQuery = await supabase.from("tenants").select("*").eq("is_active", true).order("name");
  if (tenantQuery.error) throw new Error(tenantQuery.error.message);
  const tenants = (tenantQuery.data ?? []).map(asTenant);
  const ids = tenants.map((tenant) => tenant.id);
  if (ids.length === 0) {
    return { db: { ...emptyDb(), session }, invitations: [], owners: [], ownerHistory: [], ownersReady: false, warning: null };
  }

  const [fields, lookups, services, members, audit, frameworks, elements, mappings, profiles, artifacts, artifactLinks, invitationsQuery, ownersQuery, historyQuery] = await Promise.all([
    supabase.from("field_definitions").select("*").in("tenant_id", ids),
    supabase.from("lookup_options").select("*").in("tenant_id", ids),
    supabase.from("services").select("*").in("tenant_id", ids),
    supabase.rpc("list_visible_members"),
    supabase.from("audit_log").select("*").in("tenant_id", ids).order("created_at", { ascending: false }).limit(400),
    supabase.from("frameworks").select("*").eq("is_active", true),
    supabase.from("framework_elements").select("*").order("sort_order"),
    supabase.from("service_outcome_mappings").select("*").in("tenant_id", ids),
    supabase.from("export_profiles").select("*").in("tenant_id", ids),
    supabase.from("artifacts").select("*").in("tenant_id", ids).order("name"),
    supabase.from("artifact_service_links").select("*").in("tenant_id", ids),
    supabase
      .from("workspace_invitations")
      .select("id, tenant_id, email, role, created_at, expires_at, cancelled_at")
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .in("tenant_id", ids),
    supabase.from("service_owners").select("*").in("tenant_id", ids),
    supabase.from("service_owner_history").select("*").in("tenant_id", ids).order("created_at", { ascending: false }).limit(400),
  ]);
  for (const result of [fields, lookups, services, frameworks, elements, mappings, profiles, artifacts, artifactLinks]) {
    if (result.error) throw new Error(result.error.message);
  }
  if (members.error) throw new Error(members.error.message);
  if (audit.error) throw new Error(audit.error.message);
  let invitationRows: { data: InvitationRow[] | null; error: { message: string } | null } = invitationsQuery;
  if (invitationRows.error && /expires_at|cancelled_at|schema cache|column/i.test(invitationRows.error.message)) {
    invitationRows = await supabase
      .from("workspace_invitations")
      .select("id, tenant_id, email, role, created_at")
      .is("accepted_at", null)
      .in("tenant_id", ids);
  }
  const invitations =
    invitationRows.error && /workspace_invitations|schema cache|does not exist/i.test(invitationRows.error.message)
      ? []
      : ((invitationRows.data ?? []) as InvitationRow[]).map(asInvitation);
  if (invitationRows.error && invitations.length === 0 && !/workspace_invitations|schema cache|does not exist/i.test(invitationRows.error.message)) {
    throw new Error(invitationRows.error.message);
  }
  const ownersReady = !ownersQuery.error;
  const owners = ownersReady ? ((ownersQuery.data ?? []) as Record<string, unknown>[]).map(asOwner) : [];
  const ownerHistory =
    historyQuery.error && /service_owner_history|schema cache|does not exist/i.test(historyQuery.error.message)
      ? []
      : ((historyQuery.data ?? []) as Record<string, unknown>[]).map(asOwnerHistory);
  if (ownersQuery.error && !/service_owners|schema cache|does not exist/i.test(ownersQuery.error.message)) {
    throw new Error(ownersQuery.error.message);
  }
  if (historyQuery.error && ownerHistory.length === 0 && !/service_owner_history|schema cache|does not exist/i.test(historyQuery.error.message)) {
    throw new Error(historyQuery.error.message);
  }

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
      artifacts: (artifacts.data ?? []).map(asArtifact),
      artifactLinks: (artifactLinks.data ?? []).map(asArtifactLink),
      frameworks: (frameworks.data ?? []).map(asFramework),
      elements: (elements.data ?? []).map(asElement),
      mappings: (mappings.data ?? []).map(asMapping),
      exportProfiles: (profiles.data ?? []).map(asExportProfile),
      audit: (audit.data ?? []).map(asAudit),
    },
    invitations,
    owners,
    ownerHistory,
    ownersReady,
    warning: ownersReady ? null : "Service Owner directory is waiting for the database update. Free-text owners stay as they are until that migration is applied.",
  };
}

export function isMissingUserProfilesError(message: string): boolean {
  return /user_profiles|schema cache|does not exist/i.test(message);
}

/** Read this account's profile. Copy signup metadata once when the row is still missing. */
export async function loadSessionProfile(supabase: SupabaseClient, user: User): Promise<AccountProfile | null> {
  const query = await supabase
    .from("user_profiles")
    .select("first_name, last_name, company")
    .eq("user_id", user.id)
    .maybeSingle();
  if (query.error) {
    if (isMissingUserProfilesError(query.error.message)) return accountProfileFromMetadata(user.user_metadata);
    throw new Error(query.error.message);
  }
  if (query.data) {
    return {
      firstName: textOrEmpty(query.data.first_name),
      lastName: textOrEmpty(query.data.last_name),
      company: textOrEmpty(query.data.company),
    };
  }

  const fromMetadata = accountProfileFromMetadata(user.user_metadata);
  if (!fromMetadata) return null;
  const saved = await supabase.from("user_profiles").upsert({
    user_id: user.id,
    first_name: fromMetadata.firstName,
    last_name: fromMetadata.lastName,
    company: fromMetadata.company,
    updated_at: new Date().toISOString(),
  });
  if (saved.error && !isMissingUserProfilesError(saved.error.message)) throw new Error(saved.error.message);
  return fromMetadata;
}

export async function persistUserProfile(supabase: SupabaseClient, userId: string, profile: AccountProfile): Promise<void> {
  const { error } = await supabase.from("user_profiles").upsert({
    user_id: userId,
    first_name: profile.firstName,
    last_name: profile.lastName,
    company: profile.company,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
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
    owner_id: service.owner_id ?? null,
    owner_needed: Boolean(service.owner_needed),
    owner_review: service.owner_review ?? null,
    custom_fields: service.custom_fields ?? {},
    created_at: service.created_at,
    created_by: service.created_by,
    updated_by: service.updated_by,
  };
  const { error } = await supabase.from("services").upsert(row);
  if (error && /owner_id|owner_needed|owner_review|schema cache/i.test(error.message)) {
    const { owner_id, owner_needed, owner_review, ...legacy } = row;
    void owner_id;
    void owner_needed;
    void owner_review;
    const retry = await supabase.from("services").upsert(legacy);
    if (retry.error) throw new Error(retry.error.message);
    return;
  }
  if (error) throw new Error(error.message);
}

export async function persistArtifact(supabase: SupabaseClient, artifact: Artifact): Promise<void> {
  const row = {
    id: artifact.id,
    tenant_id: artifact.tenant_id,
    name: artifact.name,
    artifact_type: artifact.artifact_type,
    owner_team: artifact.owner_team,
    status: artifact.status,
    version: artifact.version,
    review_cadence: artifact.review_cadence,
    last_reviewed_date: artifact.last_reviewed_date,
    link_url: artifact.link_url,
    description: artifact.description,
    visibility: artifact.visibility,
    created_at: artifact.created_at,
    created_by: artifact.created_by,
    updated_by: artifact.updated_by,
  };
  const { error } = await supabase.from("artifacts").upsert(row);
  if (error) throw new Error(error.message);
}

export async function deleteArtifactRow(supabase: SupabaseClient, artifactId: string): Promise<void> {
  const { error } = await supabase.from("artifacts").delete().eq("id", artifactId);
  if (error) throw new Error(error.message);
}

export async function persistArtifactLink(supabase: SupabaseClient, link: ArtifactLink): Promise<void> {
  const { error } = await supabase.from("artifact_service_links").upsert({
    id: link.id,
    tenant_id: link.tenant_id,
    artifact_id: link.artifact_id,
    service_id: link.service_id,
    relationship_note: link.relationship_note,
    created_by: link.created_by,
    created_at: link.created_at,
  });
  if (error) throw new Error(error.message);
}

export async function deleteArtifactLinkRow(supabase: SupabaseClient, linkId: string): Promise<void> {
  const { error } = await supabase.from("artifact_service_links").delete().eq("id", linkId);
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
      input_type: field.input_type,
      lookup_field_key: field.lookup_field_key,
      lookup_bound: field.lookup_bound,
      lookup_restore: field.lookup_restore,
      visibility_overridden: field.visibility_overridden,
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

export async function persistExportProfile(supabase: SupabaseClient, profile: ExportProfile): Promise<void> {
  const { error } = await supabase.from("export_profiles").upsert(
    {
      id: profile.id,
      tenant_id: profile.tenant_id,
      name: profile.name,
      audience: profile.audience,
      field_keys: profile.field_keys,
      is_default: profile.is_default,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteExportProfileRow(supabase: SupabaseClient, profileId: string): Promise<void> {
  const { error } = await supabase.from("export_profiles").delete().eq("id", profileId);
  if (error) throw new Error(error.message);
}

export async function logCatalogExport(supabase: SupabaseClient, tenantId: string, meta: ExportLogMeta): Promise<void> {
  const { error } = await supabase.rpc("log_catalog_export", { p_tenant: tenantId, p_meta: meta });
  if (error) throw new Error(error.message);
}

export async function importFrameworkRowsRemote(
  supabase: SupabaseClient,
  tenantId: string,
  frameworkId: string,
  version: string,
  rows: PlannedElement[],
): Promise<void> {
  const payload = rows.map((row) => ({
    code: row.code,
    parent_code: row.parentCode,
    title: row.title,
    statement: row.statement,
    element_type: row.elementType,
    sort_order: row.sortOrder,
    version,
  }));
  const { error } = await supabase.rpc("import_framework_elements", {
    p_tenant: tenantId,
    p_framework: frameworkId,
    p_rows: payload,
  });
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
    content_state: row.content_state === "seeded" || String(row.code) === "NIST-CSF" ? "seeded" : "not_loaded",
    license_note: String(row.license_note ?? ""),
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
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
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
    distribution_public: textOrNull(row.distribution_public),
    distribution_internal: textOrNull(row.distribution_internal),
    default_export_format: exportFormat(row.default_export_format),
    default_export_profile_id: textOrNull(row.default_export_profile_id),
    owner_reminder_enabled: row.owner_reminder_enabled === true,
    owner_reminder_seen_at: textOrNull(row.owner_reminder_seen_at),
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
    lookup_bound: row.lookup_bound === true,
    lookup_restore: row.lookup_restore === "dropdown" ? "dropdown" : null,
    visibility_overridden: row.visibility_overridden === true,
    is_required: Boolean(row.is_required),
    visibility: row.visibility === "internal" ? "internal" : "public",
    depth_level: Number(row.depth_level) as FieldDefinition["depth_level"],
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
    is_standard: Boolean(row.is_standard),
    field_group: row.field_group === "geography" || row.field_group === "privacy" ? row.field_group : null,
  };
}

function asExportProfile(row: Record<string, unknown>): ExportProfile {
  const keys = Array.isArray(row.field_keys) ? row.field_keys.map(String) : [];
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name ?? ""),
    audience: row.audience === "internal" ? "internal" : "public",
    field_keys: keys,
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
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
    owner_id: textOrNull(row.owner_id),
    owner_needed: row.owner_needed === true,
    owner_review: textOrNull(row.owner_review),
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

function asArtifact(row: Record<string, unknown>): Artifact {
  const visibility: Visibility = row.visibility === "public" ? "public" : "internal";
  return withArtifactComputed({
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name ?? ""),
    artifact_type: String(row.artifact_type ?? ""),
    owner_team: textOrNull(row.owner_team),
    status: textOrNull(row.status),
    version: textOrNull(row.version),
    review_cadence: textOrNull(row.review_cadence),
    last_reviewed_date: textOrNull(row.last_reviewed_date),
    next_review_date: textOrNull(row.next_review_date),
    link_url: textOrNull(row.link_url),
    description: textOrNull(row.description),
    visibility,
    created_by: textOrNull(row.created_by),
    updated_by: textOrNull(row.updated_by),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  });
}

function asArtifactLink(row: Record<string, unknown>): ArtifactLink {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    artifact_id: String(row.artifact_id),
    service_id: String(row.service_id),
    relationship_note: textOrNull(row.relationship_note),
    created_by: textOrNull(row.created_by),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

type MemberRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string | null;
  role: Role;
  created_at: string;
};

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: Role;
  created_at: string;
};

function asInvitation(row: InvitationRow & { expires_at?: string | null; cancelled_at?: string | null }): Invitation {
  const role: Role =
    row.role === "platform_owner" ||
    row.role === "tenant_admin" ||
    row.role === "editor" ||
    row.role === "viewer" ||
    row.role === "service_manager"
      ? row.role
      : "viewer";
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    email: row.email,
    role,
    created_at: row.created_at,
    expires_at: row.expires_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
  };
}

function asMember(row: MemberRow & { first_name?: string | null; last_name?: string | null; deactivated_at?: string | null }): Member {
  const role: Role =
    row.role === "platform_owner" ||
    row.role === "tenant_admin" ||
    row.role === "editor" ||
    row.role === "viewer" ||
    row.role === "service_manager"
      ? row.role
      : "viewer";
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    email: row.email ?? row.user_id,
    role,
    created_at: row.created_at,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    deactivated_at: row.deactivated_at ?? null,
  };
}

function asOwner(row: Record<string, unknown>): ServiceOwner {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    email: textOrNull(row.email),
    title: textOrNull(row.title),
    team_code: textOrNull(row.team_code),
    is_active: row.is_active !== false,
    user_id: textOrNull(row.user_id),
    deactivated_user: row.deactivated_user === true,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asOwnerHistory(row: Record<string, unknown>): OwnerHistoryEntry {
  const reason = row.reason;
  const known = reason === "archive" || reason === "reassign" || reason === "import" || reason === "edit" || reason === "reconcile";
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    service_id: textOrNull(row.service_id),
    actor_user_id: textOrNull(row.actor_user_id),
    old_owner_id: textOrNull(row.old_owner_id),
    new_owner_id: textOrNull(row.new_owner_id),
    reason: known ? reason : "edit",
    note: textOrNull(row.note),
    created_at: String(row.created_at ?? ""),
  };
}

function exportFormat(value: unknown): Tenant["default_export_format"] {
  if (value === "csv" || value === "xlsx" || value === "docx" || value === "pdf" || value === "json") return value;
  return null;
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
