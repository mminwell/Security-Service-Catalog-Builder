import { safeHttpUrl } from "@/lib/catalog/artifacts";
import { fieldUsesLookup } from "@/lib/catalog/lookup-toggle";
import { optionByCode } from "@/lib/catalog/lookups";
import { composeServiceOwner } from "@/lib/catalog/owner-names";
import { blankService, normalizeService, writeField } from "@/lib/catalog/service";
import { suggestServiceCode } from "@/lib/catalog/service-code";
import { csvEscape } from "@/lib/catalog/spreadsheet-text";
import type { FieldDefinition, LookupOption, ServiceCodeMode, ServiceRecord } from "@/lib/catalog/types";

export const OWNER_FIRST_COLUMN = "owner_first_name";
export const OWNER_LAST_COLUMN = "owner_last_name";

export type ImportTarget = {
  key: string;
  label: string;
  required: boolean;
};

export type ServiceColumnMap = Record<string, number | null>;

export type PlannedServiceImport = {
  line: number;
  action: "create" | "update";
  matchId: string | null;
  name: string;
  service_code: string | null;
  /** Set when a first-name, last-name, or full-name column is mapped. */
  service_owner?: string | null;
  fields: Record<string, unknown>;
};

export type ServiceImportPlan = {
  totalRows: number;
  skippedBlank: number;
  creates: number;
  updates: number;
  preview: PlannedServiceImport[];
  rows: PlannedServiceImport[];
  errors: string[];
};

const FIRST_ALIASES = [
  "first_name",
  "firstname",
  "first",
  "given_name",
  "given",
  "owner_first_name",
  "owner_first",
  "service_owner_first_name",
  "service_owner_first",
];

const LAST_ALIASES = [
  "last_name",
  "lastname",
  "last",
  "surname",
  "family_name",
  "family",
  "owner_last_name",
  "owner_last",
  "service_owner_last_name",
  "service_owner_last",
];

const OWNER_ALIASES = ["service_owner", "serviceowner", "full_name", "fullname", "owner_name", "owner"];
const NAME_ALIASES = ["name", "service_name", "service"];
const CODE_ALIASES = ["service_code", "code", "service_id"];

const NUMERIC_FIELDS = new Set(["current_maturity_cmmi", "target_maturity_cmmi"]);

export function serviceImportTargets(fields: FieldDefinition[]): ImportTarget[] {
  const active = fields
    .filter((field) => field.is_active && field.input_type !== "computed")
    .sort((a, b) => a.sort_order - b.sort_order);
  const targets: ImportTarget[] = [];
  let ownerPlaced = false;
  for (const field of active) {
    targets.push({
      key: field.field_key,
      label: field.field_key === "service_owner" ? "Service Owner (full name)" : field.label,
      required: field.field_key === "name",
    });
    if (field.field_key === "service_owner") {
      ownerPlaced = true;
      targets.push(
        { key: OWNER_FIRST_COLUMN, label: "First name", required: false },
        { key: OWNER_LAST_COLUMN, label: "Last name", required: false },
      );
    }
  }
  if (!ownerPlaced) {
    targets.push(
      { key: "service_owner", label: "Service Owner (full name)", required: false },
      { key: OWNER_FIRST_COLUMN, label: "First name", required: false },
      { key: OWNER_LAST_COLUMN, label: "Last name", required: false },
    );
  }
  return targets;
}

export function emptyServiceColumnMap(fields: FieldDefinition[]): ServiceColumnMap {
  const map: ServiceColumnMap = {};
  for (const target of serviceImportTargets(fields)) map[target.key] = null;
  return map;
}

export function suggestServiceColumnMap(headers: string[], fields: FieldDefinition[]): ServiceColumnMap {
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const map = emptyServiceColumnMap(fields);
  map[OWNER_FIRST_COLUMN] = claim(normalized, taken, FIRST_ALIASES);
  map[OWNER_LAST_COLUMN] = claim(normalized, taken, LAST_ALIASES);
  const byKey = new Map(fields.map((field) => [field.field_key, field]));
  for (const target of serviceImportTargets(fields)) {
    if (target.key === OWNER_FIRST_COLUMN || target.key === OWNER_LAST_COLUMN) continue;
    const field = byKey.get(target.key);
    const aliases =
      target.key === "service_owner"
        ? OWNER_ALIASES
        : target.key === "name"
          ? NAME_ALIASES
          : target.key === "service_code"
            ? CODE_ALIASES
            : field
              ? [field.field_key, normalizeHeader(field.label)]
              : [target.key];
    map[target.key] = claim(normalized, taken, aliases);
  }
  return map;
}

