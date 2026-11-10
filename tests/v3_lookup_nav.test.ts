import { describe, expect, it } from "vitest";
import { formatExportValue } from "@/lib/catalog/export-value";
import { materializeFields } from "@/lib/catalog/fields";
import { addLookup, freshDemo, saveService, setFieldLookup, signInDemo } from "@/lib/data/model";
import { lookupChoices, lookupToggleFor } from "@/lib/catalog/lookup-toggle";
import { visibleLookupGroups } from "@/lib/catalog/lookups";
import { primaryNavFor } from "@/lib/catalog/primary-nav";
import { readField, writeField } from "@/lib/catalog/service";
import { TEMPLATES_LABEL } from "@/lib/catalog/shop-label";
import type { Role } from "@/lib/catalog/types";
import { migrateDemoState } from "@/lib/data/storage";

const fields = materializeFields("tenant", (key) => `field:${key}`);
const byKey = (key: string) => {
  const field = fields.find((item) => item.field_key === key);
  if (!field) throw new Error(key);
  return field;
};

describe("primary navigation", () => {
  it("places Fields after CSF Mapping and Lookups before Templates", () => {
    expect(primaryNavFor(true).map((item) => item.label)).toEqual([
      "Catalog",
      "CSF Mapping",
      "Artifacts",
      "Fields",
      "Lookups",
      TEMPLATES_LABEL,
    ]);
    expect(primaryNavFor(false).map((item) => item.label)).toEqual([
      "Catalog",
      "CSF Mapping",
      "Artifacts",
      TEMPLATES_LABEL,
    ]);
    expect(primaryNavFor(true).find((item) => item.cart)?.href).toBe("/templates");
    expect(primaryNavFor(true).map((item) => item.href)).toEqual([
      "/catalog",
      "/coverage",
      "/artifacts",
      "/admin/fields",
      "/admin/lookups",
      "/templates",
    ]);
  });
});

