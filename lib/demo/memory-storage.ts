/** Browser keys the real app uses. The demo must not read or write them. */
export const DEMO_BLOCKED_STORAGE_KEYS = [
  "sscb.catalogColumns.v1",
  "sscb.blueprintCart.v1",
  "sscb.blueprintView.v1",
  "sscb.demo.v1",
  "sscb.activeTenantId",
  "sscb.profilePrompt.dismissed",
] as const;

const BLOCKED = new Set<string>(DEMO_BLOCKED_STORAGE_KEYS);

export function isDemoPersistenceKey(key: string): boolean {
  return BLOCKED.has(key);
}

/**
 * While the demo is open, catalog prefs and the old demo cache stay in a tab-local map.
 * Refreshing the page drops that map. Saved preferences for a real workspace are left alone.
 */
export function installDemoMemoryStorage(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const bag = new Map<string, string>();
  const prototype = Storage.prototype;
  const getItem = prototype.getItem;
  const setItem = prototype.setItem;
  const removeItem = prototype.removeItem;

  prototype.getItem = function demoGetItem(key: string) {
    if (BLOCKED.has(key)) return bag.get(key) ?? null;
    return getItem.call(this, key);
  };
  prototype.setItem = function demoSetItem(key: string, value: string) {
    if (BLOCKED.has(key)) {
      bag.set(key, value);
      return;
    }
    setItem.call(this, key, value);
  };
  prototype.removeItem = function demoRemoveItem(key: string) {
    if (BLOCKED.has(key)) {
      bag.delete(key);
      return;
    }
    removeItem.call(this, key);
  };

  return () => {
    prototype.getItem = getItem;
    prototype.setItem = setItem;
    prototype.removeItem = removeItem;
  };
}
