import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildCatalogDocument } from "@/lib/catalog/catalog-document";
import { buildCatalogWorkbook } from "@/lib/catalog/catalog-workbook";
import { servicesToCsv } from "@/lib/catalog/csv";
import { buildDocx } from "@/lib/catalog/docx";
import { fullPreset, publicPreset, resolveExportSelection } from "@/lib/catalog/export-plan";
import { STARTER_FIELDS, materializeFields } from "@/lib/catalog/fields";
import { buildMappedCsv, mappingFromPreset, resolveMappedColumns, JIRA_PRESET } from "@/lib/catalog/import-presets";
import { lookupToggleFor } from "@/lib/catalog/lookup-toggle";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { isReasonableEmail, supportContactError, validateService } from "@/lib/catalog/service";
import { buildService } from "@/lib/catalog/service";
import { migrateStockField } from "@/lib/catalog/stock-fields";
import type { LookupOption } from "@/lib/catalog/types";
import { freshDemo, saveField, signInDemo } from "@/lib/data/model";
import { migrateDemoState } from "@/lib/data/storage";

const fields = materializeFields("t", (key) => key);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: seed.code + seed.field_key,
  tenant_id: "t",
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

describe("stock labels and public defaults", () => {
  it("publishes only Service Name and Service Description", () => {
    expect(STARTER_FIELDS.filter((field) => field.visibility === "public").map((field) => field.field_key).sort()).toEqual([
      "name",
      "summary",
    ]);
    expect(STARTER_FIELDS.find((field) => field.field_key === "summary")?.label).toBe("Service Description");
    expect(STARTER_FIELDS.find((field) => field.field_key === "description")?.label).toBe("Full Service Description");
    expect(STARTER_FIELDS.find((field) => field.field_key === "service_code")?.visibility).toBe("internal");
    expect(STARTER_FIELDS.find((field) => field.field_key === "description")?.visibility).toBe("internal");
    expect(STARTER_FIELDS.find((field) => field.field_key === "support_contact")?.help_text).toMatch(/email address/i);
  });

  it("renames stock labels and keeps a custom label and a visibility override", () => {
    const summary = fields.find((field) => field.field_key === "summary");
    if (!summary) throw new Error("summary");
    const stock = migrateStockField({ ...summary, label: "Executive Summary", help_text: "One or two sentences a leader or client can read without the full description.", visibility: "public", visibility_overridden: false });
    expect(stock.label).toBe("Service Description");
    expect(stock.visibility).toBe("public");

    const custom = migrateStockField({ ...summary, label: "Client blurb", visibility: "public", visibility_overridden: false });
    expect(custom.label).toBe("Client blurb");

    const category = fields.find((field) => field.field_key === "category");
    if (!category) throw new Error("category");
    const stillStock = migrateStockField({ ...category, visibility: "public", visibility_overridden: false });
    expect(stillStock.visibility).toBe("internal");
    expect(stillStock.visibility_overridden).toBe(false);

    const chosen = migrateStockField({ ...category, visibility: "internal", visibility_overridden: false });
    expect(chosen.visibility).toBe("internal");
    expect(chosen.visibility_overridden).toBe(true);

    const opened = migrateStockField({
      ...fields.find((field) => field.field_key === "internal_notes")!,
      visibility: "public",
      visibility_overridden: false,
    });
    expect(opened.visibility).toBe("public");
    expect(opened.visibility_overridden).toBe(true);
  });

  it("migrates a demo cache without rewriting service text or a custom label", () => {
    const migrated = migrateDemoState({
      activeTenantId: "t1",
      tenants: [{ id: "t1", slug: "acme-corp", name: "Acme", service_code_mode: "sequential", logo_url: null, is_active: true, created_at: "", updated_at: "" }],
      fields: [
        {
          id: "summary",
          tenant_id: "t1",
          field_key: "summary",
          label: "Executive Summary",
          help_text: "One or two sentences a leader or client can read without the full description.",
          input_type: "textarea",
          lookup_field_key: null,
          is_required: true,
          visibility: "public",
          depth_level: 1,
          sort_order: 60,
          is_active: true,
          is_standard: true,
        },
        {
          id: "name",
          tenant_id: "t1",
          field_key: "name",
          label: "Offering",
          help_text: "Custom",
          input_type: "text",
          lookup_field_key: null,
          is_required: true,
          visibility: "internal",
          depth_level: 1,
          sort_order: 20,
          is_active: true,
          is_standard: true,
        },
        {
          id: "code",
          tenant_id: "t1",
          field_key: "service_code",
          label: "Service Code",
          help_text: "Unique catalog ID. Suggested as SVC-001, or SEC-SOC-001 when this workspace uses category prefixes. Always editable.",
          input_type: "text",
          lookup_field_key: null,
          is_required: true,
          visibility: "public",
          depth_level: 1,
          sort_order: 10,
          is_active: true,
          is_standard: true,
        },
      ],
      lookups: [],
      services: [{ id: "s1", tenant_id: "t1", service_code: "SVC-9", name: "Kept name", summary: "Kept description", support_contact: "ask the desk", target_audience: [] }],
    });
    expect(migrated?.fields.find((field) => field.field_key === "summary")?.label).toBe("Service Description");
    expect(migrated?.fields.find((field) => field.field_key === "name")?.label).toBe("Offering");
    expect(migrated?.fields.find((field) => field.field_key === "name")?.visibility).toBe("internal");
    expect(migrated?.fields.find((field) => field.field_key === "service_code")?.visibility).toBe("internal");
    expect(migrated?.services[0]?.summary).toBe("Kept description");
    expect(migrated?.services[0]?.support_contact).toBe("ask the desk");
    const again = migrateDemoState(migrated);
    expect(again?.fields.find((field) => field.field_key === "name")?.visibility).toBe("internal");
    expect(again?.services[0]?.summary).toBe("Kept description");
  });

  it("records an admin visibility change so a later migration keeps it", () => {
    let db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId ?? "";
    const category = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "category");
    if (!category) throw new Error("category");
    expect(category.visibility).toBe("internal");
    db = saveField(db, { ...category, visibility: "public" });
    const saved = db.fields.find((field) => field.id === category.id);
    expect(saved?.visibility).toBe("public");
    expect(saved?.visibility_overridden).toBe(true);
    const migrated = migrateDemoState(db);
    expect(migrated?.fields.find((field) => field.id === category.id)?.visibility).toBe("public");
  });
});