describe("lookup checkbox", () => {
  it("checks existing lookup fields and locks types that cannot convert safely", () => {
    expect(lookupToggleFor(byKey("category"))).toEqual({ checked: true, disabled: false, reason: null });
    expect(lookupToggleFor(byKey("owner_team")).checked).toBe(true);
    expect(lookupToggleFor(byKey("delivery_team")).checked).toBe(true);
    expect(lookupToggleFor(byKey("summary"))).toEqual({ checked: false, disabled: false, reason: null });
    expect(lookupToggleFor(byKey("name")).disabled).toBe(true);
    expect(lookupToggleFor(byKey("service_code")).checked).toBe(false);
    expect(lookupToggleFor(byKey("maturity_gap")).disabled).toBe(true);
    expect(lookupToggleFor(byKey("next_review_date")).disabled).toBe(true);
    expect(lookupToggleFor(byKey("current_maturity_cmmi"))).toMatchObject({ checked: true, disabled: true });
    expect(lookupToggleFor(byKey("target_audience"))).toMatchObject({ checked: true, disabled: true });
    expect(lookupToggleFor(byKey("approval_required")).disabled).toBe(true);
    expect(lookupToggleFor(byKey("last_reviewed_date")).disabled).toBe(true);
    expect(lookupToggleFor(byKey("intake_url")).disabled).toBe(true);
    expect(lookupToggleFor(byKey("data_residency_regions")).disabled).toBe(true);
  });

  it("turns a text field into a lookup and back without rewriting the stored sentence", () => {
    let db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId ?? "";
    const summary = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "summary");
    const service = db.services.find((item) => item.tenant_id === tenantId);
    if (!summary || !service) throw new Error("fixture");
    const original = service.summary;
    db = setFieldLookup(db, summary.id, true);
    const bound = db.fields.find((field) => field.id === summary.id);
    expect(bound?.lookup_bound).toBe(true);
    expect(bound?.lookup_field_key).toBe("summary");
    expect(bound?.input_type).toBe("textarea");
    expect(db.services.find((item) => item.id === service.id)?.summary).toBe(original);
    db = addLookup(db, {
      field_key: "summary",
      code: "watch",
      label: "Watch floor",
      description: "Recorded by the workspace",
      code_prefix: "",
      sort_order: 10,
    });
    const labeled = formatExportValue(
      writeField(service, "summary", "watch"),
      db.fields.find((field) => field.id === summary.id)!,
      db.lookups,
    );
    expect(labeled).toBe("Watch floor");
    const legacy = formatExportValue(service, db.fields.find((field) => field.id === summary.id)!, db.lookups);
    expect(legacy).toBe(original);
    expect(lookupChoices([], original).map((choice) => choice.label)).toEqual([original]);
    db = setFieldLookup(db, summary.id, false);
    const restored = db.fields.find((field) => field.id === summary.id);
    expect(restored?.lookup_bound).toBe(false);
    expect(restored?.input_type).toBe("textarea");
    expect(restored?.lookup_field_key).toBe("summary");
    expect(readField(db.services.find((item) => item.id === service.id)!, "summary")).toBe(original);
    expect(db.lookups.some((option) => option.field_key === "summary" && option.code === "watch")).toBe(true);
    const groups = visibleLookupGroups(
      db.fields.filter((field) => field.tenant_id === tenantId),
      db.lookups.filter((option) => option.tenant_id === tenantId),
    );
    expect(groups.some((group) => group.field_key === "summary")).toBe(true);
    expect(db.audit.some((entry) => entry.table_name === "lookup_options" && entry.after_data?.code === "watch")).toBe(true);
    const lookupAudit = db.audit.find((entry) => entry.table_name === "field_definitions" && entry.after_data?.lookup_bound === true);
    expect(lookupAudit?.after_data?.lookup_field_key).toBe("summary");
    expect(JSON.stringify(lookupAudit)).not.toContain(original);
  });

  it("keeps the shared team lookup when owner team is turned off and on", () => {
    let db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId ?? "";
    const owner = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "owner_team");
    const delivery = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "delivery_team");
    if (!owner || !delivery) throw new Error("fixture");
    expect(owner.lookup_field_key).toBe("team");
    expect(delivery.lookup_field_key).toBe("team");
    db = setFieldLookup(db, owner.id, false);
    expect(db.fields.find((field) => field.id === owner.id)?.lookup_field_key).toBe("team");
    expect(db.fields.find((field) => field.id === owner.id)?.input_type).toBe("text");
    expect(db.fields.find((field) => field.id === delivery.id)?.lookup_field_key).toBe("team");
    db = setFieldLookup(db, owner.id, true);
    expect(db.fields.find((field) => field.id === owner.id)?.input_type).toBe("dropdown");
    expect(db.fields.find((field) => field.id === owner.id)?.lookup_field_key).toBe("team");
  });

  it("refuses locked fields, editors, and another workspace", () => {
    let db = signInDemo(freshDemo(), "editor@example.com");
    const tenantId = db.activeTenantId ?? "";
    db = {
      ...db,
      members: db.members.map((member) =>
        member.tenant_id === tenantId ? { ...member, role: "editor" satisfies Role } : member,
      ),
    };
    const summary = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "summary");
    const gap = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "maturity_gap");
    const reviewed = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "last_reviewed_date");
    if (!summary || !gap || !reviewed) throw new Error("fixture");
    expect(() => setFieldLookup(db, summary.id, true)).toThrow(/admin/i);
    const admin = signInDemo(freshDemo(), "owner@example.com");
    const adminSummary = admin.fields.find((field) => field.tenant_id === admin.activeTenantId && field.field_key === "summary");
    const adminGap = admin.fields.find((field) => field.tenant_id === admin.activeTenantId && field.field_key === "maturity_gap");
    const adminDate = admin.fields.find((field) => field.tenant_id === admin.activeTenantId && field.field_key === "last_reviewed_date");
    const adminMaturity = admin.fields.find((field) => field.tenant_id === admin.activeTenantId && field.field_key === "current_maturity_cmmi");
    if (!adminSummary || !adminGap || !adminDate || !adminMaturity) throw new Error("fixture");
    expect(() => setFieldLookup(admin, adminGap.id, true)).toThrow(/calculation/i);
    expect(() => setFieldLookup(admin, adminDate.id, true)).toThrow(/date/i);
    expect(() => setFieldLookup(admin, adminMaturity.id, false)).toThrow(/number/i);
    expect(() => setFieldLookup(admin, "field-from-another-workspace", true)).toThrow(/not in this workspace/i);
  });

  it("keeps a lookup binding through a demo cache reload", () => {
    let db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId ?? "";
    const summary = db.fields.find((field) => field.tenant_id === tenantId && field.field_key === "summary");
    const service = db.services.find((item) => item.tenant_id === tenantId);
    if (!summary || !service) throw new Error("fixture");
    const edited = saveService(db, writeField(service, "summary", "Kept sentence"));
    db = setFieldLookup(edited, summary.id, true);
    const migrated = migrateDemoState(db);
    const again = migrateDemoState(migrated);
    expect(again?.services.find((item) => item.id === service.id)?.summary).toBe("Kept sentence");
    expect(again?.fields.find((field) => field.id === summary.id)?.lookup_bound).toBe(true);
    expect(again?.fields.find((field) => field.id === summary.id)?.lookup_field_key).toBe("summary");
    expect(again?.fields.find((field) => field.field_key === "name")?.label).toBeTruthy();
  });
});
