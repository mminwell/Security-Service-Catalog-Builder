export type BlueprintView = "cards" | "list";

export const BLUEPRINT_VIEW_KEY = "sscb.blueprintView.v1";

/** Browse and individual services come before the starter-pack shelf. */
export const BLUEPRINT_PAGE_SECTIONS = ["browse", "results", "starter-packs"] as const;

export const BLUEPRINT_VIEWS = ["cards", "list"] as const;

/** Fields scanned in a list row. Longer blueprint detail stays in Preview. */
export const BLUEPRINT_LIST_ROW_FIELDS = ["name", "category", "tier", "csf", "summary"] as const;

export const ALREADY_IN_CATALOG_LABEL = "Already in catalog";
export const SKIP_EXISTING_LABEL = "Skip services already in this catalog";

let memory: BlueprintView = "list";
const listeners = new Set<() => void>();

export function normalizeBlueprintView(value: unknown): BlueprintView {
  return value === "cards" || value === "list" ? value : "list";
}

function readStored(): BlueprintView {
  if (typeof window === "undefined") return memory;
  try {
    return normalizeBlueprintView(window.localStorage.getItem(BLUEPRINT_VIEW_KEY));
  } catch {
    return "list";
  }
}

/** First visit, a missing key, and any unknown cached value resolve to compact List. */
export function readBlueprintView(): BlueprintView {
  memory = readStored();
  return memory;
}

export function writeBlueprintView(view: BlueprintView): void {
  const next = normalizeBlueprintView(view);
  memory = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(BLUEPRINT_VIEW_KEY, next);
    } catch {
      // Preference is best-effort. The in-memory choice still applies this visit.
    }
  }
  for (const listener of listeners) listener();
}

export function subscribeBlueprintView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Arrow, Home, and End keys move the Cards / List radio. Other keys are ignored. */
export function cycleBlueprintView(view: BlueprintView, key: string): BlueprintView | null {
  if (key === "ArrowRight" || key === "ArrowDown" || key === "End") {
    return key === "End" ? "list" : view === "cards" ? "list" : "cards";
  }
  if (key === "ArrowLeft" || key === "ArrowUp" || key === "Home") {
    return key === "Home" ? "cards" : view === "list" ? "cards" : "list";
  }
  return null;
}
