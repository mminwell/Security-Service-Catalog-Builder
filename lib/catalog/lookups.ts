export type LookupSeed = {
  field_key: string;
  code: string;
  label: string;
  description: string | null;
  code_prefix: string | null;
  sort_order: number;
};

export type LookupGroup = {
  field_key: string;
  title: string;
  blurb: string;
};

function rows(
  fieldKey: string,
  items: Array<{
    code: string;
    label: string;
    description?: string | null;
    code_prefix?: string | null;
  }>,
): LookupSeed[] {
  return items.map((item, index) => ({
    field_key: fieldKey,
    code: item.code,
    label: item.label,
    description: item.description ?? null,
    code_prefix: item.code_prefix ?? null,
    sort_order: (index + 1) * 10,
  }));
}

export function visibleLookupGroups(
  fields: Array<Pick<FieldDefinitionLite, "field_key" | "label" | "lookup_field_key">>,
  lookups: Array<Pick<LookupSeed, "field_key">>,
): LookupGroup[] {
  const titles = new Map(LOOKUP_GROUPS.map((group) => [group.field_key, group]));
  const extras = new Map<string, string>();
  for (const field of fields) {
    if (field.lookup_field_key && !titles.has(field.lookup_field_key)) {
      extras.set(field.lookup_field_key, field.label);
    }
  }
  for (const option of lookups) {
    if (!titles.has(option.field_key) && !extras.has(option.field_key)) extras.set(option.field_key, option.field_key);
  }
  const extraGroups = [...extras.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([field_key, title]) => ({
      field_key,
      title,
      blurb: "Options for this field. Add, edit, reorder, retire, or import them. Retired options stay on services that already use them.",
    }));
  return [...LOOKUP_GROUPS, ...extraGroups];
}

type FieldDefinitionLite = { field_key: string; label: string; lookup_field_key: string | null };

export const LOOKUP_GROUPS: LookupGroup[] = [
  {
    field_key: "service_tier",
    title: "Service Tiers",
    blurb: "Tier 0–3. The description is the definition people see while they choose.",
  },
  {
    field_key: "category",
    title: "Security Categories",
    blurb: "Fourteen domains. The three-letter prefix is used for category-prefixed service IDs.",
  },
  {
    field_key: "status",
    title: "Statuses",
    blurb: "Lifecycle from draft through retired. Retire an option here instead of deleting it.",
  },
  {
    field_key: "capability_rating",
    title: "Capability Rating",
    blurb: "Full, Partial, or None for the scope this service declares.",
  },
  {
    field_key: "maturity_cmmi",
    title: "CMMI Maturity",
    blurb: "Shared by current and target maturity. A per-service lens, not a formal appraisal.",
  },
  {
    field_key: "primary_csf_function",
    title: "NIST CSF 2.0 Functions",
    blurb: "The six CSF 2.0 functions as a single label on the service. Outcome assessments are recorded separately and are not certification.",
  },
  {
    field_key: "outcome_coverage",
    title: "CSF Outcome Assessment",
    blurb:
      "Explicit workspace assessment of a CSF 2.0 subcategory outcome: full, partial, or none. Not a maturity score and not certification. Unmapped is the absence of an assessment, not a fourth option.",
  },
  {
    field_key: "data_classification",
    title: "Data Classification",
    blurb: "Highest classification the service routinely handles.",
  },
  {
    field_key: "cost_model",
    title: "Cost Models",
    blurb: "How the service is funded or charged. Internal field.",
  },
  {
    field_key: "hours_of_coverage",
    title: "Hours of Coverage",
    blurb: "When the service is staffed or available.",
  },
  {
    field_key: "delivery_model",
    title: "Delivery Models",
    blurb: "Managed, co-managed, advisory, project, or self-service.",
  },
  {
    field_key: "team",
    title: "Teams",
    blurb: "Shared by the accountable Owner Team and the operating Delivery Team.",
  },
  {
    field_key: "business_unit",
    title: "Business Units",
    blurb: "Starter list. Tailor it per workspace. A later version can grow this into an org tree.",
  },
  {
    field_key: "review_cadence",
    title: "Review Cadences",
    blurb: "Drives the computed next review date. On Change does not calculate one. Shared by services and artifacts.",
  },
  {
    field_key: "artifact_type",
    title: "Artifact Types",
    blurb:
      "Policy, standard, procedure, tool, and guideline. These options are editable. The app does not hard-code the list.",
  },
  {
    field_key: "artifact_status",
    title: "Artifact Statuses",
    blurb:
      "Draft, active, under review, and retired. The retired-but-linked flag follows the code retired. Renaming that label is safe. Changing the code turns the flag off.",
  },
  {
    field_key: "intake_method",
    title: "Intake Methods",
    blurb: "How a request arrives. Practical starter set so the intake dropdown is usable on day one.",
  },
  {
    field_key: "target_audience",
    title: "Target Audiences",
    blurb: "Multi-select audiences. Practical starter set for the V1 audience field.",
  },
  {
    field_key: "data_residency_region",
    title: "Data residency regions",
    blurb: "Operational regions a workspace can record. Choosing one does not decide which residency law applies.",
  },
  {
    field_key: "hosting_model",
    title: "Hosting model",
    blurb: "Where the workspace says the service is hosted. Not a sovereignty or contract finding.",
  },
  {
    field_key: "personal_data_recorded",
    title: "Personal data recorded",
    blurb: "Whether the workspace has recorded that the service handles personal data. Not a legal classification.",
  },
  {
    field_key: "recorded_jurisdiction",
    title: "Recorded jurisdictions",
    blurb: "Jurisdictions the workspace has noted. Not a finding that a privacy law applies.",
  },
];

