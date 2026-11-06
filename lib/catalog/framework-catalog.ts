import { CSF_FRAMEWORK, type FrameworkElement, type FrameworkRelease } from "@/lib/catalog/framework";

/**
 * Frameworks this release can select. Only NIST CSF 2.0 ships with control text.
 * The others stay empty until a workspace admin imports an authorized CSV.
 * No control statements are invented here.
 */
export const NOT_LOADED_LABEL = "not loaded—authorized content needed";

export const ADDITIONAL_FRAMEWORKS: FrameworkRelease[] = [
  framework({
    id: "ddbb042c-94ed-534b-b984-cf73b4d118bd",
    code: "ISO-27001",
    version: "2022",
    name: "ISO/IEC 27001",
    published_on: "2022-10-25",
    publication: "ISO/IEC 27001:2022",
    provenance:
      "ISO/IEC 27001:2022 control text is not included. The standard is licensed. Import an authorized CSV if your organization has the rights to use that text.",
    license_note: "ISO/IEC 27001:2022 is copyrighted by ISO. This catalog does not ship its control set.",
  }),
  framework({
    id: "5e572c39-1e18-50b2-a156-70fb3a8f99ff",
    code: "SOC2-TSC",
    version: "2017",
    name: "AICPA Trust Services Criteria",
    published_on: "2017-04-01",
    publication: "TSP section 100 (2017)",
    provenance:
      "Trust Services Criteria text is not included. The criteria are copyrighted by the AICPA. Import an authorized CSV if your organization has the rights to use that text.",
    license_note: "The AICPA Trust Services Criteria are copyrighted. This catalog does not ship them.",
  }),
  framework({
    id: "fbc75172-4771-5432-90f8-65554708166b",
    code: "CIS-V8",
    version: "8",
    name: "CIS Controls",
    published_on: "2021-05-01",
    publication: "CIS Controls v8",
    provenance:
      "CIS Controls v8 safeguards are not included. They are licensed by CIS. Import an authorized CSV if your organization has the rights to use that text.",
    license_note: "CIS Controls are copyrighted by the Center for Internet Security. This catalog does not ship them.",
  }),
  framework({
    id: "e1d4e213-aef9-50d8-9879-9de7cf0cea55",
    code: "HIPAA-SR",
    version: "45-CFR-164",
    name: "HIPAA Security Rule",
    published_on: "2013-01-25",
    publication: "45 CFR Part 164 Subpart C",
    provenance:
      "The HIPAA Security Rule is public regulation. This release does not ship a reconstructed control list. Import a CSV your team prepared from 45 CFR Part 164 Subpart C if you want those citations in the catalog.",
    license_note:
      "45 CFR Part 164 Subpart C is public regulation. No control text is seeded, so the catalog cannot imply a complete HIPAA catalog.",
  }),
  framework({
    id: "b8773c64-04ed-53f5-aae5-fb79f19c8dcb",
    code: "NIST-AI-RMF",
    version: "1.0",
    name: "NIST AI Risk Management Framework",
    published_on: "2023-01-26",
    publication: "NIST AI 100-1",
    provenance:
      "NIST AI RMF 1.0 is a public NIST publication. This release does not include an unverified copy of its functions and categories. Import a CSV taken from the publication you use.",
    license_note: "No AI RMF core is seeded in this release. Coverage stays empty until an authorized import.",
  }),
  framework({
    id: "9252398c-caaa-573a-aac6-07d125cc568b",
    code: "NIST-PF",
    version: "1.0",
    name: "NIST Privacy Framework",
    published_on: "2020-01-16",
    publication: "NIST Privacy Framework 1.0",
    provenance:
      "The NIST Privacy Framework 1.0 is a public NIST publication. This release does not include an unverified copy of its core. Import a CSV taken from the publication you use.",
    license_note: "No Privacy Framework core is seeded in this release. Coverage stays empty until an authorized import.",
  }),
];

export const FRAMEWORK_CATALOG: FrameworkRelease[] = [CSF_FRAMEWORK, ...ADDITIONAL_FRAMEWORKS];

export function elementsInScope(
  elements: readonly FrameworkElement[],
  framework: Pick<FrameworkRelease, "id" | "code">,
  tenantId: string,
): FrameworkElement[] {
  return elements.filter((element) => {
    if (element.framework_id !== framework.id) return false;
    if (framework.code === CSF_FRAMEWORK.code) return element.tenant_id == null;
    return element.tenant_id === tenantId;
  });
}

export function frameworkHasContent(
  elements: readonly FrameworkElement[],
  framework: Pick<FrameworkRelease, "id" | "code">,
  tenantId: string,
): boolean {
  return elementsInScope(elements, framework, tenantId).some((element) => element.element_type === "subcategory");
}

function framework(input: {
  id: string;
  code: string;
  version: string;
  name: string;
  published_on: string;
  publication: string;
  provenance: string;
  license_note: string;
}): FrameworkRelease {
  return {
    id: input.id,
    code: input.code,
    version: input.version,
    name: input.name,
    published_on: input.published_on,
    publication: input.publication,
    publication_url: "",
    source_title: input.publication,
    source_tool: "",
    source_url: "",
    reference_tool_url: "",
    retrieved_on: "",
    export_change_log: "",
    export_generated_at: "",
    export_sha256: "",
    content_sha256: "",
    id_namespace: "",
    excluded_withdrawn_rows: 0,
    provenance: input.provenance,
    is_active: true,
    content_state: "not_loaded",
    license_note: input.license_note,
  };
}
