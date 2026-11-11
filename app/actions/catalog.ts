"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, validateEmail } from "@/lib/auth/credentials";
import { isUuid } from "@/lib/auth/ids";
import { allows, membershipRole } from "@/lib/auth/permissions";
import { assertHttpUrl } from "@/lib/catalog/artifacts";
import { isIdentityField } from "@/lib/catalog/fields";
import type { ExportLogMeta } from "@/lib/catalog/export-plan";
import type { PlannedElement } from "@/lib/catalog/framework-import";
import { normalizeLogoInput } from "@/lib/catalog/logos";
import { normalizeWorkspaceName } from "@/lib/catalog/workspace-name";
import { uniqueSlug } from "@/lib/catalog/service-code";
import type {
  Artifact,
  ArtifactLink,
  ExportProfile,
  FieldDefinition,
  LookupOption,
  OutcomeMapping,
  Role,
  ServiceCodeMode,
  ServiceRecord,
} from "@/lib/catalog/types";
import {
  checkoutBlueprintRows,
  deleteArtifactLinkRow,
  deleteArtifactRow,
  deleteExportProfileRow,
  deleteOutcomeMappingRow,
  deleteServiceRow,
  importFrameworkRowsRemote,
  importLookupRows,
  insertLookup,
  logCatalogExport,
  persistArtifact,
  persistArtifactLink,
  persistCatalogColumns,
  persistExportProfile,
  persistField,
  persistLookup,
  persistOutcomeMapping,
  persistService,
  persistServiceArchived,
  persistTenantLogo,
  persistTenantMode,
} from "@/lib/data/remote";
import { assertLevel, createAuthedClient, loadOwnMemberships, runMutation } from "@/lib/server/guard";
import { fail, ok, type ActionResult } from "@/lib/server/result";

const MAX_PAYLOAD = 500_000;

function assertPayload(value: unknown): void {
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_PAYLOAD) throw new Error("That update is too large.");
}

function cleanService(service: ServiceRecord): ServiceRecord {
  assertPayload(service);
  if (!isUuid(service.id) || !isUuid(service.tenant_id)) throw new Error("That service is not valid.");
  return { ...service, intake_url: assertHttpUrl(service.intake_url) };
}

function cleanArtifact(artifact: Artifact): Artifact {
  assertPayload(artifact);
  if (!isUuid(artifact.id) || !isUuid(artifact.tenant_id)) throw new Error("That artifact is not valid.");
  const name = artifact.name.trim();
  if (name.length < 1 || name.length > 200) throw new Error("Enter an artifact name.");
  return { ...artifact, name, link_url: assertHttpUrl(artifact.link_url) };
}

async function tenantOf(supabase: SupabaseClient, table: string, id: string): Promise<string> {
  if (!isUuid(id)) throw new Error("That record is not valid.");
  const { data, error } = await supabase.from(table).select("tenant_id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const tenantId = data && typeof data.tenant_id === "string" ? data.tenant_id : "";
  if (!tenantId) throw new Error("That record is not in a workspace you can access.");
  return tenantId;
}

export async function createWorkspaceAction(name: string): Promise<ActionResult<{ id: string }>> {
  try {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) throw new Error("Enter a workspace name.");
    const { supabase, user } = await createAuthedClient();
    const memberships = await loadOwnMemberships(supabase, user.id);
    const canCreate = memberships.some((row) => row.role === "platform_owner" || row.role === "tenant_admin");
    if (!canCreate) throw new Error("Only an Admin can create a workspace.");
    const existing = await supabase.from("tenants").select("slug");
    if (existing.error) throw new Error(existing.error.message);
    const slug = uniqueSlug(
      trimmed,
      (existing.data ?? []).map((row) => String(row.slug)),
    );
    const { data, error } = await supabase.rpc("provision_tenant", { p_name: trimmed, p_slug: slug });
    if (error) throw new Error(error.message);
    if (typeof data !== "string" || !isUuid(data)) throw new Error("The workspace could not be created.");
    return ok({ id: data });
  } catch (error) {
    return fail(error);
  }
}

