import { nextReviewDate } from "@/lib/catalog/compute";
import { parseCsv } from "@/lib/catalog/lookup-csv";
import { optionLabel } from "@/lib/catalog/lookups";
import type { Artifact, ArtifactLink, FieldDefinition, LookupOption, ServiceRecord, Visibility } from "@/lib/catalog/types";

/** Stable lookup group. Options live in lookup_options and stay editable in Lookups. */
export const ARTIFACT_TYPE_KEY = "artifact_type";
/** Stable lookup group. The retired-but-linked flag follows the code `retired`. */
export const ARTIFACT_STATUS_KEY = "artifact_status";
export const RETIRED_STATUS_CODE = "retired";

const NAME_MAX = 160;
const VERSION_MAX = 40;
const DESCRIPTION_MAX = 500;
const URL_MAX = 2000;

export type ArtifactFlags = {
  overdue: boolean;
  retiredLinked: boolean;
};

export type ArtifactHint = {
  artifact_type: string;
  name: string;
  note: string;
};

/**
 * Hints only. Checkout does not create these documents.
 * A handful of blueprints suggest the artifact types a security leader would expect to attach later.
 */
export const BLUEPRINT_ARTIFACT_HINTS: Record<string, ArtifactHint[]> = {
  "soc-monitoring": [
    { artifact_type: "standard", name: "Detection standard", note: "What the monitoring service is expected to watch." },
    { artifact_type: "procedure", name: "Escalation runbook", note: "How the watch hands a case to incident response." },
    { artifact_type: "tool", name: "SIEM or case tool", note: "Where detections and cases actually live." },
  ],
  "ir-retainer": [
    { artifact_type: "policy", name: "Incident response plan", note: "The plan the retainer executes. This hint does not create the document." },
    { artifact_type: "procedure", name: "Severity and escalation runbook", note: "The steps the on-call follows." },
  ],
  "vul-mgmt": [
    { artifact_type: "standard", name: "Vulnerability remediation standard", note: "Severity timelines the service follows." },
    { artifact_type: "tool", name: "Scanner", note: "The tool that produces findings." },
  ],
  "grc-policy": [
    { artifact_type: "policy", name: "Information security policy", note: "The policy this service maintains." },
    { artifact_type: "standard", name: "Control standards", note: "The standards under that policy." },
  ],
  "iam-lifecycle": [
    { artifact_type: "procedure", name: "Joiner, mover, and leaver procedure", note: "The runbook for account changes." },
    { artifact_type: "tool", name: "Identity provider", note: "Where workforce accounts live." },
  ],
};

export function hintsForBlueprint(blueprintId: string): ArtifactHint[] {
  return BLUEPRINT_ARTIFACT_HINTS[blueprintId] ?? [];
}

/** Accept only http and https. Reject javascript:, data:, and anything the URL parser will not open as a web link. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > URL_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

export function assertHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const safe = safeHttpUrl(trimmed);
  if (!safe) throw new Error("Link must be an http or https URL.");
  return safe;
}

export function withArtifactComputed<T extends Pick<Artifact, "last_reviewed_date" | "review_cadence" | "next_review_date">>(
  artifact: T,
): T {
  return {
    ...artifact,
    next_review_date: nextReviewDate(artifact.last_reviewed_date, artifact.review_cadence),
  };
}

export function artifactFlags(
  artifact: Pick<Artifact, "status" | "next_review_date">,
  linkCount: number,
  today: string,
): ArtifactFlags {
  const retired = artifact.status === RETIRED_STATUS_CODE;
  const due = artifact.next_review_date?.slice(0, 10) ?? "";
  return {
    overdue: !retired && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < today.slice(0, 10),
    retiredLinked: retired && linkCount > 0,
  };
}

export function flagLabels(flags: ArtifactFlags): string[] {
  const labels: string[] = [];
  if (flags.overdue) labels.push("Overdue for review");
  if (flags.retiredLinked) labels.push("Retired but still linked");
  return labels;
}

function cleanText(value: string | null | undefined, max: number, label: string): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

function cleanDate(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Last reviewed must be a YYYY-MM-DD date.");
  return text;
}

export function normalizeArtifact(input: Artifact): Artifact {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Name the artifact.");
  if (name.length > NAME_MAX) throw new Error(`Name must be ${NAME_MAX} characters or fewer.`);
  const artifact_type = input.artifact_type?.trim() ?? "";
  if (!artifact_type) throw new Error("Choose an artifact type.");
  const visibility: Visibility = input.visibility === "public" ? "public" : "internal";
  return withArtifactComputed({
    ...input,
    name,
    artifact_type,
    owner_team: cleanText(input.owner_team, 80, "Owner team"),
    status: cleanText(input.status, 80, "Status"),
    version: cleanText(input.version, VERSION_MAX, "Version"),
    review_cadence: cleanText(input.review_cadence, 80, "Review cadence"),
    last_reviewed_date: cleanDate(input.last_reviewed_date),
    link_url: assertHttpUrl(input.link_url),
    description: cleanText(input.description, DESCRIPTION_MAX, "Description"),
    visibility,
    next_review_date: null,
  });
}

export function emptyArtifact(tenantId: string, id: string, now: string): Artifact {
  return {
    id,
    tenant_id: tenantId,
    name: "",
    artifact_type: "",
    owner_team: null,
    status: "draft",
    version: null,
    review_cadence: null,
    last_reviewed_date: null,
    next_review_date: null,
    link_url: null,
    description: null,
    visibility: "internal",
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
  };
}

export type ArtifactExportColumn = {
  key: string;
  label: string;
  /** Public exports include this column only for artifacts whose own visibility is public. */
  visibility: Visibility;
};

