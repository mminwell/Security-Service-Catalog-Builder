import { isIdentityField } from "@/lib/catalog/fields";
import type { FieldDefinition, LookupOption } from "@/lib/catalog/types";

export type LookupToggle = {
  checked: boolean;
  disabled: boolean;
  reason: string | null;
};

const NUMERIC_FIELDS = new Set(["current_maturity_cmmi", "target_maturity_cmmi"]);

/** A single-value field whose form, filters, and exports should show lookup labels. */
export function fieldUsesLookup(field: Pick<FieldDefinition, "input_type" | "lookup_field_key" | "lookup_bound">): boolean {
  if (!field.lookup_field_key) return false;
  if (field.input_type === "dropdown") return true;
  return Boolean(field.lookup_bound && (field.input_type === "text" || field.input_type === "textarea"));
}

export function lookupToggleFor(field: FieldDefinition): LookupToggle {
  if (field.input_type === "computed" || field.field_key === "maturity_gap" || field.field_key === "next_review_date") {
    return {
      checked: false,
      disabled: true,
      reason: "Computed from other fields. A lookup would replace the calculation.",
    };
  }
  if (isIdentityField(field.field_key)) {
    return {
      checked: false,
      disabled: true,
      reason: "Service code and name stay free text so a service can always be identified.",
    };
  }
  if (field.input_type === "date") {
    return {
      checked: false,
      disabled: true,
      reason: "This stores a calendar date. A lookup code would not fit that column.",
    };
  }
  if (field.input_type === "boolean") {
    return {
      checked: false,
      disabled: true,
      reason: "This stores yes or no. A lookup code would not fit that column.",
    };
  }
  if (field.input_type === "url") {
    return {
      checked: false,
      disabled: true,
      reason: "This stores a web address. A lookup code would not stay a valid URL.",
    };
  }
  if (field.input_type === "multi_select") {
    return {
      checked: true,
      disabled: true,
      reason: "This is already a multi-select lookup. A single dropdown would replace stored lists.",
    };
  }
  if (NUMERIC_FIELDS.has(field.field_key)) {
    return {
      checked: field.input_type === "dropdown",
      disabled: true,
      reason: "Maturity is stored as a number and feeds the gap calculation. A free-text code would not fit.",
    };
  }
  if (field.input_type === "dropdown" || field.lookup_restore === "dropdown") {
    return { checked: field.input_type === "dropdown", disabled: false, reason: null };
  }
  if (field.input_type === "text" || field.input_type === "textarea") {
    return { checked: Boolean(field.lookup_bound), disabled: false, reason: null };
  }
  return {
    checked: false,
    disabled: true,
    reason: "This field type cannot become a lookup without changing stored values.",
  };
}

/** Options for a lookup control, keeping a stored value that is not in the group. */
export function lookupChoices(options: LookupOption[], value: string | null): Array<{ code: string; label: string; legacy: boolean }> {
  const active = options.filter((option) => option.is_active);
  const known = value != null && value !== "" && active.some((option) => option.code === value);
  const legacy = value != null && value !== "" && !known ? [{ code: value, label: value, legacy: true }] : [];
  return [...legacy, ...active.map((option) => ({ code: option.code, label: option.label, legacy: false }))];
}

export function applyLookupToggle(field: FieldDefinition, enabled: boolean): FieldDefinition {
  const toggle = lookupToggleFor(field);
  if (toggle.disabled) {
    throw new Error(toggle.reason ?? "Lookup cannot be changed for this field.");
  }
  if (enabled === toggle.checked) return field;
  if (enabled) {
    if (field.lookup_restore === "dropdown") {
      return { ...field, input_type: "dropdown", lookup_restore: null, lookup_bound: false };
    }
    return {
      ...field,
      lookup_bound: true,
      lookup_field_key: field.lookup_field_key ?? field.field_key,
    };
  }
  if (field.input_type === "dropdown") {
    return { ...field, input_type: "text", lookup_bound: false, lookup_restore: "dropdown" };
  }
  return { ...field, lookup_bound: false };
}
