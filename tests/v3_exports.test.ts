import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildCatalogDocument } from "@/lib/catalog/catalog-document";
import { catalogSheets } from "@/lib/catalog/catalog-workbook";
import { aggregateCoverage } from "@/lib/catalog/coverage";
import { distributionMarking, servicesToCsv } from "@/lib/catalog/csv";
import { buildDocx } from "@/lib/catalog/docx";
import {
  fullPreset,
  INTERNAL_EXPORT_CONFIRMATION,
  publicPreset,
  resolveExportSelection,
  sanitizeExportLog,
} from "@/lib/catalog/export-plan";
import { materializeFields, STARTER_FIELDS } from "@/lib/catalog/fields";
import { ADDITIONAL_FRAMEWORKS, elementsInScope, NOT_LOADED_LABEL } from "@/lib/catalog/framework-catalog";
import { CSF_ELEMENTS, CSF_FRAMEWORK, elementByCode } from "@/lib/catalog/framework";
import { planFrameworkImport } from "@/lib/catalog/framework-import";
import { buildMappedCsv, mappedAudience, mappingFromPreset, resolveMappedColumns, SERVICENOW_PRESET } from "@/lib/catalog/import-presets";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { buildCatalogPdf, type PdfFonts } from "@/lib/catalog/pdf-catalog";
import { buildService, completenessPercent, readField, writeField } from "@/lib/catalog/service";
import { buildXlsx } from "@/lib/catalog/xlsx";
import type { LookupOption, Role } from "@/lib/catalog/types";
import { freshDemo, importFrameworkRows, recordExport, saveExportProfile, setFieldGroup, signInDemo } from "@/lib/data/model";
import { migrateDemoState } from "@/lib/data/storage";

const fonts: PdfFonts = {
  sans: readFileSync("public/fonts/LiberationSans-Regular.ttf"),
  sansBold: readFileSync("public/fonts/LiberationSans-Bold.ttf"),
  serif: readFileSync("public/fonts/LiberationSerif-Regular.ttf"),
};

const fields = materializeFields("tenant", (key) => `field:${key}`);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: seed.code + seed.field_key,
  tenant_id: "tenant",
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

const secret = "Holiday paging coverage is thin.";
const unicode = "São Paulo — café — naïve";
const formula = "=CMD()";

function service(code: string, name: string, summary: string) {
  return buildService("tenant", {
    service_code: code,
    name,
    category: "secops",
    status: "active",
    service_tier: "tier_0",
    summary,
    owner_team: "soc",
    internal_name: "SOC watch",
    internal_notes: secret,
    current_tooling_notes: formula,
  });
}

const services = [
  service("SVC-001", "Enterprise Security Monitoring", unicode),
  service("SVC-002", "Another service", "Short summary."),
];

function zipText(bytes: Uint8Array, path: string): string {
  const opened = unzipSync(bytes);
  const file = opened[path];
  if (!file) throw new Error(`Missing ${path}`);
  return strFromU8(file);
}

