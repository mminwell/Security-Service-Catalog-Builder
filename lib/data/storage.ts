import { parseColumnConfig } from "@/lib/catalog/columns";
import { CSF_ELEMENTS, CSF_FRAMEWORK } from "@/lib/catalog/framework";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { builtinLogoForSlug } from "@/lib/catalog/logos";
import type { LookupOption, OutcomeMapping, ServiceRecord, Tenant } from "@/lib/catalog/types";
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
 * saved outcome assessments are kept. The official CSF 2.0 core is attached
 * when the cache has no framework rows. Missing outcome-assessment dropdowns
 * are added without rewriting lookup groups the workspace already edited.
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
    const lookups = ensureCoverageLookups(parsed.lookups, tenants.map((tenant) => tenant.id));
    return {
      session: parsed.session ?? null,
      activeTenantId: typeof parsed.activeTenantId === "string" ? parsed.activeTenantId : null,
      tenants,
      members: Array.isArray(parsed.members) ? parsed.members : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields.map(normalizeStoredField) : [],
      lookups,
      services: parsed.services.map(normalizeStoredService),
      frameworks: [{ ...CSF_FRAMEWORK }],
      elements: CSF_ELEMENTS.map((element) => ({ ...element })),
      mappings: normalizeStoredMappings(parsed.mappings),
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

function normalizeStoredField(input: unknown): CatalogDb["fields"][number] {
  const row = (input && typeof input === "object" ? input : {}) as CatalogDb["fields"][number];
  if (row.field_key === "primary_csf_function" && row.help_text === PREVIOUS_CSF_HELP) {
    return { ...row, help_text: CURRENT_CSF_HELP };
  }
  return row;
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
