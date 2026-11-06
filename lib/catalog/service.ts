import { maturityGap, nextReviewDate } from "@/lib/catalog/compute";
import type { FieldDefinition, InputType, ServiceRecord } from "@/lib/catalog/types";

export type ServiceSeed = {
  id?: string;
  service_code: string;
  name: string;
  category: string;
  status: string;
  service_tier: string;
  summary: string;
  owner_team: string;
  service_owner?: string | null;
  in_scope?: string | null;
  description?: string | null;
  internal_name?: string | null;
  delivery_team?: string | null;
  business_unit?: string | null;
  delivery_model?: string | null;
  target_audience?: string[];
  out_of_scope?: string | null;
  deliverables?: string | null;
  prerequisites?: string | null;
  intake_method?: string | null;
  intake_url?: string | null;
  approval_required?: boolean;
  approver?: string | null;
  lead_time?: string | null;
  support_contact?: string | null;
  hours_of_coverage?: string | null;
  sla_response_target?: string | null;
  sla_resolution_target?: string | null;
  primary_csf_function?: string | null;
  capability_rating?: string | null;
  current_tooling_notes?: string | null;
  internal_notes?: string | null;
  threats_addressed?: string | null;
  data_classification_handled?: string | null;
  kpis_and_metrics?: string | null;
  current_maturity_cmmi?: number | null;
  target_maturity_cmmi?: number | null;
  known_gaps_or_risks?: string | null;
  third_party_providers?: string | null;
  cost_model?: string | null;
  cost_or_effort_notes?: string | null;
  review_cadence?: string | null;
  last_reviewed_date?: string | null;
};

const TEXT_KEYS = [
  "internal_name",
  "description",
  "in_scope",
  "out_of_scope",
  "deliverables",
  "prerequisites",
  "service_owner",
  "delivery_team",
  "business_unit",
  "delivery_model",
  "intake_method",
  "intake_url",
  "approver",
  "lead_time",
  "support_contact",
  "hours_of_coverage",
  "sla_response_target",
  "sla_resolution_target",
  "primary_csf_function",
  "capability_rating",
  "threats_addressed",
  "data_classification_handled",
  "kpis_and_metrics",
  "known_gaps_or_risks",
  "third_party_providers",
  "cost_model",
  "cost_or_effort_notes",
  "current_tooling_notes",
  "internal_notes",
  "review_cadence",
  "last_reviewed_date",
] as const;

export function blankService(tenantId: string, id: string, serviceCode = ""): ServiceRecord {
  const now = new Date().toISOString();
  return withComputed({
    id,
    tenant_id: tenantId,
    service_code: serviceCode,
    name: "",
    internal_name: null,
    category: null,
    status: null,
    service_tier: null,
    summary: "",
    description: null,
    in_scope: null,
    out_of_scope: null,
    deliverables: null,
    prerequisites: null,
    owner_team: null,
    delivery_team: null,
    business_unit: null,
    service_owner: null,
    delivery_model: null,
    target_audience: [],
    intake_method: null,
    intake_url: null,
    approval_required: false,
    approver: null,
    lead_time: null,
    support_contact: null,
    hours_of_coverage: null,
    sla_response_target: null,
    sla_resolution_target: null,
    primary_csf_function: null,
    capability_rating: null,
    threats_addressed: null,
    data_classification_handled: null,
    kpis_and_metrics: null,
    current_maturity_cmmi: null,
    target_maturity_cmmi: null,
    maturity_gap: null,
    known_gaps_or_risks: null,
    third_party_providers: null,
    cost_model: null,
    cost_or_effort_notes: null,
    current_tooling_notes: null,
    internal_notes: null,
    review_cadence: null,
    last_reviewed_date: null,
    next_review_date: null,
    archived_at: null,
    custom_fields: {},
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
  });
}

