export type Visibility = "public" | "internal";

export type DepthLevel = 1 | 2 | 3;

export type InputType =
  | "text"
  | "textarea"
  | "dropdown"
  | "multi_select"
  | "url"
  | "date"
  | "boolean"
  | "computed";

export type ServiceCodeMode = "sequential" | "category_prefix";

export type Role = "platform_owner" | "tenant_admin" | "editor" | "viewer";

/** Ordered catalog table columns. `completeness` is the computed column. */
export type CatalogColumnConfig = {
  keys: string[];
};

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  service_code_mode: ServiceCodeMode;
  logo_url: string | null;
  /** Workspace default. Null uses the built-in column set. Viewers may override locally. */
  catalog_columns: CatalogColumnConfig | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  role: Role;
  created_at: string;
};

export type Invitation = {
  id: string;
  tenant_id: string;
  email: string;
  role: Role;
  created_at: string;
};

export type FieldDefinition = {
  id: string;
  tenant_id: string | null;
  field_key: string;
  label: string;
  help_text: string;
  input_type: InputType;
  lookup_field_key: string | null;
  /** Text or textarea rendered from `lookup_field_key` until an admin turns Lookup off. */
  lookup_bound: boolean;
  /** Set when a native dropdown is shown as text, so Lookup can restore that dropdown. */
  lookup_restore: "dropdown" | null;
  /** True after an admin changes visibility, so a stock migration does not overwrite that choice. */
  visibility_overridden: boolean;
  is_required: boolean;
  visibility: Visibility;
  depth_level: DepthLevel;
  sort_order: number;
  is_active: boolean;
  is_standard: boolean;
  /** Optional group. Null for the original catalog fields. Inactive groups stay out of completeness. */
  field_group: "geography" | "privacy" | null;
};

export type LookupOption = {
  id: string;
  tenant_id: string | null;
  field_key: string;
  code: string;
  label: string;
  description: string | null;
  code_prefix: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ServiceRecord = {
  id: string;
  tenant_id: string;
  service_code: string;
  name: string;
  internal_name: string | null;
  category: string | null;
  status: string | null;
  service_tier: string | null;
  summary: string | null;
  description: string | null;
  in_scope: string | null;
  out_of_scope: string | null;
  deliverables: string | null;
  prerequisites: string | null;
  owner_team: string | null;
  delivery_team: string | null;
  business_unit: string | null;
  service_owner: string | null;
  delivery_model: string | null;
  target_audience: string[];
  intake_method: string | null;
  intake_url: string | null;
  approval_required: boolean;
  approver: string | null;
  lead_time: string | null;
  support_contact: string | null;
  hours_of_coverage: string | null;
  sla_response_target: string | null;
  sla_resolution_target: string | null;
  primary_csf_function: string | null;
  capability_rating: string | null;
  threats_addressed: string | null;
  data_classification_handled: string | null;
  kpis_and_metrics: string | null;
  current_maturity_cmmi: number | null;
  target_maturity_cmmi: number | null;
  maturity_gap: number | null;
  known_gaps_or_risks: string | null;
  third_party_providers: string | null;
  cost_model: string | null;
  cost_or_effort_notes: string | null;
  current_tooling_notes: string | null;
  internal_notes: string | null;
  review_cadence: string | null;
  last_reviewed_date: string | null;
  next_review_date: string | null;
  archived_at: string | null;
  custom_fields: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Workspace assessment of one CSF subcategory outcome. Not a certification. */
export type OutcomeMapping = {
  id: string;
  tenant_id: string;
  service_id: string;
  element_id: string;
  coverage: "full" | "partial" | "none";
  rationale: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A policy, standard, procedure, tool, or other supporting document.
 * The catalog stores a link. It does not host the file.
 * `review_cadence` reuses the service Review Cadences lookup so next review is computed the same way.
 */
export type Artifact = {
  id: string;
  tenant_id: string;
  name: string;
  artifact_type: string;
  owner_team: string | null;
  status: string | null;
  version: string | null;
  review_cadence: string | null;
  last_reviewed_date: string | null;
  next_review_date: string | null;
  link_url: string | null;
  description: string | null;
  visibility: Visibility;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Many-to-many link between one artifact and one service. */
export type ArtifactLink = {
  id: string;
  tenant_id: string;
  artifact_id: string;
  service_id: string;
  relationship_note: string | null;
  created_by: string | null;
  created_at: string;
};

/** Workspace-scoped export profile. Visibility is enforced when the profile is used. */
export type ExportProfile = {
  id: string;
  tenant_id: string;
  name: string;
  audience: Visibility;
  field_keys: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditEntry = {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_label: string;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "delete";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

export type SessionUser = {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
};

export type FilterOp = "eq" | "contains" | "includes" | "before" | "after" | "on" | "gte" | "lte";

export type FilterRule = {
  id: string;
  fieldKey: string;
  op: FilterOp;
  value: string;
};

export type CatalogScope = "active" | "archived";

export type CatalogFilters = {
  query: string;
  scope: CatalogScope;
  rules: FilterRule[];
};

export const EMPTY_FILTERS: CatalogFilters = {
  query: "",
  scope: "active",
  rules: [],
};

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export const DEPTH_META: Record<
  DepthLevel,
  { title: string; levelLabel: string; lede: string }
> = {
  1: {
    title: "Core",
    levelLabel: "Level 1",
    lede: "Stand up a usable catalog. Six fields are required. Everything else can wait.",
  },
  2: {
    title: "Operations",
    levelLabel: "Level 2",
    lede: "Delivery, intake, and SLAs. The accountable owner and the operating team stay separate, so “Security owns it, IT delivers it” is explicit. Nothing at this depth is required.",
  },
  3: {
    title: "Governance",
    levelLabel: "Level 3",
    lede: "Risk, CMMI maturity, cost, and review cadence. CMMI here is a pragmatic per-service lens, not a formal organizational appraisal. Nothing at this depth is required.",
  },
};