/**
 * Artifact-level visibility gates the whole record.
 * These columns are the artifact fields. Public exports keep only the public columns of public artifacts.
 * Owner, cadence, review dates, visibility, the relationship note, and flags stay internal even on a public artifact.
 */
export const ARTIFACT_EXPORT_COLUMNS: ArtifactExportColumn[] = [
  { key: "name", label: "Artifact", visibility: "public" },
  { key: "artifact_type", label: "Type", visibility: "public" },
  { key: "status", label: "Status", visibility: "public" },
  { key: "version", label: "Version", visibility: "public" },
  { key: "description", label: "Description", visibility: "public" },
  { key: "link_url", label: "Link", visibility: "public" },
  { key: "owner_team", label: "Owner team", visibility: "internal" },
  { key: "visibility", label: "Visibility", visibility: "internal" },
  { key: "review_cadence", label: "Review cadence", visibility: "internal" },
  { key: "last_reviewed_date", label: "Last reviewed", visibility: "internal" },
  { key: "next_review_date", label: "Next review", visibility: "internal" },
  { key: "relationship_note", label: "Relationship note", visibility: "internal" },
  { key: "flags", label: "Flags", visibility: "internal" },
];

export type ArtifactExportRow = {
  heading: string;
  cells: Record<string, string>;
};

export function artifactExportRows(args: {
  audience: Visibility;
  includeServiceCode: boolean;
  services: ServiceRecord[];
  artifacts: Artifact[];
  links: ArtifactLink[];
  lookups: LookupOption[];
  today: string;
}): { columns: ArtifactExportColumn[]; rows: ArtifactExportRow[] } {
  const serviceIds = new Set(args.services.map((service) => service.id));
  const serviceById = new Map(args.services.map((service) => [service.id, service]));
  const columns = [
    ...(args.includeServiceCode ? [{ key: "service_code", label: "Service code", visibility: "public" as const }] : []),
    { key: "service_name", label: "Service name", visibility: "public" as const },
    ...ARTIFACT_EXPORT_COLUMNS.filter((column) => args.audience === "internal" || column.visibility === "public"),
  ];
  const rows: ArtifactExportRow[] = [];

  const ordered = [...args.artifacts].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const artifact of ordered) {
    if (args.audience === "public" && artifact.visibility !== "public") continue;
    const related = args.links.filter((link) => link.artifact_id === artifact.id);
    const inExport = related.filter((link) => serviceIds.has(link.service_id));
    const targets = inExport.length > 0 ? inExport : related.length === 0 ? [null] : [];
    for (const link of targets) {
      const service = link ? serviceById.get(link.service_id) : undefined;
      if (link && !service) continue;
      const linkCount = related.length;
      const flags = artifactFlags(artifact, linkCount, args.today);
      const cells: Record<string, string> = {
        service_code: service?.service_code ?? "",
        service_name: service?.name ?? "",
        name: artifact.name,
        artifact_type: optionLabel(args.lookups, ARTIFACT_TYPE_KEY, artifact.artifact_type) || artifact.artifact_type,
        status: optionLabel(args.lookups, ARTIFACT_STATUS_KEY, artifact.status) || artifact.status || "",
        version: artifact.version ?? "",
        description: artifact.description ?? "",
        link_url: safeHttpUrl(artifact.link_url) ?? "",
        owner_team: optionLabel(args.lookups, "team", artifact.owner_team) || artifact.owner_team || "",
        visibility: artifact.visibility === "public" ? "Public" : "Internal",
        review_cadence: optionLabel(args.lookups, "review_cadence", artifact.review_cadence) || artifact.review_cadence || "",
        last_reviewed_date: artifact.last_reviewed_date ?? "",
        next_review_date: artifact.next_review_date ?? "",
        relationship_note: link?.relationship_note ?? "",
        flags: flagLabels(flags).join("; "),
      };
      const heading = service ? `${service.name} · ${artifact.name}` : artifact.name;
      rows.push({ heading, cells });
    }
  }
  return { columns, rows };
}