export function buildService(
  tenantId: string,
  seed: ServiceSeed,
  timestamp = "2026-11-01T15:00:00.000Z",
): ServiceRecord {
  const base = blankService(tenantId, seed.id ?? crypto.randomUUID(), seed.service_code);
  const next: ServiceRecord = {
    ...base,
    name: seed.name,
    category: seed.category,
    status: seed.status,
    service_tier: seed.service_tier,
    summary: seed.summary,
    owner_team: seed.owner_team,
    target_audience: seed.target_audience ?? [],
    approval_required: seed.approval_required ?? false,
    current_maturity_cmmi: seed.current_maturity_cmmi ?? null,
    target_maturity_cmmi: seed.target_maturity_cmmi ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  for (const key of TEXT_KEYS) {
    const value = seed[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return withComputed(next);
}

export function withComputed(service: ServiceRecord): ServiceRecord {
  return {
    ...service,
    maturity_gap: maturityGap(service.current_maturity_cmmi, service.target_maturity_cmmi),
    next_review_date: nextReviewDate(service.last_reviewed_date, service.review_cadence),
  };
}

export function readField(service: ServiceRecord, key: string): unknown {
  const bag = service as unknown as Record<string, unknown>;
  return bag[key];
}

export function writeField(service: ServiceRecord, key: string, value: unknown): ServiceRecord {
  if (key === "maturity_gap" || key === "next_review_date") return service;
  if (key === "current_maturity_cmmi" || key === "target_maturity_cmmi") {
    const parsed = value === "" || value == null ? null : Number(value);
    return { ...service, [key]: Number.isFinite(parsed) ? parsed : null };
  }
  if (key === "approval_required") {
    return { ...service, approval_required: Boolean(value) };
  }
  if (key === "target_audience") {
    return { ...service, target_audience: Array.isArray(value) ? value.map(String) : [] };
  }
  if (typeof value === "string") {
    return { ...service, [key]: value };
  }
  return { ...service, [key]: value == null ? null : value };
}

export function isFilled(value: unknown, inputType: InputType): boolean {
  if (value == null) return false;
  if (inputType === "boolean") return typeof value === "boolean";
  if (inputType === "multi_select" || Array.isArray(value)) {
    return Array.isArray(value) && value.length > 0;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/** Filled active fields divided by all active field definitions, including computed fields. */
export function completenessPercent(service: ServiceRecord, fields: FieldDefinition[]): number {
  const active = fields.filter((field) => field.is_active);
  if (active.length === 0) return 0;
  const shown = withComputed(service);
  const filled = active.filter((field) => isFilled(readField(shown, field.field_key), field.input_type)).length;
  return Math.round((filled / active.length) * 100);
}

export function validateService(
  service: ServiceRecord,
  fields: FieldDefinition[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field.is_active || !field.is_required) continue;
    if (!isFilled(readField(service, field.field_key), field.input_type)) {
      errors[field.field_key] = `${field.label} is required.`;
    }
  }
  const code = service.service_code.trim();
  if (code && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code)) {
    errors.service_code = "Use letters, numbers, hyphens, or underscores.";
  }
  const url = service.intake_url?.trim() ?? "";
  if (url && !/^https?:\/\//i.test(url)) {
    errors.intake_url = "Enter a URL starting with http:// or https://.";
  }
  return errors;
}

export function normalizeService(service: ServiceRecord): ServiceRecord {
  const trimmed: ServiceRecord = {
    ...service,
    service_code: service.service_code.trim(),
    name: service.name.trim(),
    summary: service.summary?.trim() ?? "",
    target_audience: service.target_audience ?? [],
    custom_fields: service.custom_fields ?? {},
    approval_required: Boolean(service.approval_required),
    archived_at: typeof service.archived_at === "string" && service.archived_at.trim() ? service.archived_at : null,
  };
  for (const key of TEXT_KEYS) {
    const value = trimmed[key];
    if (typeof value === "string") {
      const next = value.trim();
      trimmed[key] = next.length === 0 ? null : next;
    }
  }
  return withComputed(trimmed);
}
