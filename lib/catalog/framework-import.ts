import { parseCsv } from "@/lib/catalog/lookup-csv";
import { CSF_FRAMEWORK, type FrameworkElement, type FrameworkElementType, type FrameworkRelease } from "@/lib/catalog/framework";

export type PlannedElement = {
  code: string;
  parentCode: string | null;
  title: string;
  statement: string;
  elementType: FrameworkElementType;
  sortOrder: number;
  action: "create" | "update";
};

export type FrameworkImportPlan = {
  errors: string[];
  rows: PlannedElement[];
  creates: number;
  updates: number;
  preview: PlannedElement[];
};

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

const HEADER_ALIASES: Record<string, string> = {
  id: "id",
  code: "id",
  parent: "parent",
  parent_id: "parent",
  parent_code: "parent",
  title: "title",
  outcome: "outcome",
  statement: "outcome",
  version: "version",
};

/** Validate an authorized CSV. Does not invent rows and does not crosswalk frameworks. */
export function planFrameworkImport(args: {
  framework: FrameworkRelease;
  csv: string;
  existingCodes: ReadonlySet<string>;
}): FrameworkImportPlan {
  if (args.framework.code === CSF_FRAMEWORK.code) {
    return {
      errors: ["NIST CSF 2.0 stays on the reference-tool core. This importer does not replace it."],
      rows: [],
      creates: 0,
      updates: 0,
      preview: [],
    };
  }
  const table = parseCsv(args.csv);
  if (table.length === 0) {
    return emptyPlan(["The CSV is empty."]);
  }
  const header = table[0].map((cell) => HEADER_ALIASES[cell.trim().toLowerCase().replace(/\s+/g, "_")] ?? "");
  const index = (name: string) => header.indexOf(name);
  const idCol = index("id");
  const parentCol = index("parent");
  const titleCol = index("title");
  const outcomeCol = index("outcome");
  const versionCol = index("version");
  if (idCol < 0 || parentCol < 0 || titleCol < 0 || outcomeCol < 0 || versionCol < 0) {
    return emptyPlan(["The CSV needs columns named id, parent, title, outcome, and version."]);
  }

  const errors: string[] = [];
  const draft: Array<Omit<PlannedElement, "elementType" | "action"> & { line: number }> = [];
  const seen = new Set<string>();
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    const line = rowIndex + 1;
    const code = cell(row, idCol);
    const parent = cell(row, parentCol);
    const title = cell(row, titleCol);
    const outcome = cell(row, outcomeCol);
    const version = cell(row, versionCol);
    if (!code && !parent && !title && !outcome && !version) continue;
    if (!code || !CODE_PATTERN.test(code)) errors.push(`Row ${line}: id must be 1–80 letters, numbers, dots, colons, hyphens, or underscores.`);
    if (!title || title.length > 300) errors.push(`Row ${line}: title is required and must be 300 characters or fewer.`);
    if (!outcome || outcome.length > 4000) errors.push(`Row ${line}: outcome is required and must be 4000 characters or fewer.`);
    if (version !== args.framework.version) {
      errors.push(`Row ${line}: version must be ${args.framework.version}.`);
    }
    if (code && seen.has(code)) errors.push(`Row ${line}: duplicate id ${code}.`);
    if (code) seen.add(code);
    draft.push({
      line,
      code,
      parentCode: parent || null,
      title,
      statement: outcome,
      sortOrder: (draft.length + 1) * 10,
    });
  }
  if (draft.length === 0) errors.push("The CSV has no outcome rows.");
  if (draft.length > 5000) errors.push("Import is limited to 5000 rows.");

  const known = new Set<string>([...args.existingCodes, ...draft.map((row) => row.code)]);
  for (const row of draft) {
    if (row.parentCode && !known.has(row.parentCode)) {
      errors.push(`Row ${row.line}: parent ${row.parentCode} is not in this file or already loaded for this workspace.`);
    }
    if (row.parentCode === row.code) errors.push(`Row ${row.line}: ${row.code} cannot be its own parent.`);
  }

  const byCode = new Map(draft.map((row) => [row.code, row]));
  const typed: PlannedElement[] = [];
  for (const row of draft) {
    const chain: string[] = [];
    let current: string | null = row.code;
    let depth = 0;
    const walked = new Set<string>();
    while (current) {
      if (walked.has(current)) {
        errors.push(`Row ${row.line}: ${row.code} is part of a parent cycle.`);
        depth = 99;
        break;
      }
      walked.add(current);
      chain.push(current);
      depth += 1;
      const parent: string | null = byCode.get(current)?.parentCode ?? null;
      if (!parent) break;
      if (!byCode.has(parent)) break;
      current = parent;
      if (depth > 4) break;
    }
    if (depth > 3) {
      errors.push(`Row ${row.line}: ${row.code} is nested deeper than function, category, and subcategory.`);
    }
    const elementType: FrameworkElementType = depth <= 1 ? "function" : depth === 2 ? "category" : "subcategory";
    typed.push({
      code: row.code,
      parentCode: row.parentCode,
      title: row.title,
      statement: row.statement,
      elementType,
      sortOrder: row.sortOrder,
      action: args.existingCodes.has(row.code) ? "update" : "create",
    });
  }

  if (errors.length > 0) return emptyPlan(errors);
  return {
    errors: [],
    rows: typed,
    creates: typed.filter((row) => row.action === "create").length,
    updates: typed.filter((row) => row.action === "update").length,
    preview: typed.slice(0, 8),
  };
}

export function applyFrameworkImport(
  elements: readonly FrameworkElement[],
  tenantId: string,
  frameworkId: string,
  planned: readonly PlannedElement[],
): FrameworkElement[] {
  const next = elements.map((element) => ({ ...element }));
  const idFor = (code: string) => {
    const existing = next.find(
      (element) => element.tenant_id === tenantId && element.framework_id === frameworkId && element.code === code,
    );
    return existing?.id ?? crypto.randomUUID();
  };
  for (const row of planned) {
    const id = idFor(row.code);
    const current = next.find((element) => element.id === id);
    const stored: FrameworkElement = {
      id,
      framework_id: frameworkId,
      tenant_id: tenantId,
      element_type: row.elementType,
      code: row.code,
      parent_id: null,
      title: row.title,
      statement: row.statement,
      sort_order: row.sortOrder,
    };
    if (current) {
      const index = next.findIndex((element) => element.id === id);
      next[index] = stored;
    } else {
      next.push(stored);
    }
  }
  const scoped = next.filter((element) => element.tenant_id === tenantId && element.framework_id === frameworkId);
  const byCode = new Map(scoped.map((element) => [element.code, element]));
  for (const row of planned) {
    const element = byCode.get(row.code);
    if (!element) continue;
    element.parent_id = row.parentCode ? (byCode.get(row.parentCode)?.id ?? null) : null;
  }
  return next;
}

export function frameworkImportTemplate(version: string): string {
  return [
    "id,parent,title,outcome,version",
    `EXAMPLE-FN,,Example function,Workspace-supplied function statement.,${version}`,
    `EXAMPLE-CAT,EXAMPLE-FN,Example category,Workspace-supplied category statement.,${version}`,
    `EXAMPLE-01,EXAMPLE-CAT,Example outcome,Replace these rows with the authorized text you have rights to import.,${version}`,
  ].join("\r\n");
}

function cell(row: string[], index: number): string {
  return (row[index] ?? "").trim();
}

function emptyPlan(errors: string[]): FrameworkImportPlan {
  return { errors, rows: [], creates: 0, updates: 0, preview: [] };
}
