import type { FieldDefinition, Visibility } from "@/lib/catalog/types";

/**
 * Visibility that shipped before the public catalog was limited to Service Name
 * and Service Description. A stored value that still matches this, and was not
 * marked as an admin override, moves to the new stock visibility.
 * A value that differs was an admin choice and is kept.
 */
export const PREVIOUS_STOCK_INTERNAL = new Set([
  "internal_name",
  "current_tooling_notes",
  "internal_notes",
  "current_maturity_cmmi",
  "target_maturity_cmmi",
  "maturity_gap",
  "known_gaps_or_risks",
  "third_party_providers",
  "cost_model",
  "cost_or_effort_notes",
]);

export const PUBLIC_STOCK_KEYS = new Set(["name", "summary"]);

export const LABEL_UPDATES: Record<string, { from: string; to: string; helpFrom: string; helpTo: string }> = {
  summary: {
    from: "Executive Summary",
    to: "Service Description",
    helpFrom: "One or two sentences a leader or client can read without the full description.",
    helpTo: "One or two sentences a client can read. This is the service description.",
  },
  description: {
    from: "Full Description",
    to: "Full Service Description",
    helpFrom: "Complete narrative of how the service is delivered.",
    helpTo: "The longer narrative of how the service is delivered.",
  },
};

export const SUPPORT_HELP_FROM = "Where to escalate when the normal path is not enough.";
export const SUPPORT_HELP_TO = "Shared mailbox for support and escalation. One email address.";

export function previousStockVisibility(fieldKey: string): Visibility {
  return PREVIOUS_STOCK_INTERNAL.has(fieldKey) ? "internal" : "public";
}

export function stockVisibility(fieldKey: string): Visibility {
  return PUBLIC_STOCK_KEYS.has(fieldKey) ? "public" : "internal";
}

/** Apply renamed stock labels and the two-field public default without wiping a custom label or a detected visibility override. */
export function migrateStockField(field: FieldDefinition): FieldDefinition {
  const next: FieldDefinition = { ...field };
  const rename = LABEL_UPDATES[field.field_key];
  if (rename && field.label === rename.from) next.label = rename.to;
  if (rename && field.help_text === rename.helpFrom) next.help_text = rename.helpTo;
  if (field.field_key === "support_contact" && field.help_text === SUPPORT_HELP_FROM) next.help_text = SUPPORT_HELP_TO;
  if (field.field_key === "support_contact" && field.lookup_bound) next.lookup_bound = false;

  if (field.visibility_overridden) return next;
  const previous = previousStockVisibility(field.field_key);
  if (field.visibility !== previous) {
    next.visibility_overridden = true;
    return next;
  }
  next.visibility = stockVisibility(field.field_key);
  return next;
}
