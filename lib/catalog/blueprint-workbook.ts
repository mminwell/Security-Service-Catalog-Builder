import type { AisleId } from "@/lib/catalog/aisles";
import type { Blueprint } from "@/lib/catalog/blueprints";
import { CSF_OUTCOMES } from "@/lib/catalog/framework";
import { STARTER_LOOKUPS, type LookupSeed } from "@/lib/catalog/lookups";

/** Rows in the workbook whose Origin is the template store or the starter pack. */
export const EXCLUDED_TEMPLATE_ORIGINS = ["Template store", "Starter"] as const;

export const EXPECTED_EXTENDED_TEMPLATE_COUNT = 315;

export const WORKBOOK_COLUMNS = [
  "Template ID",
  "Name",
  "Aisle",
  "Category",
  "Summary",
  "Description",
  "Service Tier",
  "Primary CSF Function",
  "Delivery Model",
  "Suggested Owner Team",
  "Suggested Delivery Team",
  "In Scope",
  "Out of Scope",
  "Deliverables",
  "Prerequisites",
  "Lead Time",
  "SLA Response Target",
  "SLA Resolution Target",
  "Escalation Path",
  "Threats Addressed",
  "KPIs and Metrics",
  "Hours of Coverage",
  "Review Cadence",
  "Data Classification",
  "Target Audience",
  "Intake Method",
  "Approval Required",
  "Approver",
  "NIST CSF Subcategories",
] as const;

export const PACK_COLUMNS = ["Size Packs", "Industry Packs"] as const;

const SIZE_PACKS: Record<string, string> = {
  "size-small": "size-small",
  Small: "size-small",
  "Small / Lean Security Team": "size-small",
  "size-medium": "size-medium",
  Medium: "size-medium",
  "Medium / Mid-Market Program": "size-medium",
  "size-large": "size-large",
  Large: "size-large",
  "Large Enterprise Program": "size-large",
};

const INDUSTRY_PACKS: Record<string, string> = {
  "industry-healthcare": "industry-healthcare",
  Healthcare: "industry-healthcare",
  "Healthcare / HIPAA": "industry-healthcare",
  "industry-fintech": "industry-fintech",
  FinTech: "industry-fintech",
  "FinTech / PCI & SOC 2": "industry-fintech",
  "industry-ai": "industry-ai",
  AI: "industry-ai",
  "AI Security & Privacy": "industry-ai",
  "industry-product": "industry-product",
  "Connected Products": "industry-product",
  "Connected Products & Devices": "industry-product",
  "industry-physical": "industry-physical",
  "Physical Security & Facilities": "industry-physical",
};

const LOOKUP_FIELDS = {
  category: "category",
  service_tier: "service_tier",
  primary_csf_function: "primary_csf_function",
  delivery_model: "delivery_model",
  hours_of_coverage: "hours_of_coverage",
  review_cadence: "review_cadence",
  data_classification: "data_classification",
  target_audience: "target_audience",
  intake_method: "intake_method",
  team: "team",
} as const;

export type WorkbookImport = {
  blueprints: Blueprint[];
  /** Bundle id to blueprint ids. Empty when the workbook has no pack columns. */
  membership: Record<string, string[]>;
};

export function isExcludedTemplateOrigin(origin: string): boolean {
  const value = origin.trim();
  return value === "Template store" || value === "Starter" || value.startsWith("Starter ");
}

export function importWorkbookBlueprints(
  rows: unknown,
  aisles: ReadonlyArray<{ id: AisleId; label: string }>,
  lookups: readonly LookupSeed[] = STARTER_LOOKUPS,
): WorkbookImport {
  if (!Array.isArray(rows)) throw new Error("Extended template data is not an array.");
  const labels = labelIndex(lookups);
  const nist = new Set(CSF_OUTCOMES.map((outcome) => outcome.code));
  const blueprints: Blueprint[] = [];
  const membership: Record<string, string[]> = {};
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const record = asRecord(row, index);
    const id = required(record, "Template ID", `row ${index + 1}`);
    if (seenIds.has(id)) throw new Error(`Duplicate template id ${id}.`);
    seenIds.add(id);
    const blueprint = blueprintFromRow(record, id, aisles, labels, nist);
    blueprints.push(blueprint);
    addPacks(membership, blueprint.id, optional(record, "Size Packs"), SIZE_PACKS, "Size Packs");
    addPacks(membership, blueprint.id, optional(record, "Industry Packs"), INDUSTRY_PACKS, "Industry Packs");
  });

  return { blueprints, membership };
}

