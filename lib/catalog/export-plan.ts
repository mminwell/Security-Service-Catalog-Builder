import type { FieldDefinition, Visibility } from "@/lib/catalog/types";

export const INTERNAL_EXPORT_CONFIRMATION =
  "This contains internal-use-only data. Please do not share it externally.";

export const PUBLIC_PRESET_NAME = "Public catalog";
export const FULL_PRESET_NAME = "Full catalog";

export type ExportFormat = "csv" | "xlsx" | "docx" | "pdf" | "jira" | "servicenow";

export type ResolvedExport = {
  fields: FieldDefinition[];
  excludedInternal: FieldDefinition[];
  excludedRetired: string[];
  /** Audience of the file that will be written. Internal whenever an included field is internal. */
  audience: Visibility;
  declaredAudience: Visibility;
  requiresConfirmation: boolean;
  profileName: string;
  profileId: string | null;
};

/** Public files keep the service name. Service code is included only in a full export, or when an admin has marked that field public. */
function forcedKeys(audience: Visibility): string[] {
  return audience === "public" ? ["name"] : ["service_code", "name"];
}

export function resolveExportSelection(args: {
  fields: FieldDefinition[];
  declaredAudience: Visibility;
  /** Null selects every active field allowed for the declared audience. */
  requestedKeys: string[] | null;
  profileName: string;
  profileId: string | null;
}): ResolvedExport {
  const excludedRetired: string[] = [];
  const excludedInternal: FieldDefinition[] = [];
  const ordered: FieldDefinition[] = [];
  const seen = new Set<string>();

  const pool =
    args.requestedKeys == null
      ? [...args.fields].sort((a, b) => a.sort_order - b.sort_order).map((field) => field.field_key)
      : args.requestedKeys;

  for (const key of pool) {
    if (seen.has(key)) continue;
    seen.add(key);
    const field = args.fields.find((item) => item.field_key === key);
    if (!field) continue;
    if (!field.is_active) {
      if (args.requestedKeys != null) excludedRetired.push(key);
      continue;
    }
    if (args.declaredAudience === "public" && field.visibility === "internal") {
      excludedInternal.push(field);
      continue;
    }
    ordered.push(field);
  }

  const forced = forcedKeys(args.declaredAudience)
    .map((key) => args.fields.find((field) => field.field_key === key))
    .filter((field): field is FieldDefinition => {
      if (!field || !field.is_active) return false;
      return args.declaredAudience === "internal" || field.visibility === "public";
    });
  const forcedSet = new Set(forced.map((field) => field.field_key));
  const fields = [...forced, ...ordered.filter((field) => !forcedSet.has(field.field_key))];
  const audience: Visibility = fields.some((field) => field.visibility === "internal") ? "internal" : "public";

  return {
    fields,
    excludedInternal,
    excludedRetired,
    audience,
    declaredAudience: args.declaredAudience,
    requiresConfirmation: audience === "internal",
    profileName: args.profileName,
    profileId: args.profileId,
  };
}

export function publicPreset(fields: FieldDefinition[]): ResolvedExport {
  return resolveExportSelection({
    fields,
    declaredAudience: "public",
    requestedKeys: null,
    profileName: PUBLIC_PRESET_NAME,
    profileId: null,
  });
}

export function fullPreset(fields: FieldDefinition[]): ResolvedExport {
  return resolveExportSelection({
    fields,
    declaredAudience: "internal",
    requestedKeys: null,
    profileName: FULL_PRESET_NAME,
    profileId: null,
  });
}

/** Saving a public profile cannot keep internal fields, including an internal service code. */
export function keysForSavedProfile(fields: FieldDefinition[], requestedKeys: string[], audience: Visibility): string[] {
  const resolved = resolveExportSelection({
    fields,
    declaredAudience: audience,
    requestedKeys,
    profileName: "profile",
    profileId: null,
  });
  return resolved.fields.map((field) => field.field_key);
}

export type ExportLogMeta = {
  format: string;
  profile_id: string | null;
  profile_name: string;
  audience: Visibility;
  field_count: number;
  row_count: number;
  marking: boolean;
  framework_codes: string[];
};

/** Drop anything that is not export metadata. Service values never belong here. */
export function sanitizeExportLog(input: ExportLogMeta): ExportLogMeta {
  const codes = Array.isArray(input.framework_codes) ? input.framework_codes : [];
  return {
    format: String(input.format ?? "").slice(0, 32),
    profile_id: input.profile_id ? String(input.profile_id).slice(0, 80) : null,
    profile_name: String(input.profile_name ?? "").slice(0, 120),
    audience: input.audience === "internal" ? "internal" : "public",
    field_count: Number.isFinite(input.field_count) ? Math.max(0, Math.floor(input.field_count)) : 0,
    row_count: Number.isFinite(input.row_count) ? Math.max(0, Math.floor(input.row_count)) : 0,
    marking: Boolean(input.marking),
    framework_codes: codes.filter((code) => typeof code === "string" && code.trim()).map((code) => code.trim().slice(0, 40)).slice(0, 12),
  };
}

export function exportFileName(slug: string, audience: Visibility, format: ExportFormat): string {
  const who = audience === "public" ? "public" : "full";
  const kind = format === "jira" ? "jira" : format === "servicenow" ? "servicenow" : "catalog";
  const ext = format === "xlsx" || format === "docx" || format === "pdf" ? format : "csv";
  const safe = (slug || "catalog").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "catalog";
  return `${safe}-${kind}-${who}.${ext}`;
}
