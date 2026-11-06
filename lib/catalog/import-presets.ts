import { formatExportValue } from "@/lib/catalog/export-value";
import { isIdentityField } from "@/lib/catalog/fields";
import { csvEscape } from "@/lib/catalog/spreadsheet-text";
import type { FieldDefinition, LookupOption, ServiceRecord, Visibility } from "@/lib/catalog/types";

export type TargetMapping = {
  id: string;
  target: string;
  sourceKey: string;
  note: string;
};

export type ImportPreset = {
  id: "jira" | "servicenow";
  title: string;
  disclaimer: string;
  columns: Array<Omit<TargetMapping, "id">>;
};

export const JIRA_PRESET: ImportPreset = {
  id: "jira",
  title: "Generic Jira CSV import preset",
  disclaimer:
    "This is a local CSV shaped like a generic Jira issue import. It does not connect to Jira, create issues, or match every Jira Cloud or Data Center project. Your site may require Issue Type, Project key, Priority, or a workflow status that this catalog does not store. Map only the columns you intend to import, then load the file yourself.",
  columns: [
    {
      target: "Summary",
      sourceKey: "name",
      note: "Often required by Jira CSV import. This is the service name, not a Jira summary you already have.",
    },
    {
      target: "Issue Key",
      sourceKey: "service_code",
      note: "Not a Jira issue key. Your project key and numbering are different. Treat this as an external id unless your import is configured for it.",
    },
    {
      target: "Description",
      sourceKey: "summary",
      note: "Uses the executive summary. Switch the source if you want the full description.",
    },
    {
      target: "Labels",
      sourceKey: "category",
      note: "Jira expects a label format your site defines. This writes the catalog label.",
    },
    {
      target: "Component/s",
      sourceKey: "owner_team",
      note: "Components must already exist in many Jira projects. This file does not create them.",
    },
  ],
};

export const SERVICENOW_PRESET: ImportPreset = {
  id: "servicenow",
  title: "Generic ServiceNow CSV import preset",
  disclaimer:
    "This is a local CSV with common ServiceNow column names. It does not connect to an instance, update a table, or satisfy every import set. An instance may require a table name, coalesce field, sys_id, assignment group sys_id, or transform map that this file does not provide. Review the mapping before you import it yourself.",
  columns: [
    {
      target: "number",
      sourceKey: "service_code",
      note: "Your number format may not accept catalog service codes. Use this as an external reference when number is system-generated.",
    },
    {
      target: "short_description",
      sourceKey: "name",
      note: "Common on task-style tables. A catalog item table may want a different column, such as name.",
    },
    {
      target: "description",
      sourceKey: "summary",
      note: "Many tables use description. Some catalog tables use another column.",
    },
    {
      target: "category",
      sourceKey: "category",
      note: "Choice values must match the target table. This writes the catalog label, not a ServiceNow sys_id.",
    },
    {
      target: "assignment_group",
      sourceKey: "owner_team",
      note: "Instances usually expect a group name or sys_id that already exists.",
    },
  ],
};

export function presetById(id: "jira" | "servicenow"): ImportPreset {
  return id === "jira" ? JIRA_PRESET : SERVICENOW_PRESET;
}

export function mappingFromPreset(preset: ImportPreset): TargetMapping[] {
  return preset.columns.map((column, index) => ({ ...column, id: `${preset.id}-${index + 1}` }));
}

export type MappedColumn = {
  target: string;
  field: FieldDefinition;
};

/** Column order follows the mapping. Service code and name are added when the mapping omits them. */
export function resolveMappedColumns(
  fields: FieldDefinition[],
  mappings: Array<Pick<TargetMapping, "target" | "sourceKey">>,
  audience: Visibility,
): { columns: MappedColumn[]; excludedInternal: FieldDefinition[] } {
  const excludedInternal: FieldDefinition[] = [];
  const columns: MappedColumn[] = [];
  const seenTargets = new Set<string>();
  for (const mapping of mappings) {
    const target = mapping.target.trim();
    if (!target || seenTargets.has(target.toLowerCase())) continue;
    const field = fields.find((item) => item.field_key === mapping.sourceKey);
    if (!field || !field.is_active) continue;
    if (audience === "public" && field.visibility === "internal" && !isIdentityField(field.field_key)) {
      excludedInternal.push(field);
      continue;
    }
    seenTargets.add(target.toLowerCase());
    columns.push({ target, field });
  }
  const withIdentity: MappedColumn[] = [];
  for (const key of ["service_code", "name"]) {
    if (columns.some((column) => column.field.field_key === key)) continue;
    const field = fields.find((item) => item.field_key === key && item.is_active);
    if (!field) continue;
    withIdentity.push({ target: field.label, field });
  }
  return { columns: [...withIdentity, ...columns], excludedInternal };
}

export function mappedAudience(
  fields: FieldDefinition[],
  mappings: Array<Pick<TargetMapping, "target" | "sourceKey">>,
): Visibility {
  const { columns } = resolveMappedColumns(fields, mappings, "internal");
  return columns.some((column) => column.field.visibility === "internal") ? "internal" : "public";
}

export function buildMappedCsv(args: {
  services: ServiceRecord[];
  lookups: LookupOption[];
  columns: MappedColumn[];
  marking?: string | null;
}): string {
  const header = args.columns.map((column) => csvEscape(column.target)).join(",");
  const lines = args.services.map((service) =>
    args.columns.map((column) => csvEscape(formatExportValue(service, column.field, args.lookups))).join(","),
  );
  const marking = args.marking?.trim();
  const rows = marking ? [csvEscape(marking), header, ...lines] : [header, ...lines];
  return `\uFEFF${rows.join("\r\n")}`;
}

export function mappingTemplateCsv(columns: MappedColumn[], notes: Map<string, string>): string {
  const lines = ["Target column,Catalog field,Catalog label,Note"];
  for (const column of columns) {
    const note = notes.get(column.field.field_key) ?? "Local mapping only. Your instance may require more columns.";
    lines.push([column.target, column.field.field_key, column.field.label, note].map((value) => csvEscape(value)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function previewMappedRows(
  services: ServiceRecord[],
  lookups: LookupOption[],
  columns: MappedColumn[],
  limit = 3,
): string[][] {
  return services.slice(0, limit).map((service) => columns.map((column) => formatExportValue(service, column.field, lookups)));
}
