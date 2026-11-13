import { optionLabel } from "@/lib/catalog/lookups";
import { readField, withComputed } from "@/lib/catalog/service";
import type {
  CatalogFilters,
  FieldDefinition,
  FilterOp,
  FilterRule,
  LookupOption,
  ServiceRecord,
} from "@/lib/catalog/types";

export type ValueKind = "text" | "lookup" | "multi" | "boolean" | "date" | "number";

const OP_WORD: Record<FilterOp, string> = {
  eq: "is",
  contains: "contains",
  includes: "includes",
  before: "before",
  after: "after",
  on: "on",
  gte: "at least",
  lte: "at most",
};

export function activeFilterCount(filters: CatalogFilters): number {
  return filters.rules.length + (filters.scope === "archived" ? 1 : 0) + (filters.ownerGap ? 1 : 0);
}

export type FilterComposer = {
  popupOpen: boolean;
  composing: boolean;
  draftField: string;
  draftOp: FilterOp;
  draftValue: string;
};

export const CLOSED_COMPOSER: FilterComposer = {
  popupOpen: false,
  composing: false,
  draftField: "",
  draftOp: "eq",
  draftValue: "",
};

/**
 * The Filter pop-up adds the rule in progress and switches Active / Archived.
 * Further rules are started from the catalog page, beside Clear all.
 */
export function filterPopupActionLabels(): readonly string[] {
  return ["Add"];
}

/** Open the composer immediately, with an empty draft, and no extra in-popup step. */
export function requestAdditionalFilter(composer: FilterComposer = CLOSED_COMPOSER): FilterComposer {
  return {
    ...composer,
    popupOpen: true,
    composing: true,
    draftField: "",
    draftOp: "eq",
    draftValue: "",
  };
}

export function openFilterPopup(composer: FilterComposer): FilterComposer {
  return { ...composer, popupOpen: true, composing: true };
}

export function closeFilterPopup(composer: FilterComposer): FilterComposer {
  return { ...composer, popupOpen: false };
}

/** Commit a draft rule and close the pop-up so the new chip renders on the page. */
export function commitDraftRule(
  filters: CatalogFilters,
  composer: FilterComposer,
  id: string,
): { filters: CatalogFilters; composer: FilterComposer } | null {
  const value = composer.draftValue.trim();
  if (!composer.composing || !composer.draftField || value.length === 0) return null;
  return {
    filters: {
      ...filters,
      rules: [...filters.rules, { id, fieldKey: composer.draftField, op: composer.draftOp, value }],
    },
    composer: { ...CLOSED_COMPOSER },
  };
}

export function removeFilterRule(filters: CatalogFilters, id: string): CatalogFilters {
  return { ...filters, rules: filters.rules.filter((rule) => rule.id !== id) };
}

export function clearFilterRules(filters: CatalogFilters): { filters: CatalogFilters; composer: FilterComposer } {
  return {
    filters: { query: filters.query, scope: "active", rules: [] },
    composer: { ...CLOSED_COMPOSER, composing: true },
  };
}

export function valueKind(field: FieldDefinition): ValueKind {
  if (field.input_type === "boolean") return "boolean";
  if (field.input_type === "multi_select") return "multi";
  if (field.input_type === "dropdown" || (field.lookup_bound && field.lookup_field_key)) return "lookup";
  if (field.input_type === "date" || field.field_key === "next_review_date") return "date";
  if (field.field_key === "maturity_gap") return "number";
  return "text";
}

export function operatorsFor(field: FieldDefinition): Array<{ op: FilterOp; label: string }> {
  const kind = valueKind(field);
  if (kind === "text") return [{ op: "contains", label: "Contains" }];
  if (kind === "multi") return [{ op: "includes", label: "Includes" }];
  if (kind === "boolean" || kind === "lookup") return [{ op: "eq", label: "Is" }];
  if (kind === "date") {
    return [
      { op: "on", label: "On" },
      { op: "before", label: "Before" },
      { op: "after", label: "After" },
    ];
  }
  return [
    { op: "eq", label: "Equals" },
    { op: "gte", label: "At least" },
    { op: "lte", label: "At most" },
  ];
}

export function defaultOperator(field: FieldDefinition): FilterOp {
  return operatorsFor(field)[0]?.op ?? "eq";
}

export function describeRule(
  rule: FilterRule,
  field: FieldDefinition | undefined,
  lookups: LookupOption[],
): string {
  const label = field?.label ?? rule.fieldKey;
  let shown = rule.value;
  if (field && valueKind(field) === "boolean") {
    shown = rule.value === "true" ? "Yes" : "No";
  } else if (field?.lookup_field_key) {
    shown = optionLabel(lookups, field.lookup_field_key, rule.value) || rule.value;
  }
  return `${label} ${OP_WORD[rule.op]} ${shown}`;
}

export function filterServices(
  services: ServiceRecord[],
  filters: CatalogFilters,
  fields: FieldDefinition[] = [],
): ServiceRecord[] {
  const query = filters.query.trim().toLowerCase();
  const byKey = new Map(fields.map((field) => [field.field_key, field]));
  return services.filter((service) => {
    const archived = Boolean(service.archived_at);
    if ((filters.scope === "archived") !== archived) return false;
    if (filters.ownerGap && !service.owner_gap) return false;
    const shown = withComputed(service);
    for (const rule of filters.rules) {
      const field = byKey.get(rule.fieldKey);
      if (field && !field.is_active) continue;
      if (!ruleMatches(shown, rule, field)) return false;
    }
    if (!query) return true;
    const haystack = [shown.service_code, shown.name, shown.internal_name, shown.summary, shown.service_owner]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function ruleMatches(service: ServiceRecord, rule: FilterRule, field?: FieldDefinition): boolean {
  const value = readField(service, rule.fieldKey);
  const kind = field ? valueKind(field) : kindFromOp(rule.op);
  if (kind === "text" || rule.op === "contains") {
    const text = value == null ? "" : Array.isArray(value) ? value.map(String).join(" ") : String(value);
    const needle = rule.value.trim().toLowerCase();
    return needle.length > 0 && text.toLowerCase().includes(needle);
  }
  if (kind === "multi" || rule.op === "includes") {
    return Array.isArray(value) && value.map(String).includes(rule.value);
  }
  if (kind === "boolean") {
    return (value === true ? "true" : "false") === rule.value;
  }
  if (kind === "date") {
    const left = dateKey(value);
    const right = dateKey(rule.value);
    if (!left || !right) return false;
    if (rule.op === "before") return left < right;
    if (rule.op === "after") return left > right;
    return left === right;
  }
  if (kind === "number") {
    const left = asNumber(value);
    const right = asNumber(rule.value);
    if (left == null || right == null) return false;
    if (rule.op === "gte") return left >= right;
    if (rule.op === "lte") return left <= right;
    return left === right;
  }
  if (Array.isArray(value)) return value.map(String).includes(rule.value);
  return value != null && String(value) === rule.value;
}

function kindFromOp(op: FilterOp): ValueKind {
  switch (op) {
    case "contains":
      return "text";
    case "includes":
      return "multi";
    case "before":
    case "after":
    case "on":
      return "date";
    case "gte":
    case "lte":
      return "number";
    default:
      return "lookup";
  }
}

function dateKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