export const STARTER_LOOKUPS: LookupSeed[] = [
  ...rows("service_tier", [
    {
      code: "tier_0",
      label: "Tier 0 — Mission-Critical / Crown Jewel",
      description:
        "Failure immediately exposes the organization or halts operations (e.g., SSO/IAM, 24×7 SOC detection & IR, secrets/key management). Highest resilience, tightest SLAs, zero single-person dependencies.",
    },
    {
      code: "tier_1",
      label: "Tier 1 — Core Operational",
      description:
        "Everyday defensive controls where degradation creates material exposure within hours (e.g., EDR, vulnerability scanning, cloud posture, firewall/WAF ops).",
    },
    {
      code: "tier_2",
      label: "Tier 2 — Standard Programmatic",
      description:
        "Scheduled or business-hours security functions (e.g., pen tests, third-party risk assessments, architecture reviews, access recertifications).",
    },
    {
      code: "tier_3",
      label: "Tier 3 — Advisory & Enablement",
      description:
        "Consultative or best-effort services (e.g., awareness training, policy consultations, tabletop exercises).",
    },
  ]),
  ...rows("category", [
    {
      code: "grc",
      label: "Governance, Risk & Compliance",
      code_prefix: "GRC",
      description: "Policies, risk decisions, control assurance, and the management system around them.",
    },
    {
      code: "secops",
      label: "Security Operations & Monitoring",
      code_prefix: "SOC",
      description: "Monitoring, detection, and the day-to-day operational watch.",
    },
    {
      code: "incident_response",
      label: "Incident Response & Forensics",
      code_prefix: "IRF",
      description: "Response, containment, recovery coordination, and investigative work after a detection.",
    },
    {
      code: "vuln_mgmt",
      label: "Vulnerability & Exposure Management",
      code_prefix: "VUL",
      description: "Finding, prioritizing, and driving down exploitable weakness.",
    },
    {
      code: "iam",
      label: "Identity & Access Management",
      code_prefix: "IAM",
      description: "Workforce and privileged identity, authentication, and access decisions.",
    },
    {
      code: "network",
      label: "Network Security",
      code_prefix: "NET",
      description: "Perimeter, segmentation, and network control operations.",
    },
    {
      code: "endpoint",
      label: "Endpoint Security",
      code_prefix: "END",
      description: "Protection and response on user devices, servers, and managed endpoints.",
    },
    {
      code: "cloud_infra",
      label: "Cloud & Infrastructure Security",
      code_prefix: "CLD",
      description: "Cloud posture, infrastructure baselines, and platform guardrails.",
    },
    {
      code: "appsec",
      label: "Application & Product Security",
      code_prefix: "APP",
      description: "Secure design, testing, and remediation for software the organization builds or buys.",
    },
    {
      code: "data_privacy",
      label: "Data Privacy & Protection",
      code_prefix: "PRV",
      description: "Privacy obligations, data protection, and handling of sensitive information.",
    },
    {
      code: "ai_security",
      label: "AI Security & Governance",
      code_prefix: "AIS",
      description: "Review and control of AI systems, model use, and related risk.",
    },
    {
      code: "sec_architecture",
      label: "Security Architecture & Engineering",
      code_prefix: "ARC",
      description: "Reference architectures, security engineering, and design review.",
    },
    {
      code: "third_party",
      label: "Third-Party & Vendor Risk",
      code_prefix: "TPR",
      description: "Assessment and oversight of suppliers and other outside parties.",
    },
    {
      code: "awareness",
      label: "Security Awareness & Training",
      code_prefix: "SAT",
      description: "Education, phishing exercises, and workforce security behavior.",
    },
  ]),
  ...rows("status", [
    { code: "draft", label: "Draft", description: "Work in progress; not published to clients." },
    { code: "planned", label: "Planned", description: "Committed on the roadmap; not yet live." },
    { code: "pilot", label: "Pilot", description: "Limited rollout / soft launch." },
    { code: "active", label: "Active", description: "In production and offered." },
    { code: "deprecated", label: "Deprecated", description: "Still running; do not start new consumers." },
    { code: "retired", label: "Retired", description: "Fully decommissioned; retained for history." },
  ]),
  ...rows("capability_rating", [
    {
      code: "full",
      label: "Full",
      description: "Service fully delivers the intended capability for its declared scope.",
    },
    {
      code: "partial",
      label: "Partial",
      description: "Material capability exists, but known gaps remain in coverage, hours, or tooling.",
    },
    {
      code: "none",
      label: "None",
      description: "Capability is planned or aspirational; not currently delivered.",
    },
  ]),
  ...rows("maturity_cmmi", [
    {
      code: "0",
      label: "0 — Incomplete",
      description: "Work is not performed or is performed in an ad-hoc, incomplete way.",
    },
    {
      code: "1",
      label: "1 — Initial",
      description: "Unpredictable, reactive; success depends on heroes.",
    },
    {
      code: "2",
      label: "2 — Managed",
      description: "Planned, performed, measured, and controlled at the work-group level.",
    },
    {
      code: "3",
      label: "3 — Defined",
      description: "Organization-wide standards; proactive and consistent.",
    },
    {
      code: "4",
      label: "4 — Quantitatively Managed",
      description: "Quantitative objectives; statistical/predictive control.",
    },
    {
      code: "5",
      label: "5 — Optimizing",
      description: "Stable and flexible; continuous improvement focused on performance.",
    },
  ]),
  ...rows("primary_csf_function", [
    {
      code: "govern",
      label: "Govern",
      description:
        "Establish, communicate, and monitor the organization’s cybersecurity risk management strategy, expectations, and policy.",
    },
    {
      code: "identify",
      label: "Identify",
      description: "Understand the organization’s current cybersecurity risks.",
    },
    {
      code: "protect",
      label: "Protect",
      description: "Use safeguards to manage the organization’s cybersecurity risks.",
    },
    {
      code: "detect",
      label: "Detect",
      description: "Find and analyze possible cybersecurity attacks and compromises.",
    },
    {
      code: "respond",
      label: "Respond",
      description: "Act on a detected cybersecurity incident.",
    },
    {
      code: "recover",
      label: "Recover",
      description: "Restore assets and operations that a cybersecurity incident affected.",
    },
  ]),
  ...rows("outcome_coverage", [
    {
      code: "full",
      label: "Full",
      description:
        "This service addresses the outcome, as assessed by this workspace. Full is not a certification and does not add partial credit from other services.",
    },
    {
      code: "partial",
      label: "Partial",
      description:
        "This service addresses part of the outcome. Partial is not half of a full assessment and is not added into a percentage.",
    },
    {
      code: "none",
      label: "None",
      description:
        "An assessor recorded that this service does not address the outcome. None is different from leaving the outcome unmapped.",
    },
  ]),
  ...rows("data_classification", [
    { code: "public", label: "Public", description: "Approved for unrestricted disclosure." },
    {
      code: "internal",
      label: "Internal",
      description: "Internal use; not for external release without review.",
    },
    {
      code: "confidential",
      label: "Confidential",
      description: "Sensitive business or personal data; need-to-know.",
    },
    {
      code: "restricted",
      label: "Restricted",
      description: "Highest sensitivity (secrets, regulated PII/PHI, crown-jewel data).",
    },
  ]),
  ...rows("cost_model", [
    {
      code: "no_charge_core",
      label: "No Charge / Core Funded",
      description: "Funded as part of the core security program. Not charged per request.",
    },
    { code: "fixed_fee", label: "Fixed Fee", description: "A set fee for an agreed scope." },
    { code: "per_user", label: "Per User", description: "Charged or allocated per person covered." },
    { code: "per_asset", label: "Per Asset", description: "Charged or allocated per system or asset." },
    {
      code: "per_engagement",
      label: "Per Engagement",
      description: "Priced each time the service is requested.",
    },
    { code: "subscription", label: "Subscription", description: "Recurring subscription or retainer." },
  ]),
  ...rows("hours_of_coverage", [
    { code: "24x7x365", label: "24×7×365", description: "Staffed or monitored every hour of the year." },
    { code: "extended_12x5", label: "Extended (12×5)", description: "Extended weekday hours, typically twelve by five." },
    { code: "business_8x5", label: "Business Hours (8×5)", description: "Standard business hours on weekdays." },
    { code: "on_call", label: "On-Call", description: "Reached through an on-call rotation rather than a staffed queue." },
    { code: "on_request", label: "On Request", description: "Available when requested, without standing coverage." },
    {
      code: "scheduled_periodic",
      label: "Scheduled / Periodic",
      description: "Runs on a calendar, such as monthly or quarterly, rather than continuously.",
    },
  ]),
  ...rows("delivery_model", [
    {
      code: "managed_continuous",
      label: "Managed / Continuous",
      description: "Operated as an ongoing managed service.",
    },
    {
      code: "co_managed",
      label: "Co-Managed",
      description: "Shared between the security organization and another team or provider.",
    },
    {
      code: "advisory_consulting",
      label: "Advisory / Consulting",
      description: "Advice and guidance. The consumer remains the operator.",
    },
    {
      code: "project_assessment",
      label: "Project / Assessment",
      description: "A bounded project, review, or assessment.",
    },
    {
      code: "automated_self_service",
      label: "Automated / Self-Service",
      description: "The consumer starts it themselves through a portal or automation.",
    },
  ]),
  ...rows("team", [
    {
      code: "corp_security_grc",
      label: "Corporate Security / GRC",
      description: "Often the accountable owner team.",
    },
    { code: "soc", label: "SOC / SecOps", description: "Owner or delivery. The operational watch." },
    {
      code: "iam",
      label: "Identity & Access Management",
      description: "Owner or delivery for identity services.",
    },
    { code: "appsec", label: "Application Security", description: "Owner or delivery for product and application security." },
    {
      code: "privacy_ai_gov",
      label: "Privacy & AI Governance",
      description: "Owner or delivery for privacy and AI governance.",
    },
    {
      code: "sec_engineering",
      label: "Security Engineering",
      description: "Owner or delivery for security engineering and architecture support.",
    },
    {
      code: "vciso_leadership",
      label: "vCISO / Security Leadership",
      description: "Often the accountable owner for leadership and program services.",
    },
    {
      code: "it_infrastructure",
      label: "IT Infrastructure",
      description: "Often the operating delivery team when IT runs the control.",
    },
    { code: "service_desk", label: "Service Desk", description: "Often the delivery path for intake and user-facing support." },
    { code: "cloud_engineering", label: "Cloud Engineering", description: "Often the delivery team for cloud platforms." },
    { code: "external_mssp", label: "External MSSP", description: "Often the delivery team when a provider operates the service." },
  ]),
  ...rows("business_unit", [
    { code: "enterprise", label: "Enterprise / Corporate", description: "Company-wide or corporate functions." },
    { code: "technology", label: "Technology / IT", description: "Technology, product platforms, or central IT." },
    { code: "operations", label: "Operations", description: "Operational business units." },
    { code: "finance", label: "Finance", description: "Finance and related control functions." },
    { code: "hr", label: "Human Resources", description: "People and workforce functions." },
    { code: "product", label: "Product / R&D", description: "Product, engineering, or research organizations." },
    {
      code: "customer_facing",
      label: "Customer-Facing Business Units",
      description: "Units that serve customers directly.",
    },
    { code: "other", label: "Other / Cross-Functional", description: "Cross-functional, or a unit not listed yet." },
  ]),
  ...rows("review_cadence", [
    { code: "monthly", label: "Monthly", description: "Adds 1 month to the last reviewed date." },
    { code: "quarterly", label: "Quarterly", description: "Adds 3 months to the last reviewed date." },
    { code: "semi_annual", label: "Semi-Annual", description: "Adds 6 months to the last reviewed date." },
    { code: "annual", label: "Annual", description: "Adds 12 months to the last reviewed date." },
    {
      code: "on_change",
      label: "On Change",
      description: "No automatic next date. Review when the service changes.",
    },
  ]),
  ...rows("intake_method", [
    { code: "itsm_ticket", label: "ITSM / Ticket", description: "Request opens a ticket in the work-management tool." },
    { code: "self_service_portal", label: "Self-Service Portal", description: "The consumer submits through a portal or form." },
    { code: "email", label: "Email Request", description: "Request arrives by email to a named mailbox." },
    { code: "chat", label: "Chat / Collaboration Channel", description: "Request arrives in an agreed chat channel." },
    { code: "scheduled", label: "Scheduled / Recurring", description: "The service runs on a schedule without a per-request intake." },
    { code: "account_team", label: "Account Team Request", description: "The account or relationship owner submits the request." },
  ]),
  ...rows("target_audience", [
    { code: "all_workforce", label: "All Workforce", description: "Every employee and contractor in scope." },
    { code: "executives", label: "Executives & Board", description: "Senior leadership and board audiences." },
    { code: "it_engineering", label: "IT & Engineering", description: "Technology operators and builders." },
    { code: "security_team", label: "Security Team", description: "The security organization itself." },
    { code: "business_owners", label: "Business Owners", description: "Owners of business processes and services." },
    { code: "external_parties", label: "External Parties", description: "Suppliers, partners, or other outside parties." },
    { code: "customers", label: "Customers", description: "The organization’s customers." },
  ]),
  ...rows("data_residency_region", [
    { code: "not_recorded", label: "Not recorded", description: "The workspace has not recorded a region." },
    { code: "customer_environment", label: "Customer environment", description: "The service runs in the customer’s own environment." },
    { code: "on_premises", label: "On premises", description: "The workspace records this service as on premises." },
    { code: "us", label: "United States", description: "A United States region the workspace recorded. Not a legal conclusion." },
    { code: "ca", label: "Canada", description: "A Canada region the workspace recorded. Not a legal conclusion." },
    { code: "uk", label: "United Kingdom", description: "A United Kingdom region the workspace recorded. Not a legal conclusion." },
    { code: "eea", label: "European Economic Area", description: "An EEA region the workspace recorded. Not a legal conclusion." },
    { code: "apac", label: "Asia Pacific", description: "An Asia Pacific region the workspace recorded. Not a legal conclusion." },
    { code: "latam", label: "Latin America", description: "A Latin America region the workspace recorded. Not a legal conclusion." },
    { code: "other", label: "Other recorded region", description: "Another region named in the service notes." },
  ]),
  ...rows("hosting_model", [
    { code: "not_recorded", label: "Not recorded", description: "The workspace has not recorded a hosting model." },
    { code: "customer_environment", label: "Customer environment", description: "Hosted in the customer’s environment." },
    { code: "on_premises", label: "On premises", description: "Hosted on premises." },
    { code: "single_region", label: "Single region", description: "The workspace records a single hosting region." },
    { code: "multi_region", label: "Multiple regions", description: "The workspace records more than one hosting region." },
  ]),
  ...rows("personal_data_recorded", [
    { code: "not_recorded", label: "Not recorded", description: "The workspace has not recorded whether personal data is handled." },
    { code: "no", label: "No", description: "The workspace recorded that this service does not handle personal data." },
    { code: "yes", label: "Yes", description: "The workspace recorded that this service handles personal data. This is not a legal classification." },
  ]),
  ...rows("artifact_type", [
    {
      code: "policy",
      label: "Policy",
      description: "A management statement of what the organization requires.",
    },
    {
      code: "standard",
      label: "Standard",
      description: "Mandatory rules that make a policy specific enough to follow.",
    },
    {
      code: "procedure",
      label: "Procedure / Runbook",
      description: "Steps a person or team follows. Includes runbooks and playbooks.",
    },
    {
      code: "tool",
      label: "Tool",
      description: "A product or system the service uses. The link opens the tool or its record.",
    },
    {
      code: "guideline",
      label: "Guideline",
      description: "Recommended practice. Not mandatory the way a standard is. Retire this option if the workspace does not use guidelines.",
    },
  ]),
  ...rows("artifact_status", [
    { code: "draft", label: "Draft", description: "Started, and not yet in force." },
    { code: "active", label: "Active", description: "In force and expected to be current." },
    { code: "under_review", label: "Under Review", description: "Being revised. Still the version people should use until it is replaced." },
    {
      code: "retired",
      label: "Retired",
      description: "No longer in force. A link that remains is a stale-documentation flag, not a recommendation.",
    },
  ]),
  ...rows("recorded_jurisdiction", [
    { code: "not_recorded", label: "Not recorded", description: "The workspace has not recorded a jurisdiction." },
    { code: "us", label: "United States", description: "Noted by the workspace. Not a finding that a US privacy law applies." },
    { code: "ca", label: "Canada", description: "Noted by the workspace. Not a finding that a Canadian privacy law applies." },
    { code: "uk", label: "United Kingdom", description: "Noted by the workspace. Not a finding that a UK privacy law applies." },
    { code: "eea", label: "European Economic Area", description: "Noted by the workspace. Not a finding that an EEA privacy law applies." },
    { code: "other", label: "Other", description: "Another jurisdiction named in the service notes." },
  ]),
];

export function activeOptions<T extends { field_key: string; is_active: boolean; sort_order: number; label: string }>(
  lookups: T[],
  fieldKey: string,
): T[] {
  return lookups
    .filter((option) => option.field_key === fieldKey && option.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function withLookupActive<T extends { id: string; is_active: boolean }>(
  lookups: T[],
  id: string,
  isActive: boolean,
): T[] {
  return lookups.map((option) => (option.id === id ? { ...option, is_active: isActive } : option));
}

export function optionByCode<T extends { field_key: string; code: string }>(
  lookups: T[],
  fieldKey: string,
  code: string | null | undefined,
): T | undefined {
  if (!code) return undefined;
  return lookups.find((option) => option.field_key === fieldKey && option.code === code);
}

export function optionLabel(
  lookups: Array<{ field_key: string; code: string; label: string }>,
  fieldKey: string,
  code: string | null | undefined,
): string {
  if (!code) return "";
  return optionByCode(lookups, fieldKey, code)?.label ?? code;
}