describe("support email", () => {
  it("accepts a mailbox, keeps a legacy note, and blocks lookup conversion", () => {
    expect(isReasonableEmail("soc@example.com")).toBe(true);
    expect(isReasonableEmail("not an email")).toBe(false);
    const support = fields.find((field) => field.field_key === "support_contact");
    if (!support) throw new Error("support");
    expect(lookupToggleFor(support).disabled).toBe(true);
    expect(lookupToggleFor({ ...support, lookup_bound: true }).checked).toBe(false);
    const legacy = buildService("t", {
      service_code: "SVC-1",
      name: "Name",
      category: "secops",
      status: "active",
      service_tier: "tier_0",
      summary: "Description",
      owner_team: "soc",
      support_contact: "ask the desk",
    });
    expect(validateService(legacy, fields).support_contact).toMatch(/correct it or clear it/);
    expect(legacy.support_contact).toBe("ask the desk");
    const valid = { ...legacy, support_contact: "soc@example.com" };
    expect(validateService(valid, fields).support_contact).toBeUndefined();
    const empty = { ...legacy, support_contact: null };
    expect(supportContactError(empty.support_contact, false)).toBeNull();
  });
});

describe("public files omit an internal service code", () => {
  it("limits csv, workbook, word, and a jira preset to public fields", () => {
    const service = buildService("t", {
      service_code: "SVC-001",
      name: "Enterprise Security Monitoring",
      category: "secops",
      status: "active",
      service_tier: "tier_0",
      summary: "Detect threats.",
      owner_team: "soc",
      description: "Long internal narrative",
      support_contact: "soc@example.com",
      internal_notes: "secret note",
    });
    const pub = publicPreset(fields);
    const csv = servicesToCsv([service], fields, lookups, "public", { columns: pub.fields }).replace(/^\uFEFF/, "");
    expect(csv.split("\r\n")[0]).toContain("Service Name");
    expect(csv).toContain("Service Description");
    expect(csv).toContain("Detect threats.");
    expect(csv).not.toContain("SVC-001");
    expect(csv).not.toContain("Full Service Description");
    expect(csv).not.toContain("Long internal narrative");
    expect(csv).not.toContain("soc@example.com");

    const workbook = buildCatalogWorkbook({
      services: [service],
      fields: pub.fields,
      lookups,
      mappings: [],
      elements: [],
      frameworks: [],
      tenantId: "t",
      audience: "public",
      marking: null,
    });
    const files = unzipSync(workbook);
    const servicesSheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    const mappingsSheet = strFromU8(files["xl/worksheets/sheet4.xml"]);
    const coverageSheet = strFromU8(files["xl/worksheets/sheet5.xml"]);
    expect(servicesSheet).toContain("Service Description");
    expect(servicesSheet).not.toContain("SVC-001");
    expect(mappingsSheet).not.toContain("SVC-001");
    expect(coverageSheet).not.toContain("SVC-001");
    expect(strFromU8(files["xl/worksheets/sheet2.xml"])).not.toContain("service_code");

    const doc = buildCatalogDocument({
      workspaceName: "Acme Corp",
      logoUrl: null,
      audience: "public",
      marking: null,
      generatedOn: "2026-11-08",
      services: [service],
      fields: pub.fields,
      lookups,
    });
    expect(doc.services[0]?.heading).toBe("Enterprise Security Monitoring");
    expect(doc.services[0]?.heading).not.toContain("SVC-001");
    const word = strFromU8(unzipSync(buildDocx(doc))["word/document.xml"]);
    expect(word).toContain("Service Description");
    expect(word).not.toContain("SVC-001");

    const jira = resolveMappedColumns(fields, mappingFromPreset(JIRA_PRESET), "public");
    const jiraCsv = buildMappedCsv({ services: [service], lookups, columns: jira.columns });
    expect(jira.columns.some((column) => column.field.visibility === "internal")).toBe(false);
    expect(jiraCsv).not.toContain("SVC-001");
    expect(jiraCsv).toContain("Enterprise Security Monitoring");

    const full = fullPreset(fields);
    const fullCsv = servicesToCsv([service], fields, lookups, "all", { columns: full.fields });
    expect(fullCsv).toContain("SVC-001");
    expect(fullCsv).toContain("Full Service Description");
    const opted = resolveExportSelection({
      fields: fields.map((field) => (field.field_key === "service_code" ? { ...field, visibility: "public", visibility_overridden: true } : field)),
      declaredAudience: "public",
      requestedKeys: null,
      profileName: "Public catalog",
      profileId: null,
    });
    expect(opted.fields.map((field) => field.field_key)).toContain("service_code");
    expect(opted.audience).toBe("public");
  });
});