export function artifactExportMatrix(args: Parameters<typeof artifactExportRows>[0]): { header: string[]; body: string[][] } {
  const table = artifactExportRows(args);
  return {
    header: table.columns.map((column) => column.label),
    body: table.rows.map((row) => table.columns.map((column) => row.cells[column.key] ?? "")),
  };
}

/** Second table for a catalog CSV. No byte-order mark. The caller keeps the marking on this section too. */
export function artifactCsvSection(args: Parameters<typeof artifactExportRows>[0] & { marking: string | null }): string {
  const { header, body } = artifactExportMatrix(args);
  const lines = [
    csvEscapeCell("SUPPORTING ARTIFACTS"),
    ...(args.marking?.trim() ? [csvEscapeCell(args.marking.trim())] : []),
    header.map((cell) => csvEscapeCell(cell)).join(","),
    ...(body.length > 0 ? body.map((row) => row.map((cell) => csvEscapeCell(cell)).join(",")) : [csvEscapeCell("No artifacts in this export.")]),
  ];
  return lines.join("\r\n");
}

function csvEscapeCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function artifactFilterFields(): FieldDefinition[] {
  const base = {
    tenant_id: null,
    help_text: "",
    lookup_bound: false,
    lookup_restore: null,
    visibility_overridden: false,
    is_required: false,
    visibility: "internal" as const,
    depth_level: 1 as const,
    is_active: true,
    is_standard: false,
    field_group: null,
  };
  const specs: Array<Pick<FieldDefinition, "field_key" | "label" | "input_type" | "lookup_field_key" | "sort_order">> = [
    { field_key: "artifact_type", label: "Type", input_type: "dropdown", lookup_field_key: ARTIFACT_TYPE_KEY, sort_order: 10 },
    { field_key: "status", label: "Status", input_type: "dropdown", lookup_field_key: ARTIFACT_STATUS_KEY, sort_order: 20 },
    { field_key: "owner_team", label: "Owner team", input_type: "dropdown", lookup_field_key: "team", sort_order: 30 },
    { field_key: "visibility", label: "Visibility", input_type: "dropdown", lookup_field_key: "artifact_visibility", sort_order: 40 },
    { field_key: "next_review_date", label: "Next review", input_type: "date", lookup_field_key: null, sort_order: 50 },
    { field_key: "artifact_attention", label: "Attention", input_type: "dropdown", lookup_field_key: "artifact_attention", sort_order: 60 },
  ];
  return specs.map((spec) => ({
    ...base,
    ...spec,
    id: `artifact-filter:${spec.field_key}`,
  }));
}

/** Filter-only options. They are not lookup_options and do not appear in Lookups admin. */
export const ARTIFACT_FILTER_LOOKUPS: LookupOption[] = [
  { id: "filter:visibility:public", tenant_id: null, field_key: "artifact_visibility", code: "public", label: "Public", description: null, code_prefix: null, sort_order: 10, is_active: true },
  { id: "filter:visibility:internal", tenant_id: null, field_key: "artifact_visibility", code: "internal", label: "Internal", description: null, code_prefix: null, sort_order: 20, is_active: true },
  { id: "filter:attention:overdue", tenant_id: null, field_key: "artifact_attention", code: "overdue", label: "Overdue for review", description: null, code_prefix: null, sort_order: 10, is_active: true },
  { id: "filter:attention:retired_linked", tenant_id: null, field_key: "artifact_attention", code: "retired_linked", label: "Retired but still linked", description: null, code_prefix: null, sort_order: 20, is_active: true },
];

