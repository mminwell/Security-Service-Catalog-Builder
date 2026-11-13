import { formatExportValue } from "@/lib/catalog/export-value";
import { csvEscape } from "@/lib/catalog/spreadsheet-text";
import type { FieldDefinition, LookupOption, ServiceRecord, Visibility } from "@/lib/catalog/types";

export type CsvVisibility = "public" | "all";

export function exportColumns(fields: FieldDefinition[], visibility: CsvVisibility): FieldDefinition[] {
  return fields
    .filter((field) => field.is_active)
    .filter((field) => visibility === "all" || field.visibility === "public")
    .sort((a, b) => a.sort_order - b.sort_order);
}

export type CsvExportOptions = {
  /** When set, row 1 is this corporate distribution marking and the header moves to row 2. */
  marking?: string | null;
  /** When set, these columns are used in this order instead of the preset field list. */
  columns?: FieldDefinition[];
};

export function distributionMarking(companyName: string, visibility: CsvVisibility, override?: string | null): string {
  const custom = override?.replace(/\s+/g, " ").trim();
  if (custom) return custom;
  const name = companyName.trim().toLocaleUpperCase();
  const suffix =
    visibility === "public"
      ? "APPROVED FOR CLIENT/LIMITED DISTRIBUTION"
      : "DO NOT DISTRIBUTE EXTERNALLY";
  return `${name} \u2014 ${suffix}`;
}

export function servicesToCsv(
  services: ServiceRecord[],
  fields: FieldDefinition[],
  lookups: LookupOption[],
  visibility: CsvVisibility,
  options?: CsvExportOptions,
): string {
  const columns = options?.columns ?? exportColumns(fields, visibility);
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const lines = services.map((service) =>
    columns.map((column) => csvEscape(formatExportValue(service, column, lookups))).join(","),
  );
  const marking = options?.marking?.trim();
  const rows = marking ? [csvEscape(marking), header, ...lines] : [header, ...lines];
  return `\uFEFF${rows.join("\r\n")}`;
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
