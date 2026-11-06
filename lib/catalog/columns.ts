import { optionLabel } from "@/lib/catalog/lookups";
import {
  capabilityTone,
  cmmiTone,
  completenessTone,
  formatDate,
  gapText,
  reviewTone,
  shortTier,
  statusTone,
  type Tone,
} from "@/lib/catalog/present";
import { completenessPercent, readField, withComputed } from "@/lib/catalog/service";
import type { FieldDefinition, LookupOption, ServiceRecord } from "@/lib/catalog/types";

export const COMPLETENESS_KEY = "completeness";

export const PINNED_COLUMN_KEYS = ["service_code", "name"] as const;

export const DEFAULT_COLUMN_KEYS = [
  "service_code",
  "name",
  "category",
  "status",
  "service_tier",
  "owner_team",
  "capability_rating",
  "next_review_date",
  "internal_name",
  "current_maturity_cmmi",
  "maturity_gap",
  COMPLETENESS_KEY,
];

const CLIP = 72;

const CSF_SHORT: Record<string, string> = {
  govern: "GV",
  identify: "ID",
  protect: "PR",
  detect: "DE",
  respond: "RS",
  recover: "RC",
};

export type CatalogCellModel = {
  kind: "text" | "badge" | "pills" | "meter" | "code";
  text: string;
  title?: string;
  tone?: Tone;
  pills?: string[];
  percent?: number;
};

export function isPinnedColumn(key: string): boolean {
  return key === "service_code" || key === "name";
}

/** Drop retired fields. Code and Service stay first so every row stays identifiable. */
export function resolveColumnKeys(
  stored: readonly string[] | null | undefined,
  activeFieldKeys: ReadonlySet<string>,
): string[] {
  const source = stored && stored.length > 0 ? stored : DEFAULT_COLUMN_KEYS;
  const pinned = PINNED_COLUMN_KEYS.filter((key) => activeFieldKeys.has(key));
  const rest: string[] = [];
  const seen = new Set<string>(pinned);
  for (const key of source) {
    if (seen.has(key)) continue;
    if (key === COMPLETENESS_KEY) {
      rest.push(key);
      seen.add(key);
      continue;
    }
    if (!activeFieldKeys.has(key)) continue;
    rest.push(key);
    seen.add(key);
  }
  return [...pinned, ...rest];
}

export function toggleColumn(keys: readonly string[], key: string, on: boolean): string[] {
  if (isPinnedColumn(key)) return [...keys];
  if (!on) return keys.filter((item) => item !== key);
  if (keys.includes(key)) return [...keys];
  return [...keys, key];
}

export function moveColumn(keys: readonly string[], key: string, direction: "up" | "down"): string[] {
  if (isPinnedColumn(key)) return [...keys];
  const index = keys.indexOf(key);
  if (index < 0) return [...keys];
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= keys.length) return [...keys];
  const neighbor = keys[nextIndex];
  if (!neighbor || isPinnedColumn(neighbor)) return [...keys];
  const copy = [...keys];
  copy[index] = neighbor;
  copy[nextIndex] = key;
  return copy;
}

export function columnLabel(key: string, fields: FieldDefinition[]): string {
  if (key === COMPLETENESS_KEY) return "Completeness";
  return fields.find((field) => field.field_key === key)?.label ?? key;
}

export function formatCatalogCell(
  fieldKey: string,
  service: ServiceRecord,
  field: FieldDefinition | undefined,
  lookups: LookupOption[],
  fields: FieldDefinition[],
): CatalogCellModel {
  const shown = withComputed(service);
  if (fieldKey === COMPLETENESS_KEY) {
    const percent = completenessPercent(shown, fields);
    return {
      kind: "meter",
      text: `${percent}%`,
      percent,
      tone: completenessTone(percent),
      title: "Filled fields divided by all active field definitions",
    };
  }
  if (fieldKey === "service_code") {
    return { kind: "code", text: shown.service_code || "—" };
  }
  if (fieldKey === "maturity_gap") {
    if (shown.maturity_gap == null) return { kind: "text", text: "—" };
    return {
      kind: "badge",
      text: String(shown.maturity_gap),
      title: gapText(shown.maturity_gap),
      tone: shown.maturity_gap > 0 ? "warning" : "success",
    };
  }
  if (fieldKey === "next_review_date") {
    if (!shown.next_review_date) return { kind: "text", text: "—" };
    return {
      kind: "badge",
      text: formatDate(shown.next_review_date),
      tone: reviewTone(shown.next_review_date),
      title: shown.next_review_date,
    };
  }
  if (fieldKey === "current_maturity_cmmi" || fieldKey === "target_maturity_cmmi") {
    const level = fieldKey === "current_maturity_cmmi" ? shown.current_maturity_cmmi : shown.target_maturity_cmmi;
    if (level == null) return { kind: "text", text: "—" };
    return { kind: "badge", text: String(level), tone: cmmiTone(level), title: `CMMI ${level}` };
  }

  const value = readField(shown, fieldKey);
  const inputType = field?.input_type;

  if (inputType === "boolean" || fieldKey === "approval_required") {
    if (typeof value !== "boolean") return { kind: "text", text: "—" };
    return { kind: "text", text: value ? "Yes" : "No" };
  }

  if (inputType === "multi_select" || Array.isArray(value)) {
    const codes = Array.isArray(value) ? value.map(String) : [];
    if (codes.length === 0) return { kind: "text", text: "—" };
    const lookupKey = field?.lookup_field_key ?? fieldKey;
    const pills = codes.map((code) => optionLabel(lookups, lookupKey, code) || code);
    return { kind: "pills", text: pills.join(", "), pills, title: pills.join(", ") };
  }

  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return { kind: "text", text: "—" };
  }

  if (fieldKey === "status") {
    const label = optionLabel(lookups, "status", String(value)) || String(value);
    return { kind: "badge", text: label, tone: statusTone(String(value)) };
  }
  if (fieldKey === "service_tier") {
    const label = optionLabel(lookups, "service_tier", String(value));
    return { kind: "badge", text: shortTier(label) || String(value), tone: "neutral", title: label || String(value) };
  }
  if (fieldKey === "capability_rating") {
    const label = optionLabel(lookups, "capability_rating", String(value)) || String(value);
    return { kind: "badge", text: label, tone: capabilityTone(String(value)) };
  }
  if (fieldKey === "primary_csf_function") {
    const label = optionLabel(lookups, "primary_csf_function", String(value)) || String(value);
    return {
      kind: "badge",
      text: CSF_SHORT[String(value)] ?? String(value),
      tone: "info",
      title: label,
    };
  }

  if (inputType === "dropdown" && field?.lookup_field_key) {
    const label = optionLabel(lookups, field.lookup_field_key, String(value)) || String(value);
    return clipText(label);
  }
  if (inputType === "date" || fieldKey === "last_reviewed_date") {
    return { kind: "text", text: formatDate(String(value)), title: String(value) };
  }
  if (typeof value === "number") return { kind: "text", text: String(value) };
  return clipText(String(value));
}

function clipText(value: string): CatalogCellModel {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= CLIP) return { kind: "text", text: clean || "—" };
  return { kind: "text", text: `${clean.slice(0, CLIP - 1)}…`, title: clean };
}

export function parseColumnConfig(value: unknown): { keys: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return null;
  const clean = keys.filter((key): key is string => typeof key === "string" && key.trim().length > 0);
  return clean.length > 0 ? { keys: clean } : null;
}
