const CART_KEY = "sscb.blueprintCart.v1";
const EMPTY_CART: string[] = [];

type CartMap = Record<string, string[]>;

let memory: CartMap = {};
const listeners = new Set<() => void>();
const cache = new Map<string, string[]>();

function readMap(): CartMap {
  if (typeof window === "undefined") return memory;
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    memory = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as CartMap) : {};
  } catch {
    memory = {};
  }
  return memory;
}

function writeMap(next: CartMap): void {
  memory = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CART_KEY, JSON.stringify(next));
  }
  for (const listener of listeners) listener();
}

export function cartIdsFor(tenantId: string | null): string[] {
  if (!tenantId) return EMPTY_CART;
  const value = readMap()[tenantId];
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  const stable = ids.length === 0 ? EMPTY_CART : ids;
  const previous = cache.get(tenantId);
  if (previous && previous.length === stable.length && previous.every((id, index) => id === stable[index])) {
    return previous;
  }
  cache.set(tenantId, stable);
  return stable;
}

export function setCartIdsFor(tenantId: string, ids: string[]): void {
  cache.set(tenantId, ids);
  writeMap({ ...readMap(), [tenantId]: ids });
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const BLUEPRINT_CART_KEY = CART_KEY;
