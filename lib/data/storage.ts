import { freshDemo, type CatalogDb } from "@/lib/data/model";

export const DEMO_STORAGE_KEY = "sscb.demo.v1";
export const ACTIVE_TENANT_KEY = "sscb.activeTenantId";

export function loadDemoDb(): CatalogDb {
  if (typeof window === "undefined") return freshDemo();
  const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!raw) return freshDemo();
  try {
    const parsed = JSON.parse(raw) as CatalogDb;
    if (!Array.isArray(parsed.tenants) || !Array.isArray(parsed.services) || !Array.isArray(parsed.lookups)) {
      return freshDemo();
    }
    return parsed;
  } catch {
    return freshDemo();
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
