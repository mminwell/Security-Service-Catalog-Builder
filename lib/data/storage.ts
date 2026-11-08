import { parseColumnConfig } from "@/lib/catalog/columns";
import { materializeFields, STARTER_FIELDS, type FieldGroupId } from "@/lib/catalog/fields";
import { FRAMEWORK_CATALOG } from "@/lib/catalog/framework-catalog";
import { CSF_ELEMENTS, CSF_FRAMEWORK, type FrameworkElement } from "@/lib/catalog/framework";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { builtinLogoForSlug } from "@/lib/catalog/logos";
import type { ExportProfile, FieldDefinition, LookupOption, OutcomeMapping, ServiceRecord, Tenant } from "@/lib/catalog/types";
import { freshDemo, type CatalogDb } from "@/lib/data/model";

const PREVIOUS_CSF_HELP = "Primary NIST CSF 2.0 function. Detailed control mapping comes in a later version.";
const CURRENT_CSF_HELP =
  "Primary NIST CSF 2.0 function for this service. This dropdown is not an outcome assessment and does not count as coverage.";

export const DEMO_STORAGE_KEY = "sscb.demo.v1";
export const ACTIVE_TENANT_KEY = "sscb.activeTenantId";

export function loadDemoDb(): CatalogDb {
  if (typeof window === "undefined") return freshDemo();
  const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!raw) return freshDemo();
  try {
    return migrateDemoState(JSON.parse(raw)) ?? freshDemo();
  } catch {
    return freshDemo();
  }
}

/**
 * Accept a V1, V1.1, or V1.2 demo cache.
 * V1 has no `logo_url`, `archived_at`, or `catalog_columns`.
 * A missing logo on Acme Corp or Meridian Health receives the built-in mark.
 * An explicit null logo stays cleared. Edited services, lookups, fields, and
 * saved outcome assessments are kept. The official CSF 2.0 core is refreshed.
 * Workspace-imported framework rows and saved export profiles are kept.
 * Optional geography and privacy fields are added inactive when missing.
 * Missing outcome-assessment dropdowns are added without rewriting lookup
 * groups the workspace already edited.
 * Returns null when the payload is not a catalog.
 */
export function migrateDemoState(raw: unknown): CatalogDb | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const parsed = raw as Partial<CatalogDb>;
    if (!Array.isArray(parsed.tenants) || !Array.isArray(parsed.services) || !Array.isArray(parsed.lookups)) {
      return null;
    }
    const tenants = parsed.tenants.map(normalizeTenant);
    const tenantIds = tenants.map((tenant) => tenant.id);
    const lookups = ensureOptionalLookups(ensureCoverageLookups(parsed.lookups, tenantIds), tenantIds);
    const fields = ensureOptionalFields(
      Array.isArray(parsed.fields) ? parsed.fields.map(normalizeStoredField) : [],
      tenantIds,
    );
    const library = mergeFrameworkLibrary(parsed.elements);
    return {
      session: parsed.session ?? null,
      activeTenantId: typeof parsed.activeTenantId === "string" ? parsed.activeTenantId : null,
      tenants,
      members: Array.isArray(parsed.members) ? parsed.members : [],
      fields,
      lookups,
      services: parsed.services.map(normalizeStoredService),
      frameworks: library.frameworks,
      elements: library.elements,
      mappings: normalizeStoredMappings(parsed.mappings),
      exportProfiles: normalizeProfiles(parsed.exportProfiles, tenantIds),
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    };
  } catch {
    return null;
  }
}

export function persistDemoDb(db: CatalogDb): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
  if (db.activeTenantId) {
    window.localStorage.setItem(ACTIVE_TENANT_KEY, db.activeTenantId);
  }
}

export function readActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_TENANT_KEY);
}

export function writeActiveTenantId(tenantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
}