export function planServiceImport(args: {
  table: string[][];
  map: ServiceColumnMap;
  fields: FieldDefinition[];
  lookups: LookupOption[];
  existing: Array<Pick<ServiceRecord, "id" | "service_code">>;
}): ServiceImportPlan {
  if (args.table.length === 0) return emptyPlan(["The file has no rows."]);
  if (args.map.name == null) return emptyPlan(["Map a column to Service Name."]);
  const fieldByKey = new Map(args.fields.map((field) => [field.field_key, field]));
  const body = args.table.slice(1);
  const errors: string[] = [];
  const planned = new Map<string, PlannedServiceImport>();
  const order: string[] = [];
  let skippedBlank = 0;
  const ownerMapped =
    args.map[OWNER_FIRST_COLUMN] != null || args.map[OWNER_LAST_COLUMN] != null || args.map.service_owner != null;

  body.forEach((cells, index) => {
    const line = index + 2;
    if (mappedCells(cells, args.map).every((value) => value.trim().length === 0)) {
      skippedBlank += 1;
      return;
    }
    const name = cell(cells, args.map.name).replace(/\s+/g, " ").trim();
    if (!name) {
      errors.push(`Row ${line}: Service Name is required.`);
      return;
    }
    try {
      const fields: Record<string, unknown> = {};
      for (const [key, column] of Object.entries(args.map)) {
        if (column == null) continue;
        if (key === "name" || key === "service_code" || key === "service_owner") continue;
        if (key === OWNER_FIRST_COLUMN || key === OWNER_LAST_COLUMN) continue;
        const field = fieldByKey.get(key);
        if (!field || field.input_type === "computed") continue;
        const raw = cell(cells, column);
        if (!raw.trim()) {
          if (field.input_type === "boolean" || field.input_type === "multi_select") continue;
          fields[key] = null;
          continue;
        }
        fields[key] = parseField(field, raw, args.lookups);
      }
      const code = cell(cells, args.map.service_code ?? null).trim();
      const row: PlannedServiceImport = {
        line,
        action: "create",
        matchId: null,
        name,
        service_code: code || null,
        fields,
      };
      if (ownerMapped) {
        const useParts = args.map[OWNER_FIRST_COLUMN] != null || args.map[OWNER_LAST_COLUMN] != null;
        row.service_owner = composeServiceOwner({
          useParts,
          firstName: cell(cells, args.map[OWNER_FIRST_COLUMN] ?? null),
          lastName: cell(cells, args.map[OWNER_LAST_COLUMN] ?? null),
          fullName: cell(cells, args.map.service_owner ?? null),
        });
      }
      const key = (code || `new:${line}`).toLowerCase();
      const existing = code
        ? args.existing.find((service) => service.service_code.toLowerCase() === code.toLowerCase())
        : undefined;
      if (existing) {
        row.action = "update";
        row.matchId = existing.id;
      }
      if (!planned.has(key)) order.push(key);
      planned.set(key, row);
    } catch (error) {
      errors.push(`Row ${line}: ${error instanceof Error ? error.message : "Could not read this row."}`);
    }
  });

  const rows = order.map((key) => planned.get(key)).filter((row): row is PlannedServiceImport => Boolean(row));
  for (const row of rows) {
    if (!row.service_code || row.matchId) continue;
    const earlier = rows.find((item) => item !== row && item.service_code?.toLowerCase() === row.service_code?.toLowerCase());
    if (earlier) {
      row.action = "update";
      row.matchId = earlier.matchId;
    }
  }
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

export function materializeServiceImports(args: {
  tenantId: string;
  planned: PlannedServiceImport[];
  existing: ServiceRecord[];
  mode: ServiceCodeMode;
  categoryPrefix: (category: string | null) => string | null;
  now?: string;
}): ServiceRecord[] {
  const taken = new Set(args.existing.map((service) => service.service_code.toLowerCase()));
  const byId = new Map(args.existing.map((service) => [service.id, service]));
  const idByCode = new Map(args.existing.map((service) => [service.service_code.toLowerCase(), service.id]));
  const stamp = args.now ?? new Date().toISOString();
  const records: ServiceRecord[] = [];

  for (const row of args.planned) {
    const matchId =
      row.matchId ?? (row.service_code ? idByCode.get(row.service_code.toLowerCase()) ?? null : null);
    const current = matchId ? byId.get(matchId) : undefined;
    let record = current
      ? { ...current, custom_fields: { ...(current.custom_fields ?? {}) } }
      : blankService(args.tenantId, crypto.randomUUID(), "");
    for (const [key, value] of Object.entries(row.fields)) {
      record = writeField(record, key, value);
    }
    record = writeField(record, "name", row.name);
    if (row.service_code) {
      record = writeField(record, "service_code", row.service_code);
    } else if (!current) {
      const code = suggestServiceCode({
        existingCodes: [...taken],
        mode: args.mode,
        categoryPrefix: args.categoryPrefix(typeof record.category === "string" ? record.category : null),
      });
      record = writeField(record, "service_code", code);
    }
    if ("service_owner" in row) {
      record = {
        ...record,
        service_owner: row.service_owner ?? null,
        owner_id: null,
        owner_needed: false,
        owner_review: null,
      };
    }
    record = normalizeService({
      ...record,
      updated_at: stamp,
      created_at: current?.created_at ?? stamp,
    });
    taken.add(record.service_code.toLowerCase());
    byId.set(record.id, record);
    idByCode.set(record.service_code.toLowerCase(), record.id);
    records.push(record);
  }
  return records;
}

export function serviceTemplateCsv(): string {
  const header = [
    "Service Name",
    "Service Code",
    "First name",
    "Last name",
    "Service Owner",
    "Category",
    "Status",
    "Owner Team",
    "Service Description",
  ];
  const example = [
    "Harbor Watch",
    "SVC-014",
    "Ada",
    "Lovelace",
    "",
    "Security Operations & Monitoring",
    "Active",
    "SOC / SecOps",
    "Fictional monitoring for the Northwind estate.",
  ];
  return `\uFEFF${[header, example].map((row) => row.map((value) => csvEscape(value)).join(",")).join("\r\n")}`;
}

function parseField(field: FieldDefinition, raw: string, lookups: LookupOption[]): unknown {
  const text = raw.replace(/\s+/g, " ").trim();
  if (field.input_type === "boolean") {
    if (/^(yes|true|y|1)$/i.test(text)) return true;
    if (/^(no|false|n|0)$/i.test(text)) return false;
    throw new Error(`${field.label} must be yes or no.`);
  }
  if (field.input_type === "multi_select") {
    const parts = text
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (field.lookup_field_key) {
      return parts.map((part) => resolveOption(lookups, field.lookup_field_key ?? "", part, field.label));
    }
    return parts;
  }
  if (field.input_type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field.label} must be a date like 2026-01-15.`);
    return text;
  }
  if (field.input_type === "url") {
    const safe = safeHttpUrl(text);
    if (!safe) throw new Error(`${field.label} must be an http or https URL.`);
    return safe;
  }
  if (fieldUsesLookup(field) && field.lookup_field_key) {
    const code = resolveOption(lookups, field.lookup_field_key, text, field.label);
    if (NUMERIC_FIELDS.has(field.field_key)) {
      const parsed = Number(code);
      if (!Number.isInteger(parsed)) throw new Error(`${field.label} is not a whole number.`);
      return parsed;
    }
    return code;
  }
  return text;
}

function resolveOption(lookups: LookupOption[], fieldKey: string, raw: string, label: string): string {
  const needle = raw.trim().toLowerCase();
  const match =
    lookups.find(
      (option) =>
        option.field_key === fieldKey &&
        option.is_active &&
        (option.code.toLowerCase() === needle || option.label.toLowerCase() === needle),
    ) ?? optionByCode(lookups, fieldKey, raw.trim());
  if (!match || !match.is_active) throw new Error(`${label} "${raw.trim()}" is not an active choice.`);
  return match.code;
}

function claim(headers: string[], taken: Set<number>, aliases: string[]): number | null {
  const index = headers.findIndex((header, position) => !taken.has(position) && aliases.includes(header));
  if (index < 0) return null;
  taken.add(index);
  return index;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/[\s-]+/g, "_");
}

function cell(cells: string[], index: number | null): string {
  if (index == null) return "";
  return cells[index] ?? "";
}

function mappedCells(cells: string[], map: ServiceColumnMap): string[] {
  return Object.values(map)
    .filter((index): index is number => index != null)
    .map((index) => cells[index] ?? "");
}

function emptyPlan(errors: string[]): ServiceImportPlan {
  return { totalRows: 0, skippedBlank: 0, creates: 0, updates: 0, preview: [], rows: [], errors };
}
