import { displayServiceOwner, ownerDisplayName, splitPersonName } from "@/lib/catalog/owner-names";

export const SERVICE_OWNER_LOOKUP_KEY = "service_owner";

export function isServiceOwnerLookup(fieldKey: string): boolean {
  return fieldKey === SERVICE_OWNER_LOOKUP_KEY;
}

export type ColumnMap = {
  label: number | null;
  code: number | null;
  description: number | null;
  code_prefix: number | null;
};

export type PlannedLookup = {
  code: string;
  label: string;
  description: string | null;
  code_prefix: string | null;
  action: "create" | "update";
};

export type LookupPlan = {
  totalRows: number;
  skippedBlank: number;
  creates: number;
  updates: number;
  preview: PlannedLookup[];
  rows: PlannedLookup[];
  errors: string[];
};

const LABEL_HEADERS = ["label", "name", "full_name", "fullname"];
const CODE_HEADERS = ["code", "id"];
const DESCRIPTION_HEADERS = ["description", "title", "department", "email"];
const PREFIX_HEADERS = ["code_prefix", "prefix"];

/** RFC 4180 parser. Accepts a UTF-8 BOM, quoted commas, and quoted newlines. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char ?? "";
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char ?? "";
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim().length > 0) || item.length > 1);
}

export function suggestColumnMap(headers: string[]): ColumnMap {
  const normalized = headers.map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  return {
    label: findHeader(normalized, LABEL_HEADERS),
    code: findHeader(normalized, CODE_HEADERS),
    description: findHeader(normalized, DESCRIPTION_HEADERS),
    code_prefix: findHeader(normalized, PREFIX_HEADERS),
  };
}

export function codeFromLabel(label: string): string {
  const code = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return code || "option";
}

export function normalizeLookupCode(value: string): string {
  return codeFromLabel(value.replace(/[_-]+/g, " "));
}

export function dedupeCode(base: string, taken: Set<string>): string {
  const root = base.slice(0, 48) || "option";
  if (!taken.has(root)) {
    taken.add(root);
    return root;
  }
  let suffix = 2;
  while (taken.has(`${root}_${suffix}`.slice(0, 56))) suffix += 1;
  const next = `${root}_${suffix}`.slice(0, 56);
  taken.add(next);
  return next;
}

export function planLookupImport(args: {
  table: string[][];
  map: ColumnMap;
  existingCodes: string[];
  fieldKey: string;
}): LookupPlan {
  const errors: string[] = [];
  if (args.table.length === 0) {
    return emptyPlan(["The file has no rows."]);
  }
  if (args.map.label == null) {
    return emptyPlan(["Map a column to Label."]);
  }
  const body = args.table.slice(1);
  const taken = new Set(args.existingCodes.map((code) => code.toLowerCase()));
  const existing = new Set(taken);
  const planned = new Map<string, PlannedLookup>();
  let skippedBlank = 0;

  for (const cells of body) {
    const label = cell(cells, args.map.label).trim();
    if (!label) {
      skippedBlank += 1;
      continue;
    }
    const explicit = args.map.code == null ? "" : cell(cells, args.map.code).trim();
    let code: string;
    let action: PlannedLookup["action"];
    if (explicit) {
      code = normalizeLookupCode(explicit);
      if (!/^[a-z0-9_]+$/.test(code)) {
        skippedBlank += 1;
        continue;
      }
      action = existing.has(code) ? "update" : "create";
      taken.add(code);
    } else {
      const base = codeFromLabel(label);
      code = dedupeCode(base, taken);
      action = "create";
    }
    const description = args.map.description == null ? "" : cell(cells, args.map.description).trim();
    const prefix = args.map.code_prefix == null ? "" : cell(cells, args.map.code_prefix).trim().toUpperCase();
    planned.set(code, {
      code,
      label,
      description: description || null,
      code_prefix: args.fieldKey === "category" && prefix ? prefix : null,
      action,
    });
  }

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

export function lookupTemplateCsv(fieldKey: string): string {
  if (fieldKey === "category") {
    return [
      "code,label,description,code_prefix",
      "example_ops,Example Operations,Illustrative category. Replace both rows before you import.,OPS",
      "example_lab,Example Lab,Second illustrative row for the template.,LAB",
    ].join("\r\n") + "\r\n";
  }
  return [
    "code,label,description",
    "example_lead,Example Lead,Hover description shown beside this option.",
    "example_analyst,Example Analyst,Second illustrative row. Replace both before you import.",
  ].join("\r\n") + "\r\n";
}

export function templateFileName(fieldKey: string): string {
  return `${fieldKey || "lookup"}-template.csv`;
}

export type OwnerColumnMap = {
  firstName: number | null;
  lastName: number | null;
  fullName: number | null;
  employeeId: number | null;
};

export type PlannedOwnerLookup = {
  code: string;
  firstName: string;
  lastName: string;
  displayName: string;
  action: "create" | "update";
};

export type OwnerLookupPlan = {
  totalRows: number;
  skippedBlank: number;
  creates: number;
  updates: number;
  preview: PlannedOwnerLookup[];
  rows: PlannedOwnerLookup[];
  errors: string[];
};

const OWNER_FIRST_HEADERS = ["first_name", "legal_first_name", "firstname", "given_name"];
const OWNER_LAST_HEADERS = ["last_name", "legal_last_name", "lastname", "surname", "family_name"];
const OWNER_FULL_HEADERS = ["full_name", "fullname", "legal_name", "display_name"];
const OWNER_ID_HEADERS = ["employee_id", "employeeid", "id", "code"];

export function suggestOwnerColumnMap(headers: string[]): OwnerColumnMap {
  const normalized = headers.map(normalizeOwnerHeader);
  return {
    firstName: findHeader(normalized, OWNER_FIRST_HEADERS),
    lastName: findHeader(normalized, OWNER_LAST_HEADERS),
    fullName: findHeader(normalized, OWNER_FULL_HEADERS),
    employeeId: findHeader(normalized, OWNER_ID_HEADERS),
  };
}

/**
 * Service Owner lookup import. First name is required unless a full-name column is mapped.
 * The display name is Last, First. One name is kept without a comma. The employee id is the
 * lookup code, so importing that id again updates the same row.
 */
