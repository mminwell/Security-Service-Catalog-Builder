const COLUMN_KEY = "sscb.catalogColumns.v1";

type ColumnMap = Record<string, string[]>;

let memory: ColumnMap = {};
const listeners = new Set<() => void>();
const cache = new Map<string, string[]>();

function readMap(): ColumnMap {
  if (typeof window === "undefined") return memory;
  try {
    const raw = window.localStorage.getItem(COLUMN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    memory = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ColumnMap) : {};
  } catch {
    memory = {};
  }
  return memory;
}

function writeMap(next: ColumnMap): void {
  memory = next;
  if (typeof window !== "undefined") window.localStorage.setItem(COLUMN_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

/** Null means this browser has no override and the workspace default should apply. */
export function localColumnKeys(tenantId: string | null): string[] | null {
  if (!tenantId) return null;
  const value = readMap()[tenantId];
  if (!Array.isArray(value) || value.length === 0) return null;
  const keys = value.filter((key): key is string => typeof key === "string");
  const previous = cache.get(tenantId);
  if (previous && previous.length === keys.length && previous.every((key, index) => key === keys[index])) {
    return previous;
  }
  cache.set(tenantId, keys);
  return keys;
}

export function setLocalColumnKeys(tenantId: string, keys: string[]): void {
  cache.set(tenantId, keys);
  writeMap({ ...readMap(), [tenantId]: keys });
}

export function clearLocalColumnKeys(tenantId: string): void {
  const next = { ...readMap() };
  delete next[tenantId];
  writeMap(next);
}

export function subscribeColumns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const CATALOG_COLUMN_KEY = COLUMN_KEY;
