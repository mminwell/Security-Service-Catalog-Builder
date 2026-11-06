import type { AuditEntry, FieldDefinition } from "@/lib/catalog/types";

const SKIP = new Set([
  "id",
  "tenant_id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
]);

export type FieldChange = {
  key: string;
  label: string;
  from: string;
  to: string;
};

export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  labels: Map<string, string>,
): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const fromValue = before?.[key] ?? null;
    const toValue = after?.[key] ?? null;
    if (stable(fromValue) === stable(toValue)) continue;
    changes.push({
      key,
      label: labels.get(key) ?? humanize(key),
      from: present(fromValue),
      to: present(toValue),
    });
  }
  return changes;
}

export function summarizeAudit(
  entry: AuditEntry,
  labels: Map<string, string>,
): { title: string; changes: FieldChange[] } {
  const after = entry.after_data;
  const before = entry.before_data;
  if (entry.action === "insert") {
    const code = textOf(after?.service_code) || textOf(after?.code);
    const name = textOf(after?.name) || textOf(after?.label) || entry.table_name;
    return {
      title: code ? `Added ${code} · ${name}` : `Added ${name}`,
      changes: [],
    };
  }
  if (entry.action === "delete") {
    const code = textOf(before?.service_code) || textOf(before?.code);
    const name = textOf(before?.name) || textOf(before?.label) || "a record";
    return { title: code ? `Deleted ${code} · ${name}` : `Deleted ${name}`, changes: [] };
  }
  const changes = changedFields(before, after, labels);
  const active = changes.find((change) => change.key === "is_active");
  if (entry.table_name === "lookup_options" && active) {
    const label = textOf(after?.label) || textOf(before?.label) || "option";
    return {
      title: active.to === "false" ? `Retired ${label}` : `Reactivated ${label}`,
      changes: changes.filter((change) => change.key !== "is_active"),
    };
  }
  const code = textOf(after?.service_code) || textOf(before?.service_code);
  return { title: code ? `Updated ${code}` : "Updated", changes };
}

export function labelMap(fields: FieldDefinition[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of fields) map.set(field.field_key, field.label);
  map.set("label", "Label");
  map.set("description", "Description");
  map.set("code_prefix", "Code prefix");
  map.set("sort_order", "Sort order");
  map.set("is_active", "Active");
  map.set("visibility", "Visibility");
  map.set("depth_level", "Depth");
  map.set("help_text", "Help text");
  return map;
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function present(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanize(key: string): string {
  return key.replace(/_/g, " ");
}
