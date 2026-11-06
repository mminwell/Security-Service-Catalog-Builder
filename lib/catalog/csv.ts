import { optionLabel } from "@/lib/catalog/lookups";
import { readField, withComputed } from "@/lib/catalog/service";
import type { FieldDefinition, LookupOption, ServiceRecord, Visibility } from "@/lib/catalog/types";

export type CsvVisibility = "public" | "all";

export function exportColumns(fields: FieldDefinition[], visibility: CsvVisibility): FieldDefinition[] {
  return fields
    .filter((field) => field.is_active)
    .filter((field) => visibility === "all" || field.visibility === "public")
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function servicesToCsv(
  services: ServiceRecord[],
  fields: FieldDefinition[],
  lookups: LookupOption[],
  visibility: CsvVisibility,
): string {
  const columns = exportColumns(fields, visibility);
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const lines = services.map((service) => {
    const shown = withComputed(service);
    return columns
      .map((column) => csvEscape(formatExportValue(shown, column, lookups)))
      .join(",");
  });
  return `\uFEFF${[header, ...lines].join("\r\n")}`;
}

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatExportValue(
  service: ServiceRecord,
  field: FieldDefinition,
  lookups: LookupOption[],
): string {
  const value = readField(service, field.field_key);
  if (value == null) return "";
  if (field.input_type === "boolean") return value ? "Yes" : "No";
  if (field.input_type === "multi_select" && Array.isArray(value)) {
    const fieldKey = field.lookup_field_key ?? field.field_key;
    return value.map((code) => optionLabel(lookups, fieldKey, String(code))).join("; ");
  }
  if (field.input_type === "dropdown" && field.lookup_field_key) {
    return optionLabel(lookups, field.lookup_field_key, String(value));
  }
  if (typeof value === "number") return String(value);
  return String(value);
}

export function downloadName(slug: string, visibility: CsvVisibility): string {
  const audience = visibility === "public" ? "public" : "full";
  return `${slug || "catalog"}-services-${audience}.csv`;
}

export function isInternalField(field: Pick<FieldDefinition, "visibility">): boolean {
  return field.visibility === "internal";
}

export function publicFieldKeys(fields: FieldDefinition[]): string[] {
  return exportColumns(fields, "public").map((field) => field.field_key);
}

export function assertNoInternalLeakage(csv: string, internalSnippets: string[]): string[] {
  return internalSnippets.filter((snippet) => snippet && csv.includes(snippet));
}

export type { Visibility };