function blueprintFromRow(
  row: Record<string, unknown>,
  id: string,
  aisles: ReadonlyArray<{ id: AisleId; label: string }>,
  labels: Map<string, Map<string, string>>,
  nist: Set<string>,
): Blueprint {
  const approval = required(row, "Approval Required", id);
  const approver = required(row, "Approver", id);
  if (approval !== "Yes" && approval !== "No") {
    throw new Error(`Unknown approval_required label ${JSON.stringify(approval)} on ${id}.`);
  }
  const nistCodes = splitMulti(required(row, "NIST CSF Subcategories", id), "nist_csf", id);
  for (const code of nistCodes) {
    if (!nist.has(code)) throw new Error(`Unknown NIST CSF subcategory ${JSON.stringify(code)} on ${id}.`);
  }
  return {
    id,
    name: required(row, "Name", id),
    aisle: aisleId(required(row, "Aisle", id), aisles, id),
    category: codeFor(labels, LOOKUP_FIELDS.category, required(row, "Category", id), id),
    service_tier: codeFor(labels, LOOKUP_FIELDS.service_tier, required(row, "Service Tier", id), id),
    summary: required(row, "Summary", id),
    in_scope: required(row, "In Scope", id),
    description: required(row, "Description", id),
    deliverables: required(row, "Deliverables", id),
    out_of_scope: required(row, "Out of Scope", id),
    target_audience: splitMulti(required(row, "Target Audience", id), "target_audience", id).map((label) =>
      codeFor(labels, LOOKUP_FIELDS.target_audience, label, id),
    ),
    prerequisites: required(row, "Prerequisites", id),
    intake_method: splitMulti(required(row, "Intake Method", id), "intake_method", id).map((label) =>
      codeFor(labels, LOOKUP_FIELDS.intake_method, label, id),
    ),
    approval_required: approval === "Yes",
    approver: approver.length > 0 ? approver : null,
    lead_time: required(row, "Lead Time", id),
    hours_of_coverage: codeFor(labels, LOOKUP_FIELDS.hours_of_coverage, required(row, "Hours of Coverage", id), id),
    sla_response_target: required(row, "SLA Response Target", id),
    sla_resolution_target: required(row, "SLA Resolution Target", id),
    escalation_path: required(row, "Escalation Path", id),
    primary_csf_function: codeFor(labels, LOOKUP_FIELDS.primary_csf_function, required(row, "Primary CSF Function", id), id),
    threats_addressed: required(row, "Threats Addressed", id),
    data_classification_handled: codeFor(
      labels,
      LOOKUP_FIELDS.data_classification,
      required(row, "Data Classification", id),
      id,
    ),
    kpis_and_metrics: required(row, "KPIs and Metrics", id),
    review_cadence: codeFor(labels, LOOKUP_FIELDS.review_cadence, required(row, "Review Cadence", id), id),
    delivery_model: codeFor(labels, LOOKUP_FIELDS.delivery_model, required(row, "Delivery Model", id), id),
    suggested_owner_team: codeFor(labels, LOOKUP_FIELDS.team, required(row, "Suggested Owner Team", id), id),
    suggested_delivery_team: codeFor(labels, LOOKUP_FIELDS.team, required(row, "Suggested Delivery Team", id), id),
    nist_csf: nistCodes,
  };
}

function labelIndex(lookups: readonly LookupSeed[]): Map<string, Map<string, string>> {
  const byField = new Map<string, Map<string, string>>();
  for (const row of lookups) {
    let labels = byField.get(row.field_key);
    if (!labels) {
      labels = new Map();
      byField.set(row.field_key, labels);
    }
    const existing = labels.get(row.label);
    if (existing && existing !== row.code) {
      throw new Error(
        `Lookup ${row.field_key} label ${JSON.stringify(row.label)} maps to both ${existing} and ${row.code}.`,
      );
    }
    labels.set(row.label, row.code);
  }
  return byField;
}

function codeFor(labels: Map<string, Map<string, string>>, field: string, label: string, id: string): string {
  const code = labels.get(field)?.get(label);
  if (!code) throw new Error(`Unknown ${field} label ${JSON.stringify(label)} on ${id}.`);
  return code;
}

function aisleId(value: string, aisles: ReadonlyArray<{ id: AisleId; label: string }>, id: string): AisleId {
  const byId = aisles.find((aisle) => aisle.id === value);
  const byLabel = aisles.find((aisle) => aisle.label === value);
  if (byId && byLabel && byId.id !== byLabel.id) {
    throw new Error(`Ambiguous aisle label ${JSON.stringify(value)} on ${id}.`);
  }
  const match = byId ?? byLabel;
  if (!match) throw new Error(`Unknown aisle label ${JSON.stringify(value)} on ${id}.`);
  return match.id;
}

function splitMulti(value: string, field: string, id: string): string[] {
  const parts = value.split(";").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new Error(`Empty ${field} entry on ${id}.`);
  }
  return parts;
}

function addPacks(
  membership: Record<string, string[]>,
  blueprintId: string,
  raw: string | null,
  packs: Record<string, string>,
  column: string,
): void {
  if (raw === null || raw.length === 0) return;
  for (const label of splitMulti(raw, column, blueprintId)) {
    const bundleId = packs[label];
    if (!bundleId) throw new Error(`Unknown ${column} label ${JSON.stringify(label)} on ${blueprintId}.`);
    const list = membership[bundleId] ?? [];
    if (!list.includes(blueprintId)) list.push(blueprintId);
    membership[bundleId] = list;
  }
}

function asRecord(row: unknown, index: number): Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`Extended template row ${index + 1} is not an object.`);
  }
  return row as Record<string, unknown>;
}

function required(row: Record<string, unknown>, key: string, id: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, key)) throw new Error(`Missing column ${key} on ${id}.`);
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Column ${key} on ${id} is not text.`);
  return value.trim();
}

function optional(row: Record<string, unknown>, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null;
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Column ${key} is not text.`);
  return value.trim();
}