export async function inviteMemberAction(
  tenantId: string,
  email: string,
  role: Role,
): Promise<ActionResult<{ status: "member" | "invited" }>> {
  const emailError = validateEmail(email);
  if (emailError) return fail(new Error(emailError));
  if (role !== "tenant_admin" && role !== "editor" && role !== "viewer" && role !== "platform_owner") {
    return fail(new Error("Unknown role."));
  }
  return runMutation(tenantId, "admin", async (supabase, user) => {
    if (role === "platform_owner") {
      const memberships = await loadOwnMemberships(supabase, user.id);
      if (!allows(membershipRole(memberships, user.id, tenantId), "admin")) {
        throw new Error("You do not have permission for that workspace.");
      }
      if (membershipRole(memberships, user.id, tenantId) !== "platform_owner") {
        throw new Error("Only a platform owner can grant platform owner.");
      }
    }
    const { data, error } = await supabase.rpc("add_tenant_member", {
      p_tenant: tenantId,
      p_email: normalizeEmail(email),
      p_role: role,
    });
    if (error) throw new Error(error.message);
    const status = data && typeof data === "object" && "status" in data && data.status === "invited" ? "invited" : "member";
    return { status };
  });
}

export async function loadSampleCatalogAction(tenantId: string): Promise<ActionResult<null>> {
  return runMutation(tenantId, "admin", async (supabase) => {
    const { error } = await supabase.rpc("load_starter_sample_services", { p_tenant_id: tenantId });
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function saveServiceAction(service: ServiceRecord): Promise<ActionResult<null>> {
  let cleaned: ServiceRecord;
  try {
    cleaned = cleanService(service);
  } catch (error) {
    return fail(error);
  }
  return runMutation(cleaned.tenant_id, "write", async (supabase) => {
    await persistService(supabase, cleaned);
    return null;
  });
}

export async function archiveServiceAction(serviceId: string, archivedAt: string | null): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await createAuthedClient();
    const tenantId = await tenantOf(supabase, "services", serviceId);
    await assertLevel(supabase, user.id, tenantId, "write");
    if (archivedAt !== null && Number.isNaN(Date.parse(archivedAt))) throw new Error("That archive date is not valid.");
    await persistServiceArchived(supabase, serviceId, archivedAt);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteServiceAction(serviceId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await createAuthedClient();
    const tenantId = await tenantOf(supabase, "services", serviceId);
    await assertLevel(supabase, user.id, tenantId, "admin");
    await deleteServiceRow(supabase, serviceId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function saveArtifactAction(artifact: Artifact): Promise<ActionResult<null>> {
  let cleaned: Artifact;
  try {
    cleaned = cleanArtifact(artifact);
  } catch (error) {
    return fail(error);
  }
  return runMutation(cleaned.tenant_id, "write", async (supabase) => {
    await persistArtifact(supabase, cleaned);
    return null;
  });
}

export async function deleteArtifactAction(artifactId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await createAuthedClient();
    const tenantId = await tenantOf(supabase, "artifacts", artifactId);
    await assertLevel(supabase, user.id, tenantId, "admin");
    await deleteArtifactRow(supabase, artifactId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function saveArtifactLinkAction(link: ArtifactLink): Promise<ActionResult<null>> {
  try {
    assertPayload(link);
    if (!isUuid(link.id) || !isUuid(link.tenant_id) || !isUuid(link.artifact_id) || !isUuid(link.service_id)) {
      throw new Error("That link is not valid.");
    }
  } catch (error) {
    return fail(error);
  }
  return runMutation(link.tenant_id, "write", async (supabase) => {
    await persistArtifactLink(supabase, link);
    return null;
  });
}

export async function deleteArtifactLinkAction(linkId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await createAuthedClient();
    const tenantId = await tenantOf(supabase, "artifact_service_links", linkId);
    await assertLevel(supabase, user.id, tenantId, "write");
    await deleteArtifactLinkRow(supabase, linkId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function importArtifactsAction(tenantId: string, artifacts: Artifact[]): Promise<ActionResult<null>> {
  const cleaned: Artifact[] = [];
  try {
    if (artifacts.length > 500) throw new Error("Import at most 500 artifacts at a time.");
    for (const artifact of artifacts) {
      const next = cleanArtifact(artifact);
      if (next.tenant_id !== tenantId) throw new Error("That artifact belongs to another workspace.");
      cleaned.push(next);
    }
  } catch (error) {
    return fail(error);
  }
  return runMutation(tenantId, "write", async (supabase) => {
    for (const artifact of cleaned) await persistArtifact(supabase, artifact);
    return null;
  });
}

export async function saveLookupAction(option: LookupOption): Promise<ActionResult<null>> {
  if (!option.tenant_id) return fail(new Error("That lookup belongs to another workspace."));
  return runMutation(option.tenant_id, "admin", async (supabase) => {
    await persistLookup(supabase, option);
    return null;
  });
}

export async function insertLookupAction(option: LookupOption): Promise<ActionResult<null>> {
  if (!option.tenant_id || !isUuid(option.id)) return fail(new Error("That lookup is not valid."));
  return runMutation(option.tenant_id, "admin", async (supabase) => {
    await insertLookup(supabase, option);
    return null;
  });
}

export async function saveFieldAction(field: FieldDefinition): Promise<ActionResult<null>> {
  if (!field.tenant_id) return fail(new Error("That field belongs to another workspace."));
  if (isIdentityField(field.field_key) && field.is_active === false) {
    return fail(new Error("Service code and name stay active so every service remains identifiable."));
  }
  return runMutation(field.tenant_id, "admin", async (supabase) => {
    await persistField(supabase, field);
    return null;
  });
}

export async function saveFieldsAction(fields: FieldDefinition[]): Promise<ActionResult<null>> {
  if (fields.length === 0) return ok(null);
  const tenantId = fields[0]?.tenant_id;
  if (!tenantId || fields.some((field) => field.tenant_id !== tenantId)) {
    return fail(new Error("Those fields belong to another workspace."));
  }
  if (fields.some((field) => isIdentityField(field.field_key) && field.is_active === false)) {
    return fail(new Error("Service code and name stay active so every service remains identifiable."));
  }
  return runMutation(tenantId, "admin", async (supabase) => {
    for (const field of fields) await persistField(supabase, field);
    return null;
  });
}

export async function renameWorkspaceAction(tenantId: string, name: string): Promise<ActionResult<{ name: string }>> {
  let nextName: string;
  try {
    nextName = normalizeWorkspaceName(name);
  } catch (error) {
    return fail(error);
  }
  return runMutation(tenantId, "admin", async (supabase) => {
    const { data, error } = await supabase.rpc("rename_workspace", { p_tenant: tenantId, p_name: nextName });
    if (error) throw new Error(error.message);
    if (typeof data !== "string" || data.trim().length === 0) throw new Error("The workspace name could not be saved.");
    return { name: data };
  });
}

export async function setTenantLogoAction(tenantId: string, logoUrl: string | null): Promise<ActionResult<null>> {
  let normalized: string | null;
  try {
    normalized = normalizeLogoInput(logoUrl);
  } catch (error) {
    return fail(error);
  }
  return runMutation(tenantId, "admin", async (supabase) => {
    await persistTenantLogo(supabase, tenantId, normalized);
    return null;
  });
}

export async function setServiceCodeModeAction(tenantId: string, mode: ServiceCodeMode): Promise<ActionResult<null>> {
  if (mode !== "sequential" && mode !== "category_prefix") return fail(new Error("Unknown service ID style."));
  return runMutation(tenantId, "admin", async (supabase) => {
    await persistTenantMode(supabase, tenantId, mode);
    return null;
  });
}

export async function saveCatalogColumnsAction(tenantId: string, keys: string[]): Promise<ActionResult<null>> {
  if (!Array.isArray(keys) || keys.length > 80 || keys.some((key) => typeof key !== "string" || key.length > 80)) {
    return fail(new Error("Those columns are not valid."));
  }
  return runMutation(tenantId, "admin", async (supabase) => {
    await persistCatalogColumns(supabase, tenantId, keys);
    return null;
  });
}

export async function importLookupsAction(
  tenantId: string,
  fieldKey: string,
  rows: Array<{ code: string; label: string; description: string | null; code_prefix: string | null }>,
): Promise<ActionResult<{ created: number; updated: number }>> {
  if (!fieldKey.trim() || rows.length > 5000) return fail(new Error("That lookup import is not valid."));
  return runMutation(tenantId, "admin", async (supabase) => importLookupRows(supabase, tenantId, fieldKey, rows));
}

export async function checkoutBlueprintsAction(tenantId: string, rows: ServiceRecord[]): Promise<ActionResult<null>> {
  const cleaned: ServiceRecord[] = [];
  try {
    if (rows.length === 0 || rows.length > 200) throw new Error("Nothing in the cart matches a blueprint.");
    for (const row of rows) {
      const next = cleanService(row);
      if (next.tenant_id !== tenantId) throw new Error("That service belongs to another workspace.");
      cleaned.push(next);
    }
  } catch (error) {
    return fail(error);
  }
  return runMutation(tenantId, "write", async (supabase) => {
    await checkoutBlueprintRows(supabase, tenantId, cleaned);
    return null;
  });
}

export async function saveOutcomeMappingAction(mapping: OutcomeMapping): Promise<ActionResult<null>> {
  if (!isUuid(mapping.tenant_id) || !isUuid(mapping.service_id) || !isUuid(mapping.element_id)) {
    return fail(new Error("That assessment is not valid."));
  }
  if (mapping.coverage !== "full" && mapping.coverage !== "partial" && mapping.coverage !== "none") {
    return fail(new Error("Coverage must be full, partial, or none."));
  }
  return runMutation(mapping.tenant_id, "write", async (supabase) => {
    await persistOutcomeMapping(supabase, mapping);
    return null;
  });
}

export async function removeOutcomeMappingAction(mappingId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await createAuthedClient();
    const tenantId = await tenantOf(supabase, "service_outcome_mappings", mappingId);
    await assertLevel(supabase, user.id, tenantId, "write");
    await deleteOutcomeMappingRow(supabase, mappingId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function saveExportProfilesAction(profiles: ExportProfile[]): Promise<ActionResult<null>> {
  if (profiles.length === 0) return ok(null);
  const tenantId = profiles[0]?.tenant_id;
  if (!tenantId || profiles.some((profile) => profile.tenant_id !== tenantId)) {
    return fail(new Error("That profile belongs to another workspace."));
  }
  return runMutation(tenantId, "admin", async (supabase) => {
    for (const profile of profiles) await persistExportProfile(supabase, profile);
    return null;
  });
}

export async function deleteExportProfileAction(profileId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await createAuthedClient();
    const tenantId = await tenantOf(supabase, "export_profiles", profileId);
    await assertLevel(supabase, user.id, tenantId, "admin");
    await deleteExportProfileRow(supabase, profileId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function importFrameworkAction(
  tenantId: string,
  frameworkId: string,
  version: string,
  planned: PlannedElement[],
): Promise<ActionResult<null>> {
  if (!isUuid(frameworkId) || planned.length === 0 || planned.length > 5000) {
    return fail(new Error("That framework import is not valid."));
  }
  return runMutation(tenantId, "admin", async (supabase) => {
    await importFrameworkRowsRemote(supabase, tenantId, frameworkId, version, planned);
    return null;
  });
}

export async function recordExportAction(tenantId: string, meta: ExportLogMeta): Promise<ActionResult<null>> {
  return runMutation(tenantId, "read", async (supabase) => {
    await logCatalogExport(supabase, tenantId, meta);
    return null;
  });
}