export function filterArtifacts(args: {
  artifacts: Artifact[];
  links: ArtifactLink[];
  lookups: LookupOption[];
  query: string;
  rules: Array<{ fieldKey: string; op: string; value: string }>;
  today: string;
}): Artifact[] {
  const query = args.query.trim().toLowerCase();
  const counts = linkCounts(args.links);
  return args.artifacts.filter((artifact) => {
    const flags = artifactFlags(artifact, counts.get(artifact.id) ?? 0, args.today);
    for (const rule of args.rules) {
      if (!artifactRuleMatches(artifact, flags, rule)) return false;
    }
    if (!query) return true;
    const haystack = [
      artifact.name,
      artifact.description,
      artifact.version,
      artifact.link_url,
      optionLabel(args.lookups, ARTIFACT_TYPE_KEY, artifact.artifact_type),
      optionLabel(args.lookups, ARTIFACT_STATUS_KEY, artifact.status),
      optionLabel(args.lookups, "team", artifact.owner_team),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function artifactRuleMatches(
  artifact: Artifact,
  flags: ArtifactFlags,
  rule: { fieldKey: string; op: string; value: string },
): boolean {
  if (rule.fieldKey === "artifact_attention") {
    if (rule.value === "overdue") return flags.overdue;
    if (rule.value === "retired_linked") return flags.retiredLinked;
    return false;
  }
  if (rule.fieldKey === "next_review_date") {
    const left = artifact.next_review_date?.slice(0, 10) ?? "";
    const right = rule.value.slice(0, 10);
    if (!left || !/^\d{4}-\d{2}-\d{2}$/.test(right)) return false;
    if (rule.op === "before") return left < right;
    if (rule.op === "after") return left > right;
    return left === right;
  }
  const value =
    rule.fieldKey === "artifact_type"
      ? artifact.artifact_type
      : rule.fieldKey === "status"
        ? artifact.status
        : rule.fieldKey === "owner_team"
          ? artifact.owner_team
          : rule.fieldKey === "visibility"
            ? artifact.visibility
            : null;
  return value != null && value === rule.value;
}

export function linkCounts(links: ArtifactLink[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const link of links) counts.set(link.artifact_id, (counts.get(link.artifact_id) ?? 0) + 1);
  return counts;
}

export function linksForService(links: ArtifactLink[], serviceId: string): ArtifactLink[] {
  return links.filter((link) => link.service_id === serviceId);
}

export function linksForArtifact(links: ArtifactLink[], artifactId: string): ArtifactLink[] {
  return links.filter((link) => link.artifact_id === artifactId);
}

export type ArtifactColumnMap = {
  name: number | null;
  artifact_type: number | null;
  owner_team: number | null;
  status: number | null;
  version: number | null;
  review_cadence: number | null;
  last_reviewed_date: number | null;
  link_url: number | null;
  description: number | null;
  visibility: number | null;
};

export type PlannedArtifactImport = {
  name: string;
  artifact_type: string;
  owner_team: string | null;
  status: string | null;
  version: string | null;
  review_cadence: string | null;
  last_reviewed_date: string | null;
  link_url: string | null;
  description: string | null;
  visibility: Visibility;
  action: "create" | "update";
  matchId: string | null;
};

export type ArtifactImportPlan = {
  totalRows: number;
  skippedBlank: number;
  creates: number;
  updates: number;
  preview: PlannedArtifactImport[];
  rows: PlannedArtifactImport[];
  errors: string[];
};

const IMPORT_HEADERS: Record<keyof ArtifactColumnMap, string[]> = {
  name: ["name", "artifact", "title"],
  artifact_type: ["type", "artifact_type"],
  owner_team: ["owner_team", "owner", "team"],
  status: ["status"],
  version: ["version"],
  review_cadence: ["review_cadence", "cadence"],
  last_reviewed_date: ["last_reviewed", "last_reviewed_date", "reviewed"],
  link_url: ["link", "url", "link_url"],
  description: ["description", "summary"],
  visibility: ["visibility"],
};

export function artifactTemplateCsv(): string {
  const header = ["Name", "Type", "Owner team", "Status", "Version", "Review cadence", "Last reviewed", "Link", "Description", "Visibility"];
  const example = [
    "Example access standard",
    "Standard",
    "Identity & Access Management",
    "Active",
    "1.0",
    "Annual",
    "2026-01-15",
    "https://example.com/policies/access",
    "Who may request production access.",
    "Internal",
  ];
  return `\uFEFF${[header, example].map((row) => row.map(csvEscapeCell).join(",")).join("\r\n")}`;
}

export function suggestArtifactColumnMap(headers: string[]): ArtifactColumnMap {
  const normalized = headers.map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  const map = {} as ArtifactColumnMap;
  for (const key of Object.keys(IMPORT_HEADERS) as Array<keyof ArtifactColumnMap>) {
    map[key] = findHeader(normalized, IMPORT_HEADERS[key]);
  }
  return map;
}

export function planArtifactImport(args: {
  table: string[][];
  map: ArtifactColumnMap;
  lookups: LookupOption[];
  existing: Artifact[];
}): ArtifactImportPlan {
  if (args.table.length === 0) return emptyImport(["The file has no rows."]);
  if (args.map.name == null) return emptyImport(["Map a column to Name."]);
  if (args.map.artifact_type == null) return emptyImport(["Map a column to Type."]);
  const body = args.table.slice(1);
  const errors: string[] = [];
  const planned = new Map<string, PlannedArtifactImport>();
  let skippedBlank = 0;
  body.forEach((cells, index) => {
    const line = index + 2;
    const name = cell(cells, args.map.name).trim();
    if (!name) {
      skippedBlank += 1;
      return;
    }
    try {
      const artifact_type = resolveOption(args.lookups, ARTIFACT_TYPE_KEY, cell(cells, args.map.artifact_type), "Type", true);
      const owner_team = resolveOption(args.lookups, "team", cell(cells, args.map.owner_team), "Owner team", false);
      const status = resolveOption(args.lookups, ARTIFACT_STATUS_KEY, cell(cells, args.map.status), "Status", false);
      const review_cadence = resolveOption(args.lookups, "review_cadence", cell(cells, args.map.review_cadence), "Review cadence", false);
      const visibility = parseVisibility(cell(cells, args.map.visibility));
      const draft = normalizeArtifact({
        id: "import",
        tenant_id: "import",
        name,
        artifact_type: artifact_type ?? "",
        owner_team,
        status,
        version: cell(cells, args.map.version),
        next_review_date: null,
        review_cadence,
        last_reviewed_date: cell(cells, args.map.last_reviewed_date),
        link_url: cell(cells, args.map.link_url),
        description: cell(cells, args.map.description),
        visibility,
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
      });
      const key = name.toLowerCase();
      const match = args.existing.find((artifact) => artifact.name.toLowerCase() === key) ?? null;
      planned.set(key, {
        name: draft.name,
        artifact_type: draft.artifact_type,
        owner_team: draft.owner_team,
        status: draft.status,
        version: draft.version,
        review_cadence: draft.review_cadence,
        last_reviewed_date: draft.last_reviewed_date,
        link_url: draft.link_url,
        description: draft.description,
        visibility: draft.visibility,
        action: match ? "update" : "create",
        matchId: match?.id ?? null,
      });
    } catch (error) {
      errors.push(`Row ${line}: ${error instanceof Error ? error.message : "Could not read this row."}`);
    }
  });
  const rows = [...planned.values()];
  return {
    totalRows: body.length,
    skippedBlank,
    creates: rows.filter((row) => row.action === "create").length,
    updates: rows.filter((row) => row.action === "update").length,
    preview: rows.slice(0, 8),
    rows,
    errors,
  };
}

export { parseCsv };

function emptyImport(errors: string[]): ArtifactImportPlan {
  return { totalRows: 0, skippedBlank: 0, creates: 0, updates: 0, preview: [], rows: [], errors };
}

function findHeader(headers: string[], names: string[]): number | null {
  const index = headers.findIndex((header) => names.includes(header));
  return index >= 0 ? index : null;
}

function cell(cells: string[], index: number | null): string {
  if (index == null) return "";
  return cells[index] ?? "";
}

function resolveOption(
  lookups: LookupOption[],
  fieldKey: string,
  raw: string,
  label: string,
  required: boolean,
): string | null {
  const text = raw.trim();
  if (!text) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  const needle = text.toLowerCase();
  const match = lookups.find(
    (option) =>
      option.field_key === fieldKey &&
      option.is_active &&
      (option.code.toLowerCase() === needle || option.label.toLowerCase() === needle),
  );
  if (!match) throw new Error(`${label} "${text}" is not an active lookup option.`);
  return match.code;
}

function parseVisibility(raw: string): Visibility {
  const text = raw.trim().toLowerCase();
  if (!text || text === "internal") return "internal";
  if (text === "public") return "public";
  throw new Error("Visibility must be Public or Internal.");
}
