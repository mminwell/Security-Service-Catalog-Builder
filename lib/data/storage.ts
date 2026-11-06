import { builtinLogoForSlug } from "@/lib/catalog/logos";
import type { ServiceRecord, Tenant } from "@/lib/catalog/types";
import { freshDemo, type CatalogDb } from "@/lib/data/model";

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
 * Accept a V1 demo cache that has no `logo_url` or `archived_at`.
 * A missing logo on Acme Corp or Meridian Health receives the built-in mark.
 * An explicit null logo stays cleared. Returns null when the payload is not a catalog.
 */
export function migrateDemoState(raw: unknown): CatalogDb | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const parsed = raw as Partial<CatalogDb>;
    if (!Array.isArray(parsed.tenants) || !Array.isArray(parsed.services) || !Array.isArray(parsed.lookups)) {
      return null;
    }
    return {
      session: parsed.session ?? null,
      activeTenantId: typeof parsed.activeTenantId === "string" ? parsed.activeTenantId : null,
      tenants: parsed.tenants.map(normalizeTenant),
      members: Array.isArray(parsed.members) ? parsed.members : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      lookups: parsed.lookups,
      services: parsed.services.map(normalizeStoredService),
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
    is_active: row.is_active !== false,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
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