describe("audience profiles and visibility", () => {
  it("keeps public exports free of internal fields and confirms internal files", () => {
    const pub = publicPreset(fields);
    const full = fullPreset(fields);
    expect(pub.audience).toBe("public");
    expect(pub.requiresConfirmation).toBe(false);
    expect(pub.fields.every((field) => field.visibility === "public")).toBe(true);
    expect(pub.fields.some((field) => field.field_key === "internal_notes")).toBe(false);
    expect(pub.excludedRetired).toEqual([]);
    expect(pub.fields.map((field) => field.field_key)).toEqual(["name", "summary"]);
    expect(pub.excludedInternal.map((field) => field.field_key)).toContain("service_code");
    expect(full.audience).toBe("internal");
    expect(full.requiresConfirmation).toBe(true);
    expect(full.fields.some((field) => field.field_key === "internal_notes")).toBe(true);
    expect(INTERNAL_EXPORT_CONFIRMATION).toBe("This contains internal-use-only data. Please do not share it externally.");

    const tampered = resolveExportSelection({
      fields,
      declaredAudience: "public",
      requestedKeys: ["service_code", "summary", "internal_notes", "name"],
      profileName: "Client safe",
      profileId: "p1",
    });
    expect(tampered.profileName).toBe("Client safe");
    expect(tampered.audience).toBe("public");
    expect(tampered.fields.map((field) => field.field_key)).toEqual(["name", "summary"]);
    expect(tampered.excludedInternal.map((field) => field.field_key)).toEqual(expect.arrayContaining(["service_code", "internal_notes"]));
    expect(tampered.requiresConfirmation).toBe(false);
  });

  it("respects custom order, drops retired fields, and still leads with identity", () => {
    const retired = fields.map((field) => (field.field_key === "summary" ? { ...field, is_active: false } : field));
    const custom = resolveExportSelection({
      fields: retired,
      declaredAudience: "internal",
      requestedKeys: ["summary", "category", "owner_team"],
      profileName: "Custom fields",
      profileId: null,
    });
    expect(custom.fields.map((field) => field.field_key)).toEqual(["service_code", "name", "category", "owner_team"]);
    expect(custom.excludedRetired).toEqual(["summary"]);
  });

  it("neutralizes spreadsheet formulas and keeps CSV quoting", () => {
    const pub = publicPreset(fields);
    const csv = servicesToCsv(services, fields, lookups, "public", {
      columns: pub.fields,
      marking: distributionMarking("Acme Corp", "public"),
    }).replace(/^\uFEFF/, "");
    expect(csv.split("\r\n")[0]).toBe("ACME CORP \u2014 APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(csv).toContain(unicode);
    expect(csv).not.toContain(secret);
    expect(csv).not.toContain("SOC watch");
    const risky = servicesToCsv(
      [service("=SVC", 'Name, "quoted"', formula)],
      fields,
      lookups,
      "all",
      { columns: fullPreset(fields).fields },
    );
    expect(risky).toContain("'=SVC");
    expect(risky).toContain('"Name, ""quoted"""');
    expect(risky).toContain("'=CMD()");
  });
});

describe("workbook, Word, and PDF", () => {
  it("writes a real workbook whose public sheets omit internal values", () => {
    const pub = publicPreset(fields);
    const sheets = catalogSheets({
      services: services.slice(0, 1),
      fields: pub.fields,
      lookups,
      mappings: [],
      elements: CSF_ELEMENTS,
      frameworks: [CSF_FRAMEWORK, ...ADDITIONAL_FRAMEWORKS],
      tenantId: "tenant",
      audience: "public",
      marking: distributionMarking("Acme Corp", "public"),
    });
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Services", "Fields", "Lookups", "Mappings", "Coverage", "Artifacts"]);
    const bytes = buildXlsx(sheets);
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    const sheet = zipText(bytes, "xl/worksheets/sheet1.xml");
    const contentTypes = zipText(bytes, "[Content_Types].xml");
    expect(contentTypes).toContain("spreadsheetml.sheet.main+xml");
    expect(contentTypes).not.toContain("text/html");
    expect(sheet).toContain("Enterprise Security Monitoring");
    expect(sheet).toContain(unicode);
    expect(sheet).not.toContain(secret);
    expect(zipText(bytes, "xl/workbook.xml")).toContain("Coverage");
    const coverage = zipText(bytes, "xl/worksheets/sheet5.xml");
    expect(coverage).toContain(NOT_LOADED_LABEL);
    expect(coverage).toContain("NIST-CSF");
  });

  it("writes a Word catalog and a multi-page PDF with long Unicode text", async () => {
    const long = `${unicode}\n${"A very long operational description. ".repeat(80)}`;
    const many = Array.from({ length: 12 }, (_, index) => service(`SVC-${index + 1}`, `Service ${index + 1}`, long));
    const columns = publicPreset(fields).fields.filter((field) =>
      ["service_code", "name", "summary", "in_scope"].includes(field.field_key),
    );
    const doc = buildCatalogDocument({
      workspaceName: "Acme Corp",
      logoUrl: "https://example.invalid/logo.png",
      audience: "public",
      marking: distributionMarking("Acme Corp", "public"),
      generatedOn: "2026-11-06",
      services: many,
      fields: columns,
      lookups,
    });
    expect(doc.logo).toBeNull();
    expect(doc.services).toHaveLength(12);
    const docx = buildDocx(doc);
    const documentXml = zipText(docx, "word/document.xml");
    const types = zipText(docx, "[Content_Types].xml");
    expect(types).toContain("wordprocessingml.document.main+xml");
    expect(types).not.toContain("text/html");
    expect(documentXml).toContain("Acme Corp");
    expect(documentXml).toContain(unicode);
    expect(documentXml).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(documentXml).not.toContain(secret);
    expect(zipText(docx, "word/header1.xml")).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(zipText(docx, "word/footer1.xml")).toContain("PAGE");

    const pdf = await buildCatalogPdf(doc, fonts);
    expect(Buffer.from(pdf.slice(0, 5)).toString("utf8")).toBe("%PDF-");
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });
});

describe("permissions, profiles, and demo migration", () => {
  it("lets a viewer export metadata and stops them from saving a profile", () => {
    let db = signInDemo(freshDemo(), "viewer@example.com");
    const tenantId = db.activeTenantId;
    if (!tenantId) throw new Error("tenant");
    db = {
      ...db,
      members: db.members.map((member) =>
        member.tenant_id === tenantId ? { ...member, role: "viewer" satisfies Role } : member,
      ),
    };
    expect(() => saveExportProfile(db, { name: "Client", audience: "public", fieldKeys: ["name"], isDefault: false })).toThrow(
      /admin/i,
    );
    const logged = recordExport(db, {
      format: "pdf",
      profile_id: null,
      profile_name: "Public catalog",
      audience: "public",
      field_count: 4,
      row_count: 2,
      marking: true,
      framework_codes: ["NIST-CSF"],
    });
    const entry = logged.audit[0];
    expect(entry?.table_name).toBe("catalog_exports");
    expect(JSON.stringify(entry?.after_data)).not.toContain(secret);
    expect(entry?.after_data).toEqual({
      format: "pdf",
      profile_id: null,
      profile_name: "Public catalog",
      audience: "public",
      field_count: 4,
      row_count: 2,
      marking: true,
      framework_codes: ["NIST-CSF"],
    });
    const poisoned = sanitizeExportLog({
      format: "csv",
      profile_id: null,
      profile_name: "Public",
      audience: "public",
      field_count: 1,
      row_count: 1,
      marking: false,
      framework_codes: ["NIST-CSF", secret],
    });
    expect(poisoned.framework_codes[1]?.length).toBeLessThanOrEqual(40);
    expect(Object.keys(poisoned)).toEqual([
      "format",
      "profile_id",
      "profile_name",
      "audience",
      "field_count",
      "row_count",
      "marking",
      "framework_codes",
    ]);
  });

  it("keeps geography values when the group is turned off and does not change completeness while off", () => {
    let db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId ?? "";
    const before = completenessPercent(
      db.services.find((item) => item.tenant_id === tenantId)!,
      db.fields.filter((field) => field.tenant_id === tenantId),
    );
    expect(db.fields.filter((field) => field.field_group === "geography").every((field) => !field.is_active)).toBe(true);
    db = setFieldGroup(db, "geography", true);
    const service = db.services.find((item) => item.tenant_id === tenantId)!;
    const withRegion = writeField(service, "data_residency_regions", ["us"]);
    expect(readField(withRegion, "data_residency_regions")).toEqual(["us"]);
    const enabled = completenessPercent(
      withRegion,
      db.fields.filter((field) => field.tenant_id === tenantId),
    );
    expect(enabled).not.toBe(before);
    db = setFieldGroup(db, "geography", false);
    expect(readField(withRegion, "data_residency_regions")).toEqual(["us"]);
    expect(
      completenessPercent(
        withRegion,
        db.fields.filter((field) => field.tenant_id === tenantId),
      ),
    ).toBe(before);
  });

  it("migrates a V2 cache without dropping edits, mappings, or a saved profile", () => {
    const migrated = migrateDemoState({
      activeTenantId: "t1",
      tenants: [
        {
          id: "t1",
          slug: "acme-corp",
          name: "Acme Corp — edited",
          service_code_mode: "sequential",
          logo_url: null,
          is_active: true,
          created_at: "",
          updated_at: "",
        },
      ],
      fields: [
        {
          id: "field-name",
          tenant_id: "t1",
          field_key: "name",
          label: "Service",
          help_text: "Custom name help",
          input_type: "text",
          lookup_field_key: null,
          is_required: true,
          visibility: "public",
          depth_level: 1,
          sort_order: 20,
          is_active: true,
          is_standard: true,
        },
      ],
      lookups: [
        {
          id: "custom",
          tenant_id: "t1",
          field_key: "team",
          code: "harbor_team",
          label: "Harbor Team",
          description: "Kept",
          code_prefix: null,
          sort_order: 10,
          is_active: true,
        },
      ],
      services: [
        {
          id: "s1",
          tenant_id: "t1",
          service_code: "SVC-9",
          name: "Edited",
          summary: "Kept summary",
          custom_fields: { data_residency_regions: ["us"], note: "keep me" },
          target_audience: [],
        },
      ],
      mappings: [
        {
          id: "m1",
          tenant_id: "t1",
          service_id: "s1",
          element_id: elementByCode("GV.OC-01")?.id,
          coverage: "full",
          rationale: "Kept",
          notes: null,
        },
      ],
      exportProfiles: [
        {
          id: "profile-1",
          tenant_id: "t1",
          name: "Client pack",
          audience: "public",
          field_keys: ["service_code", "name", "summary"],
          is_default: true,
        },
      ],
      elements: [
        {
          id: "imported-1",
          framework_id: ADDITIONAL_FRAMEWORKS[0]?.id,
          tenant_id: "t1",
          element_type: "subcategory",
          code: "LOCAL-01",
          parent_id: null,
          title: "Workspace outcome",
          statement: "Recorded by the workspace.",
          sort_order: 10,
        },
      ],
    });
    expect(migrated?.tenants[0]?.name).toBe("Acme Corp — edited");
    expect(migrated?.services[0]?.custom_fields).toEqual({ data_residency_regions: ["us"], note: "keep me" });
    expect(migrated?.fields.find((field) => field.field_key === "name")?.help_text).toBe("Custom name help");
    expect(migrated?.fields.find((field) => field.field_key === "data_residency_regions")?.is_active).toBe(false);
    expect(migrated?.lookups[0]?.label).toBe("Harbor Team");
    expect(migrated?.mappings).toHaveLength(1);
    expect(migrated?.exportProfiles[0]?.name).toBe("Client pack");
    expect(migrated?.elements.some((element) => element.code === "LOCAL-01")).toBe(false);
    expect(migrated?.frameworks.every((framework) => framework.code === "NIST-CSF")).toBe(true);
    expect(migrated?.elements.filter((element) => element.framework_id === CSF_FRAMEWORK.id)).toHaveLength(134);
    const again = migrateDemoState(migrated);
    expect(again?.elements.filter((element) => element.code === "LOCAL-01")).toHaveLength(0);
    expect(again?.services[0]?.name).toBe("Edited");
  });
});

describe("framework selection", () => {
  it("imports authorized rows idempotently and keeps NIST counts isolated", () => {
    const framework = ADDITIONAL_FRAMEWORKS[0];
    if (!framework) throw new Error("framework");
    const csv = [
      "id,parent,title,outcome,version",
      `FN,,Example function,Workspace function statement.,${framework.version}`,
      `CAT,FN,Example category,Workspace category statement.,${framework.version}`,
      `OUT-01,CAT,Example outcome,Workspace outcome statement.,${framework.version}`,
    ].join("\n");
    const plan = planFrameworkImport({ framework, csv, existingCodes: new Set() });
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toBe(3);
    expect(planFrameworkImport({ framework: CSF_FRAMEWORK, csv, existingCodes: new Set() }).errors[0]).toMatch(/NIST/);
    expect(
      planFrameworkImport({
        framework,
        csv: csv.replaceAll(framework.version, "1999"),
        existingCodes: new Set(),
      }).errors.length,
    ).toBeGreaterThan(0);

    let db = signInDemo(freshDemo(), "owner@example.com");
    db = { ...db, frameworks: [...db.frameworks, framework] };
    const tenantId = db.activeTenantId ?? "";
    const nistBefore = aggregateCoverage({
      elements: elementsInScope(db.elements, CSF_FRAMEWORK, tenantId),
      mappings: db.mappings,
      services: db.services,
      tenantId,
      frameworkId: CSF_FRAMEWORK.id,
    });
    db = importFrameworkRows(db, framework.id, plan.rows);
    db = importFrameworkRows(db, framework.id, planFrameworkImport({ framework, csv, existingCodes: new Set(plan.rows.map((row) => row.code)) }).rows);
    const imported = elementsInScope(db.elements, framework, tenantId);
    expect(imported.filter((element) => element.element_type === "subcategory")).toHaveLength(1);
    const other = aggregateCoverage({
      elements: imported,
      mappings: [],
      services: db.services,
      tenantId,
      frameworkId: framework.id,
    });
    const nistAfter = aggregateCoverage({
      elements: elementsInScope(db.elements, CSF_FRAMEWORK, tenantId),
      mappings: db.mappings,
      services: db.services,
      tenantId,
      frameworkId: CSF_FRAMEWORK.id,
    });
    expect(other.denominator).toBe(1);
    expect(other.counts.unmapped).toBe(1);
    expect(nistAfter.denominator).toBe(nistBefore.denominator);
    expect(nistAfter.denominator).toBe(106);
    expect(nistAfter.counts).toEqual(nistBefore.counts);
    expect(STARTER_FIELDS.filter((field) => field.field_group).every((field) => field.is_active === false)).toBe(true);
  });

  it("uses the ServiceNow preset without claiming a connection and still guards internal fields", () => {
    const columns = resolveMappedColumns(fields, mappingFromPreset(SERVICENOW_PRESET), "public");
    expect(columns.columns.some((column) => column.field.field_key === "service_code")).toBe(false);
    expect(columns.excludedInternal.map((field) => field.field_key)).toContain("service_code");
    const csv = buildMappedCsv({ services: services.slice(0, 1), lookups, columns: columns.columns });
    expect(csv).toContain("short_description");
    expect(csv).toContain("Enterprise Security Monitoring");
    expect(csv).not.toContain("SVC-001");
    expect(csv).not.toContain(secret);
    expect(mappedAudience(fields, mappingFromPreset(SERVICENOW_PRESET))).toBe("internal");
    expect(SERVICENOW_PRESET.disclaimer).toMatch(/does not connect/i);
    const internal = mappingFromPreset(SERVICENOW_PRESET).map((column, index) =>
      index === 0 ? { ...column, sourceKey: "internal_notes" } : column,
    );
    expect(mappedAudience(fields, internal)).toBe("internal");
  });

  it("declares tenant isolation and admin-only profile writes in SQL", () => {
    const sql = readFileSync("supabase/migrations/0005_v3_exports_frameworks.sql", "utf8");
    expect(sql).toContain("export_profiles");
    expect(sql).toMatch(/export_profiles_insert[\s\S]*can_admin_tenant/);
    expect(sql).toMatch(/export_profiles_select[\s\S]*can_access_tenant/);
    expect(sql).toContain("log_catalog_export");
    expect(sql).toContain("import_framework_elements");
    expect(sql).toContain("NIST CSF 2.0 stays on the reference-tool core");
    expect(sql).toContain("field_group");
    expect(sql).toContain("data_residency_regions");
    expect(sql).toContain("ISO-27001");
    expect(sql).not.toContain("service_role");
    expect(sql).toContain("That outcome belongs to another workspace");
  });
});