export function planOwnerLookupImport(args: {
  table: string[][];
  map: OwnerColumnMap;
  existingCodes: string[];
}): OwnerLookupPlan {
  if (args.table.length === 0) return emptyOwnerPlan(["The file has no rows."]);
  if (args.map.firstName == null && args.map.fullName == null) {
    return emptyOwnerPlan(["Map a column to First name, or map Full name."]);
  }
  const body = args.table.slice(1);
  const taken = new Set(args.existingCodes.map((code) => code.toLowerCase()));
  const existing = new Set(taken);
  const planned = new Map<string, PlannedOwnerLookup>();
  let skippedBlank = 0;

  for (const cells of body) {
    const names = ownerNamesFromCells(cells, args.map);
    if (!names.displayName) {
      skippedBlank += 1;
      continue;
    }
    const explicit = args.map.employeeId == null ? "" : cell(cells, args.map.employeeId).trim();
    let code: string;
    if (explicit) {
      code = normalizeLookupCode(explicit);
      if (!/^[a-z0-9_]+$/.test(code)) {
        skippedBlank += 1;
        continue;
      }
      taken.add(code);
    } else {
      code = dedupeCode(codeFromLabel(names.displayName), taken);
    }
    planned.set(code, {
      code,
      firstName: names.firstName,
      lastName: names.lastName,
      displayName: names.displayName,
      action: existing.has(code) ? "update" : "create",
    });
  }

  const rows = [...planned.values()];
  if (rows.length === 0 && skippedBlank === body.length) {
    return emptyOwnerPlan(["The file has no owner rows."]);
  }
  return {
    totalRows: body.length,
    skippedBlank,
    creates: rows.filter((row) => row.action === "create").length,
    updates: rows.filter((row) => row.action === "update").length,
    preview: rows.slice(0, 8),
    rows,
    errors: rows.length === 0 ? ["The file has no owner rows."] : [],
  };
}

