import { describe, expect, it } from "vitest";
import { blueprintIdsInCatalog, blueprintIssues, BLUEPRINTS, BUNDLES } from "@/lib/catalog/blueprints";
import { addPackToCart } from "@/lib/catalog/cart";
import { planBlueprintCheckout } from "@/lib/catalog/checkout";
import {
  COMPLETENESS_KEY,
  DEFAULT_COLUMN_KEYS,
  formatCatalogCell,
  moveColumn,
  resolveColumnKeys,
  toggleColumn,
} from "@/lib/catalog/columns";
import {
  clearFilterRules,
  commitDraftRule,
  filterPopupActionLabels,
  requestAdditionalFilter,
  CLOSED_COMPOSER,
} from "@/lib/catalog/filter";
import { materializeFields } from "@/lib/catalog/fields";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import {
  codeFromLabel,
  dedupeCode,
  lookupTemplateCsv,
  parseCsv,
  planLookupImport,
  suggestColumnMap,
} from "@/lib/catalog/lookup-csv";
import { buildService } from "@/lib/catalog/service";
import { EMPTY_FILTERS, type LookupOption, type ServiceRecord } from "@/lib/catalog/types";
import { checkoutServices, freshDemo, importLookups, signInDemo } from "@/lib/data/model";
import { migrateDemoState } from "@/lib/data/storage";

