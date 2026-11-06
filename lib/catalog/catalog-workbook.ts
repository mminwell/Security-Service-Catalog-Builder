import { aggregateCoverage } from "@/lib/catalog/coverage";
import { formatExportValue } from "@/lib/catalog/export-value";
import { elementsInScope } from "@/lib/catalog/framework-catalog";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type { FieldDefinition, LookupOption, OutcomeMapping, ServiceRecord, Visibility } from "@/lib/catalog/types";
import { buildXlsx, type WorkbookSheet } from "@/lib/catalog/xlsx";

const COVERAGE_LABEL = { full: "Full", partial: "Partial", none: "None", unmapped: "Unmapped" } as const;

export function buildCatalogWorkbook(args: {
  services: ServiceRecord[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  tenantId: string;
  audience: Visibility;
  marking: string | null;
}): Uint8Array {
  const sheets = catalogSheets(args);
  return buildXlsx(sheets);
}

export function catalogSheets(args: {
  services: ServiceRecord[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  tenantId: string;
  audience: Visibility;
  marking: string | null;
}): WorkbookSheet[] {
  return [
    servicesSheet(args.services, args.fields, args.lookups, args.marking),
    fieldsSheet(args.fields, args.marking),
    lookupsSheet(args.fields, args.lookups, args.marking),
    mappingsSheet(args),
    coverageSheet(args),
  ];
}

function withMarking(marking: string | null, header: string[], body: string[][]): { rows: string[][]; headerRow: number } {
  if (!marking) return { rows: [header, ...body], headerRow: 0 };
  const banner = [marking, ...Array.from({ length: Math.max(0, header.length - 1) }, () => "")];
  return { rows: [banner, header, ...body], headerRow: 1 };
}

function servicesSheet(
  services: ServiceRecord[],
  fields: FieldDefinition[],
  lookups: LookupOption[],
  marking: string | null,
): WorkbookSheet {
  const header = fields.map((field) => field.label);
  const body = services.map((service) => fields.map((field) => formatExportValue(service, field, lookups)));
  const laid = withMarking(marking, header, body);
  return { name: "Services", ...laid };
}

function fieldsSheet(fields: FieldDefinition[], marking: string | null): WorkbookSheet {
  const header = ["Field", "Key", "Visibility", "Depth", "Group", "Input"];
  const depth = { 1: "Core", 2: "Operations", 3: "Governance" } as const;
  const body = fields.map((field) => [
    field.label,
    field.field_key,
    field.visibility === "internal" ? "Internal" : "Public",
    depth[field.depth_level],
    field.field_group ?? "",
    field.input_type,
  ]);
  return { name: "Fields", ...withMarking(marking, header, body) };
}

function lookupsSheet(fields: FieldDefinition[], lookups: LookupOption[], marking: string | null): WorkbookSheet {
  const header = ["Field", "Code", "Label", "Description"];
  const keys = new Set(fields.map((field) => field.lookup_field_key).filter((key): key is string => Boolean(key)));
  const body = lookups
    .filter((option) => option.is_active && keys.has(option.field_key))
    .sort((a, b) => a.field_key.localeCompare(b.field_key) || a.sort_order - b.sort_order)
    .map((option) => [option.field_key, option.code, option.label, option.description ?? ""]);
  const rows = body.length > 0 ? body : [["", "", "No lookup fields in this export.", ""]];
  return { name: "Lookups", ...withMarking(marking, header, rows) };
}

function mappingsSheet(args: {
  services: ServiceRecord[];
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  tenantId: string;
  audience: Visibility;
  marking: string | null;
}): WorkbookSheet {
  const internal = args.audience === "internal";
  const header = ["Framework", "Version", "Code", "Title", "Service code", "Service name", "Assessment"];
  if (internal) header.push("Rationale", "Notes");
  const serviceById = new Map(args.services.map((service) => [service.id, service]));
  const body: string[][] = [];
  for (const framework of args.frameworks) {
    const scoped = elementsInScope(args.elements, framework, args.tenantId);
    const allowed = new Set(scoped.map((element) => element.id));
    const byId = new Map(scoped.map((element) => [element.id, element]));
    for (const mapping of args.mappings) {
      if (!allowed.has(mapping.element_id)) continue;
      const service = serviceById.get(mapping.service_id);
      if (!service || service.archived_at) continue;
      const element = byId.get(mapping.element_id);
      if (!element) continue;
      const row = [
        framework.code,
        framework.version,
        element.code,
        element.title,
        service.service_code,
        service.name,
        COVERAGE_LABEL[mapping.coverage],
      ];
      if (internal) row.push(mapping.rationale ?? "", mapping.notes ?? "");
      body.push(row);
    }
  }
  const rows = body.length > 0 ? body : [["", "", "No assessments for the services in this export.", "", "", "", ""]];
  return { name: "Mappings", ...withMarking(args.marking, header, rows) };
}

function coverageSheet(args: {
  services: ServiceRecord[];
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  tenantId: string;
  marking: string | null;
}): WorkbookSheet {
  const header = ["Framework", "Version", "Code", "Title", "Status", "Active services in this export"];
  const note = [
    "Counts use only this framework's subcategory outcomes and the active services in this export. They are not a certification, a maturity score, or a crosswalk.",
    "",
    "",
    "",
    "",
    "",
  ];
  const body: string[][] = [note];
  for (const framework of args.frameworks) {
    const scoped = elementsInScope(args.elements, framework, args.tenantId);
    if (!scoped.some((element) => element.element_type === "subcategory")) {
      body.push([framework.code, framework.version, "", "not loaded—authorized content needed", "", ""]);
      continue;
    }
    const report = aggregateCoverage({
      elements: scoped,
      mappings: args.mappings,
      services: args.services,
      tenantId: args.tenantId,
      frameworkId: framework.id,
    });
    for (const outcome of report.outcomes) {
      const names = outcome.contributions
        .map((item) => args.services.find((service) => service.id === item.serviceId)?.service_code)
        .filter((code): code is string => Boolean(code));
      body.push([
        framework.code,
        framework.version,
        outcome.element.code,
        outcome.element.title,
        COVERAGE_LABEL[outcome.status],
        names.join("; "),
      ]);
    }
  }
  return { name: "Coverage", ...withMarking(args.marking, header, body) };
}
