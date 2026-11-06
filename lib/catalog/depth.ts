import type { DepthLevel, FieldDefinition } from "@/lib/catalog/types";

export function fieldsAtDepth(fields: FieldDefinition[], depth: DepthLevel): FieldDefinition[] {
  return fields
    .filter((field) => field.is_active && field.depth_level <= depth)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Depth only changes which keys are visible. The record is returned as the same value,
 * so switching Core / Operations / Governance cannot clear saved fields.
 */
export function projectForDepth<T>(
  record: T,
  fields: FieldDefinition[],
  depth: DepthLevel,
): { record: T; visibleKeys: string[] } {
  return {
    record,
    visibleKeys: fieldsAtDepth(fields, depth).map((field) => field.field_key),
  };
}

export function requiredKeys(fields: FieldDefinition[]): string[] {
  return fields.filter((field) => field.is_active && field.is_required).map((field) => field.field_key);
}
