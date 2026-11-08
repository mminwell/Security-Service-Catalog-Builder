import core from "@/lib/catalog/nist-csf-2.0.json";

export type FrameworkElementType = "function" | "category" | "subcategory";

/** One published framework release. V2 ships NIST CSF 2.0 only. */
export type FrameworkRelease = {
  id: string;
  code: string;
  version: string;
  name: string;
  published_on: string;
  publication: string;
  publication_url: string;
  source_title: string;
  source_tool: string;
  source_url: string;
  reference_tool_url: string;
  retrieved_on: string;
  export_change_log: string;
  export_generated_at: string;
  export_sha256: string;
  content_sha256: string;
  id_namespace: string;
  excluded_withdrawn_rows: number;
  provenance: string;
  is_active: boolean;
  /** `seeded` means this release ships the core. `not_loaded` means no control text is included. */
  content_state: "seeded" | "not_loaded";
  license_note: string;
};

/** Function, category, or subcategory outcome. `statement` is the official wording. */
export type FrameworkElement = {
  id: string;
  framework_id: string;
  element_type: FrameworkElementType;
  code: string;
  parent_id: string | null;
  title: string;
  statement: string;
  sort_order: number;
  /** Null for the shared reference core. Set for workspace-imported rows. */
  tenant_id: string | null;
};

const ELEMENT_TYPES = new Set<FrameworkElementType>(["function", "category", "subcategory"]);

function asElementType(value: string): FrameworkElementType {
  if (ELEMENT_TYPES.has(value as FrameworkElementType)) return value as FrameworkElementType;
  throw new Error(`Unknown framework element type: ${value}`);
}

const sourceElements = core.elements;
const idByCode = new Map(sourceElements.map((element) => [element.code, element.id]));

export const CSF_FRAMEWORK: FrameworkRelease = {
  ...core.framework,
  is_active: true,
  content_state: "seeded",
  license_note: "NIST publications are used here as the public CSF 2.0 core. A mapping is a workspace assessment, not NIST certification.",
};

export const CSF_ELEMENTS: FrameworkElement[] = sourceElements.map((element) => ({
  id: element.id,
  framework_id: CSF_FRAMEWORK.id,
  element_type: asElementType(element.element_type),
  code: element.code,
  parent_id: element.parent_code ? (idByCode.get(element.parent_code) ?? null) : null,
  title: element.title,
  statement: element.statement,
  sort_order: element.sort_order,
  tenant_id: null,
}));

export const CSF_FUNCTIONS = CSF_ELEMENTS.filter((element) => element.element_type === "function");
export const CSF_CATEGORIES = CSF_ELEMENTS.filter((element) => element.element_type === "category");
export const CSF_OUTCOMES = CSF_ELEMENTS.filter((element) => element.element_type === "subcategory");

const byId = new Map(CSF_ELEMENTS.map((element) => [element.id, element]));
const byCode = new Map(CSF_ELEMENTS.map((element) => [element.code, element]));

export function elementById(id: string): FrameworkElement | undefined {
  return byId.get(id);
}

export function elementByCode(code: string): FrameworkElement | undefined {
  return byCode.get(code);
}

export function parentElement(element: FrameworkElement, elements: readonly FrameworkElement[] = CSF_ELEMENTS): FrameworkElement | null {
  if (!element.parent_id) return null;
  return elements.find((item) => item.id === element.parent_id) ?? null;
}

export function ancestorOfType(
  element: FrameworkElement,
  elementType: FrameworkElementType,
  elements: readonly FrameworkElement[],
): FrameworkElement | null {
  const index = new Map(elements.map((item) => [item.id, item]));
  let current: FrameworkElement | undefined = element;
  while (current) {
    if (current.element_type === elementType) return current;
    current = current.parent_id ? index.get(current.parent_id) : undefined;
  }
  return null;
}

/** Blueprint subcategory codes stored on a service. These are hints, not assessments. */
export function blueprintHintCodes(customFields: Record<string, unknown> | null | undefined): string[] {
  const raw = customFields?.nist_csf_subcategories;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const code = item.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}