function normalizeTenant(input: unknown): Tenant {
  const row = (input && typeof input === "object" ? input : {}) as Partial<Tenant>;
  const slug = typeof row.slug === "string" ? row.slug : "";
  const hasLogo = Boolean(input && typeof input === "object" && Object.prototype.hasOwnProperty.call(input, "logo_url"));
  const rawLogo = hasLogo ? row.logo_url : undefined;
  let logo_url: string | null = null;
  if (!hasLogo) logo_url = builtinLogoForSlug(slug);
  else if (typeof rawLogo === "string" && rawLogo.trim()) logo_url = rawLogo;
  return {
    id: typeof row.id === "string" ? row.id : "",
    slug,
    name: typeof row.name === "string" ? row.name : "",
    service_code_mode: row.service_code_mode === "category_prefix" ? "category_prefix" : "sequential",
    logo_url,
    catalog_columns: parseColumnConfig(row.catalog_columns),
    is_active: row.is_active !== false,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

function normalizeStoredField(input: unknown): FieldDefinition {
  const row = (input && typeof input === "object" ? input : {}) as Partial<FieldDefinition>;
  const group: FieldGroupId | null = row.field_group === "geography" || row.field_group === "privacy" ? row.field_group : null;
  const next: FieldDefinition = {
    id: typeof row.id === "string" ? row.id : "",
    tenant_id: typeof row.tenant_id === "string" ? row.tenant_id : null,
    field_key: typeof row.field_key === "string" ? row.field_key : "",
    label: typeof row.label === "string" ? row.label : "",
    help_text: typeof row.help_text === "string" ? row.help_text : "",
    input_type: row.input_type ?? "text",
    lookup_field_key: typeof row.lookup_field_key === "string" ? row.lookup_field_key : null,
    lookup_bound: row.lookup_bound === true,
    lookup_restore: row.lookup_restore === "dropdown" ? "dropdown" : null,
    is_required: Boolean(row.is_required),
    visibility: row.visibility === "internal" ? "internal" : "public",
    depth_level: row.depth_level === 2 || row.depth_level === 3 ? row.depth_level : 1,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    is_active: row.is_active !== false,
    is_standard: row.is_standard !== false,
    field_group: group,
  };
  if (next.field_key === "primary_csf_function" && next.help_text === PREVIOUS_CSF_HELP) {
    next.help_text = CURRENT_CSF_HELP;
  }
  const known = STARTER_FIELDS.find((field) => field.field_key === next.field_key);
  if (known?.field_group && !next.field_group) next.field_group = known.field_group;
  return next;
}

const OPTIONAL_FIELDS = STARTER_FIELDS.filter((field) => field.field_group);
const OPTIONAL_LOOKUP_KEYS = new Set(
  OPTIONAL_FIELDS.map((field) => field.lookup_field_key).filter((key): key is string => Boolean(key)),
);

function ensureOptionalFields(fields: FieldDefinition[], tenantIds: string[]): FieldDefinition[] {
  const next = fields.slice();
  for (const tenantId of tenantIds) {
    if (!tenantId) continue;
    for (const seed of OPTIONAL_FIELDS) {
      if (next.some((field) => field.tenant_id === tenantId && field.field_key === seed.field_key)) continue;
      const [created] = materializeFields(tenantId, (fieldKey) => `field:${tenantId}:${fieldKey}`).filter(
        (field) => field.field_key === seed.field_key,
      );
      if (created) next.push(created);
    }
  }
  return next;
}

function ensureOptionalLookups(lookups: LookupOption[], tenantIds: string[]): LookupOption[] {
  const seeds = STARTER_LOOKUPS.filter((row) => OPTIONAL_LOOKUP_KEYS.has(row.field_key));
  const next = lookups.slice();
  for (const tenantId of tenantIds) {
    if (!tenantId) continue;
    for (const seed of seeds) {
      if (next.some((option) => option.tenant_id === tenantId && option.field_key === seed.field_key && option.code === seed.code)) {
        continue;
      }
      next.push({
        id: `lookup:${tenantId}:${seed.field_key}:${seed.code}`,
        tenant_id: tenantId,
        field_key: seed.field_key,
        code: seed.code,
        label: seed.label,
        description: seed.description,
        code_prefix: seed.code_prefix,
        sort_order: seed.sort_order,
        is_active: true,
      });
    }
  }
  return next;
}

function mergeFrameworkLibrary(input: unknown): { frameworks: CatalogDb["frameworks"]; elements: FrameworkElement[] } {
  const official = CSF_ELEMENTS.map((element) => ({ ...element, tenant_id: null }));
  const imported: FrameworkElement[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      const element = normalizeImportedElement(item);
      if (!element) continue;
      if (element.framework_id === CSF_FRAMEWORK.id) continue;
      if (!FRAMEWORK_CATALOG.some((framework) => framework.id === element.framework_id)) continue;
      imported.push(element);
    }
  }
  return {
    frameworks: FRAMEWORK_CATALOG.map((framework) => ({ ...framework })),
    elements: [...official, ...imported],
  };
}

function normalizeImportedElement(input: unknown): FrameworkElement | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Partial<FrameworkElement>;
  if (typeof row.tenant_id !== "string" || !row.tenant_id) return null;
  if (typeof row.id !== "string" || typeof row.framework_id !== "string" || typeof row.code !== "string") return null;
  if (row.element_type !== "function" && row.element_type !== "category" && row.element_type !== "subcategory") return null;
  if (typeof row.title !== "string" || typeof row.statement !== "string") return null;
  return {
    id: row.id,
    framework_id: row.framework_id,
    tenant_id: row.tenant_id,
    element_type: row.element_type,
    code: row.code,
    parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
    title: row.title,
    statement: row.statement,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
  };
}

