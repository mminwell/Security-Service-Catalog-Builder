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
