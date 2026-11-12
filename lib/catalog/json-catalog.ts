import { ARTIFACT_EXPORT_COLUMNS, ARTIFACT_STATUS_KEY, ARTIFACT_TYPE_KEY, artifactFlags, flagLabels, safeHttpUrl } from "@/lib/catalog/artifacts";
import { exportFileName } from "@/lib/catalog/export-plan";
import { fieldUsesLookup } from "@/lib/catalog/lookup-toggle";
import { optionByCode } from "@/lib/catalog/lookups";
import { localToday } from "@/lib/catalog/present";
import { readField, withComputed } from "@/lib/catalog/service";
import { elementsInScope } from "@/lib/catalog/framework-catalog";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type {
  Artifact,
  ArtifactLink,
  FieldDefinition,
  LookupOption,
  OutcomeMapping,
  ServiceRecord,
  Visibility,
} from "@/lib/catalog/types";

export const CATALOG_JSON_SCHEMA_VERSION = "1.0";
export const CATALOG_JSON_MIME = "application/json";

const CATALOG_NOTE = "This is a service catalog. It is not a certification, an audit report, or a compliance determination.";
const GEO_NOTE = "Geography and privacy fields are workspace records. They are not legal conclusions.";
const COVERAGE_LABEL = { full: "Full", partial: "Partial", none: "None" } as const;

export type CatalogJsonLookup = {
  id: string | null;
  code: string;
  label: string;
};

export type CatalogJsonValue = string | number | boolean | null | CatalogJsonLookup | CatalogJsonLookup[] | string[];

export type CatalogJsonField = {
  key: string;
  label: string;
  value: CatalogJsonValue;
};

export type CatalogJsonArtifact = {
  id: string;
  fields: CatalogJsonField[];
};

export type CatalogJsonMapping = {
  framework: { code: string; version: string; name: string };
  element: { id: string; code: string; title: string; statement: string };
  coverage: { code: string; label: string };
  rationale?: string | null;
  notes?: string | null;
};

export type CatalogJsonService = {
  id: string;
  fields: CatalogJsonField[];
  artifacts: CatalogJsonArtifact[];
  mappings: CatalogJsonMapping[];
};

export type CatalogJsonDocument = {
  schemaVersion: typeof CATALOG_JSON_SCHEMA_VERSION;
  exportedAt: string;
  workspace: { name: string; slug: string; logoUrl?: string };
  export: {
    audience: Visibility;
    profile: { id: string | null; name: string };
    distributionStatement: string | null;
    includedSections: Array<"services" | "artifacts" | "mappings">;
    fieldList: Array<{ key: string; label: string; visibility: Visibility; group: FieldDefinition["field_group"] }>;
    options: {
      distributionMarking: boolean;
      geography: boolean;
      privacy: boolean;
      note: string | null;
      catalogNote: string;
    };
  };
  counts: { services: number; artifacts: number; mappings: number };
  services: CatalogJsonService[];
  unlinkedArtifacts: CatalogJsonArtifact[];
};