function normalizeProfiles(input: unknown, tenantIds: string[]): ExportProfile[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(tenantIds);
  const seen = new Set<string>();
  const profiles: ExportProfile[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ExportProfile>;
    if (typeof row.id !== "string" || typeof row.tenant_id !== "string" || typeof row.name !== "string") continue;
    if (!allowed.has(row.tenant_id)) continue;
    if (row.audience !== "public" && row.audience !== "internal") continue;
    if (!Array.isArray(row.field_keys) || row.field_keys.some((key) => typeof key !== "string")) continue;
    const key = `${row.tenant_id}:${row.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push({
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name.trim(),
      audience: row.audience,
      field_keys: row.field_keys,
      is_default: Boolean(row.is_default),
      created_at: typeof row.created_at === "string" ? row.created_at : "",
      updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
    });
  }
  const defaults = new Set<string>();
  return profiles.map((profile) => {
    if (!profile.is_default || defaults.has(profile.tenant_id)) return { ...profile, is_default: defaults.has(profile.tenant_id) ? false : profile.is_default };
    defaults.add(profile.tenant_id);
    return profile;
  });
}

const COVERAGE_SEEDS = STARTER_LOOKUPS.filter((row) => row.field_key === "outcome_coverage");

function ensureCoverageLookups(lookups: LookupOption[], tenantIds: string[]): LookupOption[] {
  const next = lookups.slice();
  for (const tenantId of tenantIds) {
    if (!tenantId) continue;
    if (next.some((option) => option.tenant_id === tenantId && option.field_key === "outcome_coverage")) continue;
    for (const seed of COVERAGE_SEEDS) {
      next.push({
        id: `lookup:${tenantId}:outcome_coverage:${seed.code}`,
        tenant_id: tenantId,
        field_key: seed.field_key,
        code: seed.code,
        label: seed.label,
        description: seed.description,
        code_prefix: seed.code_prefix,
        sort_order: seed.sort_order,
        is_active: true,
      });
    }
  }
  return next;
}

function normalizeStoredMappings(input: unknown): OutcomeMapping[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const mappings: OutcomeMapping[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<OutcomeMapping>;
    if (row.coverage !== "full" && row.coverage !== "partial" && row.coverage !== "none") continue;
    if (typeof row.id !== "string" || typeof row.tenant_id !== "string") continue;
    if (typeof row.service_id !== "string" || typeof row.element_id !== "string") continue;
    const key = `${row.tenant_id}:${row.service_id}:${row.element_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mappings.push({
      id: row.id,
      tenant_id: row.tenant_id,
      service_id: row.service_id,
      element_id: row.element_id,
      coverage: row.coverage,
      rationale: typeof row.rationale === "string" && row.rationale.trim() ? row.rationale : null,
      notes: typeof row.notes === "string" && row.notes.trim() ? row.notes : null,
      created_by: typeof row.created_by === "string" ? row.created_by : null,
      updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
      created_at: typeof row.created_at === "string" ? row.created_at : "",
      updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
    });
  }
  return mappings;
}

function normalizeStoredService(input: unknown): ServiceRecord {
  const row = (input && typeof input === "object" ? input : {}) as Partial<ServiceRecord>;
  const archived = row.archived_at;
  return {
    ...(row as ServiceRecord),
    id: typeof row.id === "string" ? row.id : "",
    tenant_id: typeof row.tenant_id === "string" ? row.tenant_id : "",
    service_code: typeof row.service_code === "string" ? row.service_code : "",
    name: typeof row.name === "string" ? row.name : "",
    target_audience: Array.isArray(row.target_audience) ? row.target_audience.map(String) : [],
    custom_fields:
      row.custom_fields && typeof row.custom_fields === "object" && !Array.isArray(row.custom_fields)
        ? row.custom_fields
        : {},
    approval_required: Boolean(row.approval_required),
    archived_at: typeof archived === "string" && archived.trim() ? archived : null,
  };
}
