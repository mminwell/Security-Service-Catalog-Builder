import { optionLabel } from "@/lib/catalog/lookups";
import { readField, withComputed } from "@/lib/catalog/service";
import type { FieldDefinition, LookupOption, ServiceRecord } from "@/lib/catalog/types";

export function formatExportValue(
  service: ServiceRecord,
  field: FieldDefinition,
  lookups: LookupOption[],
): string {
  const shown = withComputed(service);
  const value = readField(shown, field.field_key);
  if (value == null) return "";
  if (field.input_type === "boolean") return value ? "Yes" : "No";
  if (field.input_type === "multi_select" && Array.isArray(value)) {
    const fieldKey = field.lookup_field_key ?? field.field_key;
    return value.map((code) => optionLabel(lookups, fieldKey, String(code))).join("; ");
  }
  if (Array.isArray(value)) {
    const fieldKey = field.lookup_field_key ?? field.field_key;
    return value.map((code) => optionLabel(lookups, fieldKey, String(code))).join("; ");
  }
  if (field.input_type === "dropdown" && field.lookup_field_key) {
    return optionLabel(lookups, field.lookup_field_key, String(value));
  }
  if (typeof value === "number") return String(value);
  return String(value);
}

export function displayExportValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : "—";
}