export type CatalogJsonArgs = {
  workspaceName: string;
  slug: string;
  logoUrl?: string | null;
  audience: Visibility;
  profileName: string;
  profileId: string | null;
  marking: string | null;
  exportedAt?: string;
  services: ServiceRecord[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
  artifacts?: Artifact[];
  artifactLinks?: ArtifactLink[];
  mappings?: OutcomeMapping[];
  elements?: FrameworkElement[];
  frameworks?: FrameworkRelease[];
  tenantId: string;
  today?: string;
};

/** Filename, MIME, and UTF-8 body the export dialog downloads. */
export function catalogJsonFile(args: CatalogJsonArgs): { filename: string; mime: typeof CATALOG_JSON_MIME; body: string } {
  return {
    filename: exportFileName(args.slug, args.audience, "json"),
    mime: CATALOG_JSON_MIME,
    body: `${JSON.stringify(buildCatalogJson(args), null, 2)}\n`,
  };
}

export function buildCatalogJson(args: CatalogJsonArgs): CatalogJsonDocument {
  const audience = args.audience === "internal" ? "internal" : "public";
  const fields = fieldsForExport(args.fields, audience);
  const geography = fields.some((field) => field.field_group === "geography");
  const privacy = fields.some((field) => field.field_group === "privacy");
  const marking = args.marking?.trim() ? args.marking.trim() : null;
  const lookups = args.lookups;
  const today = args.today ?? localToday();
  const links = args.artifactLinks ?? [];
  const visible = (args.artifacts ?? [])
    .filter((artifact) => audience === "internal" || artifact.visibility === "public")
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const linkedIds = new Set(links.map((link) => link.artifact_id));
  const linkCountByArtifact = new Map<string, number>();
  for (const link of links) linkCountByArtifact.set(link.artifact_id, (linkCountByArtifact.get(link.artifact_id) ?? 0) + 1);
  const services = args.services.map((service) =>
    serviceJson({
      service,
      fields,
      lookups,
      audience,
      artifacts: visible,
      links,
      linkCountByArtifact,
      mappings: args.mappings ?? [],
      elements: args.elements ?? [],
      frameworks: args.frameworks ?? [],
      tenantId: args.tenantId,
      today,
    }),
  );
  const unlinkedArtifacts = visible
    .filter((artifact) => !linkedIds.has(artifact.id))
    .map((artifact) => artifactJson(artifact, null, 0, audience, lookups, today));
  const artifactIds = new Set<string>();
  for (const service of services) {
    for (const artifact of service.artifacts) artifactIds.add(artifact.id);
  }
  for (const artifact of unlinkedArtifacts) artifactIds.add(artifact.id);
  const logoUrl = httpsLogoUrl(args.logoUrl);

  return {
    schemaVersion: CATALOG_JSON_SCHEMA_VERSION,
    exportedAt: isoTimestamp(args.exportedAt),
    workspace: {
      name: args.workspaceName,
      slug: args.slug,
      ...(logoUrl ? { logoUrl } : {}),
    },
    export: {
      audience,
      profile: { id: args.profileId, name: args.profileName },
      distributionStatement: marking,
      includedSections: ["services", "artifacts", "mappings"],
      fieldList: fields.map((field) => ({
        key: field.field_key,
        label: field.label,
        visibility: field.visibility,
        group: field.field_group,
      })),
      options: {
        distributionMarking: marking != null,
        geography,
        privacy,
        note: geography || privacy ? GEO_NOTE : null,
        catalogNote: CATALOG_NOTE,
      },
    },
    counts: {
      services: services.length,
      artifacts: artifactIds.size,
      mappings: services.reduce((total, service) => total + service.mappings.length, 0),
    },
    services,
    unlinkedArtifacts,
  };
}

function fieldsForExport(fields: FieldDefinition[], audience: Visibility): FieldDefinition[] {
  return fields.filter((field) => {
    if (!field.is_active) return false;
    if (audience === "public" && field.visibility !== "public") return false;
    return true;
  });
}

function serviceJson(args: {
  service: ServiceRecord;
  fields: FieldDefinition[];
  lookups: LookupOption[];
  audience: Visibility;
  artifacts: Artifact[];
  links: ArtifactLink[];
  linkCountByArtifact: Map<string, number>;
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  tenantId: string;
  today: string;
}): CatalogJsonService {
  const shown = withComputed(args.service);
  const artifacts = args.artifacts.flatMap((artifact) => {
    const related = args.links.filter((link) => link.artifact_id === artifact.id && link.service_id === args.service.id);
    const linkCount = args.linkCountByArtifact.get(artifact.id) ?? related.length;
    return related.map((link) => artifactJson(artifact, link, linkCount, args.audience, args.lookups, args.today));
  });
  return {
    id: args.service.id,
    fields: args.fields.map((field) => ({
      key: field.field_key,
      label: field.label,
      value: fieldValue(shown, field, args.lookups),
    })),
    artifacts,
    mappings: args.service.archived_at ? [] : mappingsForService(args),
  };
}

function mappingsForService(args: {
  service: ServiceRecord;
  audience: Visibility;
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  tenantId: string;
}): CatalogJsonMapping[] {
  const rows: CatalogJsonMapping[] = [];
  for (const framework of args.frameworks) {
    const scoped = elementsInScope(args.elements, framework, args.tenantId);
    const allowed = new Set(scoped.map((element) => element.id));
    const byId = new Map(scoped.map((element) => [element.id, element]));
    for (const mapping of args.mappings) {
      if (mapping.service_id !== args.service.id || !allowed.has(mapping.element_id)) continue;
      const element = byId.get(mapping.element_id);
      if (!element) continue;
      const row: CatalogJsonMapping = {
        framework: { code: framework.code, version: framework.version, name: framework.name },
        element: { id: element.id, code: element.code, title: element.title, statement: element.statement },
        coverage: {
          code: mapping.coverage,
          label: COVERAGE_LABEL[mapping.coverage] ?? mapping.coverage,
        },
      };
      if (args.audience === "internal") {
        row.rationale = mapping.rationale ?? null;
        row.notes = mapping.notes ?? null;
      }
      rows.push(row);
    }
  }
  return rows;
}

function artifactJson(
  artifact: Artifact,
  link: ArtifactLink | null,
  linkCount: number,
  audience: Visibility,
  lookups: LookupOption[],
  today: string,
): CatalogJsonArtifact {
  const columns = ARTIFACT_EXPORT_COLUMNS.filter((column) => audience === "internal" || column.visibility === "public");
  const flags = artifactFlags(artifact, linkCount, today);
  return {
    id: artifact.id,
    fields: columns.map((column) => ({
      key: column.key,
      label: column.label,
      value: artifactFieldValue(artifact, link, column.key, lookups, flags),
    })),
  };
}

function artifactFieldValue(
  artifact: Artifact,
  link: ArtifactLink | null,
  key: string,
  lookups: LookupOption[],
  flags: ReturnType<typeof artifactFlags>,
): CatalogJsonValue {
  switch (key) {
    case "name":
      return textOrNull(artifact.name);
    case "artifact_type":
      return lookupOrNull(lookups, ARTIFACT_TYPE_KEY, artifact.artifact_type);
    case "status":
      return lookupOrNull(lookups, ARTIFACT_STATUS_KEY, artifact.status);
    case "version":
      return textOrNull(artifact.version);
    case "description":
      return textOrNull(artifact.description);
    case "link_url":
      return safeHttpUrl(artifact.link_url);
    case "owner_team":
      return lookupOrNull(lookups, "team", artifact.owner_team);
    case "visibility":
      return artifact.visibility === "public" ? "Public" : "Internal";
    case "review_cadence":
      return lookupOrNull(lookups, "review_cadence", artifact.review_cadence);
    case "last_reviewed_date":
      return textOrNull(artifact.last_reviewed_date);
    case "next_review_date":
      return textOrNull(artifact.next_review_date);
    case "relationship_note":
      return textOrNull(link?.relationship_note);
    case "flags":
      return flagLabels(flags);
    default:
      return null;
  }
}

function fieldValue(service: ServiceRecord, field: FieldDefinition, lookups: LookupOption[]): CatalogJsonValue {
  const value = readField(service, field.field_key);
  if (value == null || value === "") return null;
  if (field.input_type === "boolean" || typeof value === "boolean") return Boolean(value);
  if (Array.isArray(value)) {
    const codes = value.map((item) => String(item)).filter((code) => code.length > 0);
    if (codes.length === 0) return null;
    const fieldKey = field.lookup_field_key ?? field.field_key;
    return codes.map((code) => lookupRef(lookups, fieldKey, code));
  }
  if (fieldUsesLookup(field) && field.lookup_field_key) {
    return lookupRef(lookups, field.lookup_field_key, String(value));
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return String(value);
}

function lookupOrNull(lookups: LookupOption[], fieldKey: string, code: string | null | undefined): CatalogJsonLookup | null {
  const text = code?.trim() ?? "";
  if (!text) return null;
  return lookupRef(lookups, fieldKey, text);
}

function lookupRef(lookups: LookupOption[], fieldKey: string, code: string): CatalogJsonLookup {
  const option = optionByCode(lookups, fieldKey, code);
  return { id: option?.id ?? null, code, label: option?.label ?? code };
}

function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? value?.trim() ?? text : null;
}

function isoTimestamp(value: string | undefined): string {
  if (value && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

/** An https URL with no userinfo. Data URLs and other schemes stay out of the file. */
function httpsLogoUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("https://")) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