const fields = materializeFields("tenant", (key) => `field:${key}`);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed, index) => ({
  id: `lookup-${index}`,
  tenant_id: "tenant",
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

describe("inline catalog filters", () => {
  it("commits a rule and closes the pop-up, then opens the next composer from the page", () => {
    expect(filterPopupActionLabels()).toEqual(["Add"]);
    expect(filterPopupActionLabels().join(" ")).not.toMatch(/additional filter/i);

    const opened = requestAdditionalFilter(CLOSED_COMPOSER);
    expect(opened).toMatchObject({ popupOpen: true, composing: true, draftField: "", draftValue: "" });

    const draft = { ...opened, draftField: "status", draftOp: "eq" as const, draftValue: " active " };
    const committed = commitDraftRule(EMPTY_FILTERS, draft, "rule-1");
    expect(committed?.composer.popupOpen).toBe(false);
    expect(committed?.filters.rules).toEqual([{ id: "rule-1", fieldKey: "status", op: "eq", value: "active" }]);

    const again = requestAdditionalFilter(committed!.composer);
    expect(again.popupOpen).toBe(true);
    expect(again.composing).toBe(true);
    expect(again.draftField).toBe("");

    const stacked = commitDraftRule(committed!.filters, { ...again, draftField: "summary", draftOp: "contains", draftValue: "watch" }, "rule-2");
    expect(stacked?.filters.rules).toHaveLength(2);
    expect(stacked?.composer.popupOpen).toBe(false);

    const cleared = clearFilterRules({ ...stacked!.filters, scope: "archived", query: "soc" });
    expect(cleared.filters).toEqual({ query: "soc", scope: "active", rules: [] });
    expect(commitDraftRule(EMPTY_FILTERS, CLOSED_COMPOSER, "nope")).toBeNull();
  });
});

describe("blueprint catalog", () => {
  it("ships a valid practitioner catalog and sized bundles", () => {
    expect(blueprintIssues(STARTER_LOOKUPS)).toEqual([]);
    expect(BLUEPRINTS.length).toBeGreaterThanOrEqual(48);
    expect(BLUEPRINTS.length).toBeLessThanOrEqual(55);
    expect(BUNDLES.map((bundle) => bundle.blueprintIds.length)).toEqual([12, 24, 42, 12, 12, 8]);
    const small = new Set(BUNDLES[0]?.blueprintIds);
    const medium = new Set(BUNDLES[1]?.blueprintIds);
    for (const id of small) expect(medium.has(id)).toBe(true);
  });

  it("detects catalog duplicates and numbers checkout codes in both styles", () => {
    const present = blueprintIdsInCatalog([
      { name: "Enterprise Security Monitoring", custom_fields: {} },
      { name: "Something else", custom_fields: { blueprint_id: "iam-pam" } },
    ]);
    expect(present.has("soc-monitoring")).toBe(true);
    expect(present.has("iam-pam")).toBe(true);

    const added = addPackToCart(["soc-monitoring"], BUNDLES[0]!.blueprintIds, { skip: present });
    expect(added.cart[0]).toBe("soc-monitoring");
    expect(added.added).not.toContain("soc-monitoring");
    expect(added.skipped).toContain("soc-monitoring");

    const sequential = planBlueprintCheckout({
      tenantId: "tenant",
      blueprintIds: ["soc-monitoring", "iam-lifecycle", "end-edr"],
      mode: "sequential",
      status: "draft",
      ownerTeam: "soc",
      deliveryTeam: null,
      existingCodes: ["SVC-004"],
      prefixForCategory: () => null,
      reviewedOn: "2026-11-06",
      now: "2026-11-06T12:00:00.000Z",
      idFor: (_id, index) => `svc-${index}`,
    });
    expect(sequential.map((service) => service.service_code)).toEqual(["SVC-005", "SVC-006", "SVC-007"]);
    expect(sequential[0]?.status).toBe("draft");
    expect(sequential[0]?.owner_team).toBe("soc");
    expect(sequential[0]?.delivery_team).toBe("soc");
    expect(sequential[0]?.internal_name).toBeNull();
    expect(sequential[0]?.support_contact).toBeNull();
    expect(sequential[0]?.current_tooling_notes).toBeNull();
    expect(sequential[0]?.third_party_providers).toBeNull();
    expect(sequential[0]?.internal_notes).toBeNull();
    expect(sequential[0]?.next_review_date).toBe("2027-02-06");
    expect(sequential[0]?.custom_fields.blueprint_id).toBe("soc-monitoring");
    expect(sequential[0]?.custom_fields.nist_csf_subcategories).toEqual(expect.any(Array));

    const prefixed = planBlueprintCheckout({
      tenantId: "tenant",
      blueprintIds: ["soc-monitoring", "iam-lifecycle", "soc-hunting"],
      mode: "category_prefix",
      status: "draft",
      ownerTeam: "corp_security_grc",
      deliveryTeam: "iam",
      existingCodes: ["SEC-SOC-007", "SVC-001"],
      prefixForCategory: (category) => (category === "secops" ? "SOC" : category === "iam" ? "IAM" : null),
      reviewedOn: "2026-11-06",
      now: "2026-11-06T12:00:00.000Z",
    });
    expect(prefixed.map((service) => service.service_code)).toEqual(["SEC-SOC-008", "SEC-IAM-001", "SEC-SOC-009"]);
    expect(prefixed.every((service) => service.delivery_team === "iam")).toBe(true);

    const onChange = planBlueprintCheckout({
      tenantId: "tenant",
      blueprintIds: ["grc-exceptions"],
      mode: "sequential",
      status: "draft",
      ownerTeam: "corp_security_grc",
      deliveryTeam: null,
      existingCodes: [],
      prefixForCategory: () => null,
      reviewedOn: "2026-11-06",
      now: "2026-11-06T12:00:00.000Z",
    });
    expect(onChange[0]?.service_code).toBe("SVC-001");
    expect(onChange[0]?.next_review_date).toBeNull();
    expect(onChange[0]?.last_reviewed_date).toBeNull();
  });
});

describe("catalog columns", () => {
  it("selects, reorders, formats every field type, and hides retired fields", () => {
    const active = new Set(fields.filter((field) => field.is_active).map((field) => field.field_key));
    expect(resolveColumnKeys(null, active)).toEqual(DEFAULT_COLUMN_KEYS);
    const retired = new Set(active);
    retired.delete("summary");
    const hidden = resolveColumnKeys(["summary", "status", "service_code", "name", "nope"], retired);
    expect(hidden).toEqual(["service_code", "name", "status"]);

    let keys = toggleColumn(DEFAULT_COLUMN_KEYS, "summary", true);
    expect(keys.at(-1)).toBe("summary");
    keys = toggleColumn(keys, "summary", false);
    expect(keys).not.toContain("summary");
    keys = toggleColumn(keys, "service_code", false);
    expect(keys[0]).toBe("service_code");

    const moved = moveColumn(["service_code", "name", "status", "category", COMPLETENESS_KEY], "category", "up");
    expect(moved).toEqual(["service_code", "name", "category", "status", COMPLETENESS_KEY]);
    expect(moveColumn(moved, "category", "up")).toEqual(moved);
    expect(moveColumn(moved, "name", "down")).toEqual(moved);

    const service = buildService("tenant", {
      service_code: "SVC-010",
      name: "Column fixture",
      category: "secops",
      status: "active",
      service_tier: "tier_1",
      summary: "A".repeat(90),
      owner_team: "soc",
      approval_required: false,
      target_audience: ["executives", "security_team"],
      primary_csf_function: "detect",
      capability_rating: "partial",
      current_maturity_cmmi: 2,
      target_maturity_cmmi: 4,
      threats_addressed: "Lateral movement across the estate after a missed patch window.",
      last_reviewed_date: "2026-08-12",
      review_cadence: "quarterly",
      intake_url: "https://example.com/intake",
    });

    expect(formatCatalogCell("approval_required", service, field("approval_required"), lookups, fields).text).toBe("No");
    expect(formatCatalogCell("target_audience", service, field("target_audience"), lookups, fields).pills).toEqual([
      "Executives & Board",
      "Security Team",
    ]);
    expect(formatCatalogCell("status", service, field("status"), lookups, fields)).toMatchObject({ kind: "badge", text: "Active" });
    expect(formatCatalogCell("service_tier", service, field("service_tier"), lookups, fields).text).toBe("Tier 1");
    expect(formatCatalogCell("capability_rating", service, field("capability_rating"), lookups, fields).tone).toBe("warning");
    expect(formatCatalogCell("primary_csf_function", service, field("primary_csf_function"), lookups, fields)).toMatchObject({
      text: "DE",
      title: "Detect",
    });
    expect(formatCatalogCell("current_maturity_cmmi", service, field("current_maturity_cmmi"), lookups, fields)).toMatchObject({
      kind: "badge",
      text: "2",
    });
    expect(formatCatalogCell("maturity_gap", service, field("maturity_gap"), lookups, fields)).toMatchObject({ text: "2", tone: "warning" });
    expect(formatCatalogCell("next_review_date", service, field("next_review_date"), lookups, fields).text).toBe("12 Nov 2026");
    expect(formatCatalogCell("last_reviewed_date", service, field("last_reviewed_date"), lookups, fields).text).toBe("12 Aug 2026");
    const summary = formatCatalogCell("summary", service, field("summary"), lookups, fields);
    expect(summary.text.endsWith("…")).toBe(true);
    expect(summary.title?.length).toBe(90);
    expect(formatCatalogCell("threats_addressed", service, field("threats_addressed"), lookups, fields).text).toContain("Lateral");
    expect(formatCatalogCell(COMPLETENESS_KEY, service, undefined, lookups, fields).kind).toBe("meter");
    expect(formatCatalogCell("category", service, field("category"), lookups, fields).text).toContain("Security Operations");
  });
});

describe("lookup CSV import", () => {
  it("parses quoted CSV, maps columns, dedupes 500 generated codes, and bulk-upserts", () => {
    const parsed = parseCsv('\uFEFFname,title,notes\r\n"Smith, Jordan","Identity, IAM","Line one\r\nLine two"\r\n,\r\n');
    expect(parsed[0]).toEqual(["name", "title", "notes"]);
    expect(parsed[1]?.[0]).toBe("Smith, Jordan");
    expect(parsed[1]?.[2]).toBe("Line one\nLine two");
    expect(suggestColumnMap(["Full Name", "Department", "Code"])).toMatchObject({ label: 0, description: 1, code: 2 });

    const template = lookupTemplateCsv("team");
    expect(template.split(/\r\n/).filter(Boolean)).toHaveLength(3);
    expect(lookupTemplateCsv("category")).toContain("code_prefix");

    const lines = ["full_name,email"];
    for (let index = 1; index <= 500; index += 1) {
      const label = index === 2 ? "Associate 001" : `Associate ${String(index).padStart(3, "0")}`;
      lines.push(`"${label}","person${index}@example.com"`);
    }
    const table = parseCsv(lines.join("\n"));
    const map = suggestColumnMap(table[0] ?? []);
    const plan = planLookupImport({ table, map, existingCodes: ["existing_lead"], fieldKey: "team" });
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toBe(500);
    expect(plan.updates).toBe(0);
    expect(plan.rows.find((row) => row.code === "associate_001_2")?.label).toBe("Associate 001");
    expect(plan.preview).toHaveLength(8);
    expect(dedupeCode(codeFromLabel("María Núñez"), new Set(["maria_nunez"]))).toBe("maria_nunez_2");

    const explicit = planLookupImport({
      table: parseCsv("label,code\nReactivated,old_code\n,\n"),
      map: { label: 0, code: 1, description: null, code_prefix: null },
      existingCodes: ["old_code"],
      fieldKey: "team",
    });
    expect(explicit.updates).toBe(1);
    expect(explicit.skippedBlank).toBe(1);

    let db = signInDemo(freshDemo(), "demo.practitioner@example.com");
    const retired = db.lookups.find((option) => option.field_key === "team" && option.code === "soc");
    expect(retired).toBeTruthy();
    db = {
      ...db,
      lookups: db.lookups.map((option) => (option.id === retired?.id ? { ...option, is_active: false } : option)),
    };
    const imported = importLookups(
      db,
      "team",
      [
        ...plan.rows.slice(0, 500).map((row) => ({
          code: row.code,
          label: row.label,
          description: row.description,
          code_prefix: null,
        })),
        { code: "soc", label: "Security Operations Roster", description: "Reactivated", code_prefix: null },
      ],
      "2026-11-06T12:00:00.000Z",
    );
    expect(imported.created).toBe(500);
    expect(imported.updated).toBe(1);
    expect(imported.db.lookups.find((option) => option.code === "soc" && option.tenant_id === db.activeTenantId)?.is_active).toBe(true);
    const audits = imported.db.audit.filter((entry) => entry.after_data?.kind === "lookup_import");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after_data).toMatchObject({ created: 500, updated: 1, field_key: "team" });
  });
});

describe("demo migration and checkout audit", () => {
  it("keeps V1 and V1.1 edits and records one checkout audit", () => {
    const migrated = migrateDemoState({
      session: { userId: "user", email: "editor@example.com" },
      activeTenantId: "t1",
      tenants: [
        {
          id: "t1",
          slug: "acme-corp",
          name: "Acme Corp — edited",
          service_code_mode: "category_prefix",
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      ],
      members: [],
      fields: [{ id: "f", tenant_id: "t1", field_key: "name", label: "Service", help_text: "", input_type: "text", lookup_field_key: null, is_required: true, visibility: "public", depth_level: 1, sort_order: 10, is_active: true, is_standard: true }],
      lookups: [
        {
          id: "custom",
          tenant_id: "t1",
          field_key: "team",
          code: "harbor_team",
          label: "Harbor Team",
          description: "Kept from V1",
          code_prefix: null,
          sort_order: 10,
          is_active: true,
        },
      ],
      services: [
        {
          id: "s1",
          tenant_id: "t1",
          service_code: "SEC-SOC-004",
          name: "Edited monitoring entry",
          summary: "User kept this summary.",
          target_audience: ["security_team"],
          approval_required: true,
          custom_fields: { note: "keep me" },
        },
      ],
      audit: [{ id: "a1", tenant_id: "t1", actor_user_id: null, actor_label: "editor@example.com", table_name: "services", row_id: "s1", action: "update", before_data: null, after_data: { name: "Edited monitoring entry" }, created_at: "2026-02-01T00:00:00.000Z" }],
    });
    expect(migrated?.tenants[0]?.name).toBe("Acme Corp — edited");
    expect(migrated?.tenants[0]?.catalog_columns).toBeNull();
    expect(migrated?.tenants[0]?.logo_url).toContain("data:image/svg+xml");
    expect(migrated?.tenants[0]?.service_code_mode).toBe("category_prefix");
    expect(migrated?.services[0]?.name).toBe("Edited monitoring entry");
    expect(migrated?.services[0]?.summary).toBe("User kept this summary.");
    expect(migrated?.services[0]?.custom_fields).toEqual({ note: "keep me" });
    expect(migrated?.services[0]?.archived_at).toBeNull();
    expect(migrated?.lookups[0]?.label).toBe("Harbor Team");
    expect(migrated?.audit).toHaveLength(1);

    const v11 = migrateDemoState({
      ...migrated,
      tenants: [{ ...migrated!.tenants[0], logo_url: null, catalog_columns: { keys: ["service_code", "name", "status"] } }],
      services: [{ ...migrated!.services[0], archived_at: "2026-10-01T00:00:00.000Z" }],
    });
    expect(v11?.tenants[0]?.logo_url).toBeNull();
    expect(v11?.tenants[0]?.catalog_columns?.keys).toEqual(["service_code", "name", "status"]);
    expect(v11?.services[0]?.archived_at).toBe("2026-10-01T00:00:00.000Z");
    expect(v11?.services[0]?.name).toBe("Edited monitoring entry");

    let db = signInDemo(freshDemo(), "demo.practitioner@example.com");
    const tenantId = db.activeTenantId!;
    const planned = planBlueprintCheckout({
      tenantId,
      blueprintIds: ["sat-training", "soc-monitoring"],
      mode: "sequential",
      status: "draft",
      ownerTeam: "vciso_leadership",
      deliveryTeam: null,
      existingCodes: db.services.filter((service) => service.tenant_id === tenantId).map((service) => service.service_code),
      prefixForCategory: () => null,
      reviewedOn: "2026-11-06",
      now: "2026-11-06T12:00:00.000Z",
    }) as ServiceRecord[];
    db = checkoutServices(db, planned, "2026-11-06T12:00:00.000Z");
    const checkoutAudits = db.audit.filter((entry) => entry.after_data?.kind === "blueprint_checkout");
    expect(checkoutAudits).toHaveLength(1);
    expect(checkoutAudits[0]?.after_data?.count).toBe(2);
    expect(db.services.filter((service) => service.tenant_id === tenantId).length).toBeGreaterThan(2);
  });
});

function field(key: string) {
  const found = fields.find((item) => item.field_key === key);
  if (!found) throw new Error(key);
  return found;
}