export type OwnerDirectoryWrite = {
  id: string | null;
  firstName: string;
  lastName: string;
};

/**
 * Directory rows for people with both a first and a last name.
 * The same employee id updates the owner already created for that code, even when the name changed.
 */
export function planOwnerDirectoryWrites(args: {
  rows: PlannedOwnerLookup[];
  owners: Array<{ id: string; firstName: string; lastName: string }>;
  previousLabels: Array<{ code: string; label: string }>;
}): OwnerDirectoryWrite[] {
  const owners = args.owners.map((owner) => ({ ...owner }));
  const previous = new Map(args.previousLabels.map((item) => [item.code.toLowerCase(), item.label]));
  const writes: OwnerDirectoryWrite[] = [];
  for (const row of args.rows) {
    if (!row.firstName || !row.lastName) continue;
    const check = splitPersonName(`${row.lastName}, ${row.firstName}`);
    if (!check.ok) continue;
    const byName = owners.find(
      (owner) =>
        owner.firstName.toLowerCase() === row.firstName.toLowerCase() &&
        owner.lastName.toLowerCase() === row.lastName.toLowerCase(),
    );
    const previousLabel = previous.get(row.code.toLowerCase());
    const previousSplit = previousLabel ? splitPersonName(previousLabel) : null;
    const byPrevious =
      !byName && previousSplit && previousSplit.ok
        ? owners.find(
            (owner) =>
              owner.firstName.toLowerCase() === previousSplit.firstName.toLowerCase() &&
              owner.lastName.toLowerCase() === previousSplit.lastName.toLowerCase(),
          )
        : undefined;
    const match = byName ?? byPrevious;
    if (match && !match.id) continue;
    if (match?.id) {
      match.firstName = row.firstName;
      match.lastName = row.lastName;
      writes.push({ id: match.id, firstName: row.firstName, lastName: row.lastName });
    } else {
      owners.push({ id: "", firstName: row.firstName, lastName: row.lastName });
      writes.push({ id: null, firstName: row.firstName, lastName: row.lastName });
    }
  }
  return writes;
}

function ownerNamesFromCells(cells: string[], map: OwnerColumnMap): { firstName: string; lastName: string; displayName: string } {
  const first = collapseCell(cell(cells, map.firstName));
  const last = collapseCell(cell(cells, map.lastName));
  const partsMapped = map.firstName != null || map.lastName != null;
  if (partsMapped && (first || last)) {
    return { firstName: first, lastName: last, displayName: ownerDisplayName(first, last) };
  }
  const full = collapseCell(cell(cells, map.fullName));
  if (!full) return { firstName: "", lastName: "", displayName: "" };
  const split = splitPersonName(full);
  if (split.ok) {
    return {
      firstName: split.firstName,
      lastName: split.lastName,
      displayName: ownerDisplayName(split.firstName, split.lastName),
    };
  }
  return { firstName: "", lastName: "", displayName: displayServiceOwner(full) };
}

function collapseCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOwnerHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/[\s-]+/g, "_");
}

function emptyOwnerPlan(errors: string[]): OwnerLookupPlan {
  return { totalRows: 0, skippedBlank: 0, creates: 0, updates: 0, preview: [], rows: [], errors };
}

function findHeader(headers: string[], aliases: string[]): number | null {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return null;
}

function cell(row: string[], index: number | null): string {
  if (index == null) return "";
  return row[index] ?? "";
}

function emptyPlan(errors: string[]): LookupPlan {
  return { totalRows: 0, skippedBlank: 0, creates: 0, updates: 0, preview: [], rows: [], errors };
}
