import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planBlueprintCheckout } from "@/lib/catalog/checkout";
import { AGGREGATION_SUMMARY, aggregateCoverage, dashboardOutcomes, outcomeMatches } from "@/lib/catalog/coverage";
import { CSF_CATEGORIES, CSF_ELEMENTS, CSF_FRAMEWORK, CSF_FUNCTIONS, CSF_OUTCOMES, elementByCode, outcomeChoiceGroups } from "@/lib/catalog/framework";
import { STARTER_FIELDS } from "@/lib/catalog/fields";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import core from "@/lib/catalog/nist-csf-2.0.json";
import { DEMO_USER_ID, type Role, type ServiceRecord } from "@/lib/catalog/types";
import {
  checkoutServices,
  deleteService,
  freshDemo,
  removeOutcomeMapping,
  saveOutcomeMapping,
  signInDemo,
  type CatalogDb,
} from "@/lib/data/model";
import { migrateDemoState } from "@/lib/data/storage";

const CONTENT_SHA = "1104ec7ac38bab958c2159083bd7240a8261647447cf77ada39f73204a2693b8";
const GV_STATEMENT =
  "The organization's cybersecurity risk management strategy, expectations, and policy are established, communicated, and monitored";
const GV_OC_STATEMENT =
  "The circumstances - mission, stakeholder expectations, dependencies, and legal, regulatory, and contractual requirements - surrounding the organization's cybersecurity risk management decisions are understood";
const GV_OC_01 = "The organizational mission is understood and informs cybersecurity risk management";
const DE_CM_01 = "Networks and network services are monitored to find potentially adverse events";
const RC_CO_04 = "Public updates on incident recovery are shared using approved methods and messaging";

describe("NIST CSF 2.0 core", () => {
  it("matches the reference-tool extract and does not invent outcomes", () => {
    const canonical = core.elements.map((element) => ({
      element_type: element.element_type,
      code: element.code,
      parent_code: element.parent_code,
      title: element.title,
      statement: element.statement,
    }));
    const digest = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
    expect(digest).toBe(CONTENT_SHA);
    expect(CSF_FRAMEWORK.content_sha256).toBe(CONTENT_SHA);
    expect(CSF_FRAMEWORK.version).toBe("2.0");
    expect(CSF_FRAMEWORK.publication).toBe("NIST CSWP 29");
    expect(CSF_FRAMEWORK.source_url).toContain("csrc.nist.gov");
    expect(CSF_FUNCTIONS.map((element) => element.code)).toEqual(["GV", "ID", "PR", "DE", "RS", "RC"]);
    expect(CSF_CATEGORIES).toHaveLength(22);
    expect(CSF_OUTCOMES).toHaveLength(106);
    expect(elementByCode("GV")?.statement).toBe(GV_STATEMENT);
    expect(elementByCode("GV")?.title).toBe("GOVERN");
    expect(elementByCode("GV.OC")?.statement).toBe(GV_OC_STATEMENT);
    expect(elementByCode("GV.OC-01")?.statement).toBe(GV_OC_01);
    expect(elementByCode("DE.CM-01")?.statement).toBe(DE_CM_01);
    expect(elementByCode("RC.CO-04")?.statement).toBe(RC_CO_04);
    expect(elementByCode("ID.BE")).toBeUndefined();
    expect(elementByCode("DE.CM-04")).toBeUndefined();
    expect(CSF_ELEMENTS.some((element) => element.statement.startsWith("[Withdrawn"))).toBe(false);
    const parents = new Map(CSF_ELEMENTS.map((element) => [element.id, element]));
    for (const outcome of CSF_OUTCOMES) {
      const category = parents.get(outcome.parent_id ?? "");
      expect(category?.element_type).toBe("category");
      expect(outcome.code.startsWith(`${category?.code}-`)).toBe(true);
    }
    expect(new Set(CSF_ELEMENTS.map((element) => element.code)).size).toBe(CSF_ELEMENTS.length);
  });

  it("is seeded idempotently in SQL with read and write policies", () => {
    const sql = readFileSync("supabase/migrations/0004_v2_csf_mappings.sql", "utf8");
    expect(sql).toContain(GV_OC_01);
    expect(sql).toContain(CSF_FRAMEWORK.id);
    expect(sql).toContain("on conflict (framework_id, code) do update");
    expect(sql).toContain("on conflict (code, version) do update");
    expect(sql).toContain("unique (service_id, element_id)");
    expect(sql).toMatch(/create policy mappings_select[\s\S]*can_access_tenant\(tenant_id\)/);
    expect(sql).toMatch(/create policy mappings_insert[\s\S]*can_write_services\(tenant_id\)/);
    expect(sql).toMatch(/create policy mappings_update[\s\S]*can_write_services\(tenant_id\)/);
    expect(sql).toMatch(/create policy mappings_delete[\s\S]*can_write_services\(tenant_id\)/);
    expect(sql).toContain("create policy frameworks_select");
    expect(sql).not.toMatch(/create policy \w+ on public\.frameworks\s+for insert/);
    expect(sql).toContain("trg_b_mapping_audit");
    expect(sql).toContain("from anon, public");
    expect(sql.match(/\$sscb\$subcategory\$sscb\$/g)?.length).toBe(106);
    const seed = readFileSync("supabase/seed.sql", "utf8");
    expect(seed).toContain(GV_OC_01);
    expect(seed).toContain("0004_v2_csf_mappings.sql");
  });
});

describe("outcome assessments", () => {
  it("upserts one row per service and outcome, then removes it", () => {
    let db = editorDb();
    const service = activeService(db);
    const outcome = elementByCode("GV.OC-01");
    if (!outcome) throw new Error("missing outcome");
    db = saveOutcomeMapping(
      db,
      { serviceId: service.id, elementId: outcome.id, coverage: "partial", rationale: "Scope is detection only.", notes: "Review next quarter." },
      "2026-11-06T12:00:00.000Z",
    );
    db = saveOutcomeMapping(
      db,
      { serviceId: service.id, elementId: outcome.id, coverage: "full", rationale: "The runbook covers the mission link." },
      "2026-11-06T13:00:00.000Z",
    );
    const rows = db.mappings.filter((mapping) => mapping.service_id === service.id && mapping.element_id === outcome.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.coverage).toBe("full");
    expect(rows[0]?.rationale).toBe("The runbook covers the mission link.");
    expect(rows[0]?.notes).toBeNull();
    expect(db.audit[0]?.action).toBe("update");
    expect(db.audit[0]?.table_name).toBe("service_outcome_mappings");
    expect(db.audit[0]?.after_data?.element_code).toBe("GV.OC-01");

    db = removeOutcomeMapping(db, rows[0]!.id, "2026-11-06T14:00:00.000Z");
    expect(db.mappings.some((mapping) => mapping.element_id === outcome.id)).toBe(false);
    expect(db.audit[0]?.action).toBe("delete");
  });

  it("keeps viewers read-only and blocks cross-tenant writes", () => {
    const seeded = signInDemo(freshDemo(), "viewer@example.com");
    const acme = seeded.tenants.find((tenant) => tenant.slug === "acme-corp");
    const meridian = seeded.tenants.find((tenant) => tenant.slug === "meridian-health");
    if (!acme || !meridian) throw new Error("sample workspaces");
    const outcome = CSF_OUTCOMES[0];
    if (!outcome) throw new Error("outcome");
    let db = withRole(seeded, "viewer");
    const own = db.services.find((service) => service.tenant_id === acme.id);
    if (!own) throw new Error("service");
    expect(() => saveOutcomeMapping(db, { serviceId: own.id, elementId: outcome.id, coverage: "full" })).toThrow(/permission/i);
    expect(() => removeOutcomeMapping(db, "missing")).toThrow(/permission/i);

    db = {
      ...withRole(seeded, "editor"),
      activeTenantId: acme.id,
      members: seeded.members.filter((member) => member.tenant_id === acme.id).map((member) => ({ ...member, role: "editor" as const })),
    };
    const foreign = db.services.find((service) => service.tenant_id === meridian.id);
    if (!foreign) throw new Error("foreign service");
    expect(() => saveOutcomeMapping(db, { serviceId: foreign.id, elementId: outcome.id, coverage: "full" })).toThrow(/another workspace/i);
    expect(() => saveOutcomeMapping(db, { serviceId: own.id, elementId: outcome.id, coverage: "high" })).toThrow(/full, partial, or none/i);
    const category = CSF_CATEGORIES[0];
    if (!category) throw new Error("category");
    expect(() => saveOutcomeMapping(db, { serviceId: own.id, elementId: category.id, coverage: "full" })).toThrow(/subcategory/i);

    db = saveOutcomeMapping(withRole(seeded, "tenant_admin"), { serviceId: own.id, elementId: outcome.id, coverage: "none" });
    expect(db.mappings).toHaveLength(1);
    expect(db.mappings[0]?.tenant_id).toBe(acme.id);
  });

  it("drops assessments when the service is deleted", () => {
    let db = withRole(signInDemo(freshDemo(), "admin@example.com"), "tenant_admin");
    const service = activeService(db);
    const outcome = elementByCode("DE.CM-01");
    if (!outcome) throw new Error("outcome");
    db = saveOutcomeMapping(db, { serviceId: service.id, elementId: outcome.id, coverage: "full" });
    db = deleteService(db, service.id, "2026-11-06T15:00:00.000Z");
    expect(db.services.some((item) => item.id === service.id)).toBe(false);
    expect(db.mappings.some((mapping) => mapping.service_id === service.id)).toBe(false);
    expect(db.audit[0]?.table_name).toBe("services");
    expect(db.audit[0]?.action).toBe("delete");
  });
});

describe("coverage aggregation", () => {
  it("uses the strongest active assessment and ignores hints, archive, and maturity", () => {
    const db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId;
    if (!tenantId) throw new Error("tenant");
    const untouched = aggregateCoverage({
      elements: CSF_ELEMENTS,
      mappings: [],
      services: db.services,
      tenantId,
    });
    expect(untouched.denominator).toBe(106);
    expect(untouched.counts).toEqual({ full: 0, partial: 0, none: 0, unmapped: 106 });
    expect(db.services.some((service) => service.primary_csf_function)).toBe(true);
    expect(AGGREGATION_SUMMARY).toContain("not a maturity score");

    const full = elementByCode("GV.OC-01");
    const partial = elementByCode("GV.OC-02");
    const none = elementByCode("GV.OC-03");
    const mixed = elementByCode("PR.AA-01");
    if (!full || !partial || !none || !mixed) throw new Error("outcomes");
    const [first, second, third] = db.services.filter((service) => service.tenant_id === tenantId);
    if (!first || !second || !third) throw new Error("services");
    const archived: ServiceRecord = { ...second, archived_at: "2026-11-01T00:00:00.000Z" };
    const services = db.services.map((service) => (service.id === second.id ? archived : service));
    const mappings = [
      mapping("m2", tenantId, third.id, full.id, "partial"),
      mapping("m3", tenantId, first.id, full.id, "full"),
      mapping("m4", tenantId, archived.id, partial.id, "full"),
      mapping("m5", tenantId, first.id, none.id, "none"),
      mapping("m6", tenantId, first.id, mixed.id, "partial"),
      mapping("m7", tenantId, third.id, mixed.id, "none"),
      mapping("gone", tenantId, "deleted-service", mixed.id, "full"),
      mapping("other", "other-tenant", first.id, full.id, "full"),
    ];
    const report = aggregateCoverage({ elements: CSF_ELEMENTS, mappings, services, tenantId });
    const byCode = new Map(report.outcomes.map((outcome) => [outcome.element.code, outcome]));
    expect(byCode.get("GV.OC-01")?.status).toBe("full");
    expect(byCode.get("GV.OC-01")?.contributions.map((item) => item.coverage).sort()).toEqual(["full", "partial"]);
    expect(byCode.get("GV.OC-02")?.status).toBe("unmapped");
    expect(byCode.get("GV.OC-02")?.excludedArchived).toBe(1);
    expect(byCode.get("GV.OC-03")?.status).toBe("none");
    expect(byCode.get("PR.AA-01")?.status).toBe("partial");
    expect(report.counts.full).toBe(1);
    expect(report.counts.partial).toBe(1);
    expect(report.counts.none).toBe(1);
    expect(report.counts.unmapped).toBe(103);
    expect(report.counts.full + report.counts.partial + report.counts.none + report.counts.unmapped).toBe(106);

    const hinted = services.find((service) => Array.isArray(service.custom_fields.nist_csf_subcategories));
    expect(hinted?.custom_fields.nist_csf_subcategories ?? []).toEqual([]);
    const checkedOut = planBlueprintCheckout({
      tenantId,
      blueprintIds: ["soc-monitoring"],
      mode: "sequential",
      status: "draft",
      ownerTeam: "vciso_leadership",
      deliveryTeam: null,
      existingCodes: services.filter((service) => service.tenant_id === tenantId).map((service) => service.service_code),
      prefixForCategory: () => null,
      reviewedOn: "2026-11-06",
      now: "2026-11-06T12:00:00.000Z",
    });
    expect(checkedOut[0]?.custom_fields.nist_csf_subcategories).toEqual(expect.any(Array));
    expect(checkedOut[0]?.primary_csf_function).toBeTruthy();
    const afterCheckout = aggregateCoverage({
      elements: CSF_ELEMENTS,
      mappings: [],
      services: [...services, ...checkedOut],
      tenantId,
    });
    expect(afterCheckout.counts.unmapped).toBe(106);

    const visible = report.outcomes.filter((outcome) =>
      outcomeMatches(outcome, CSF_ELEMENTS, { query: "mission", functionCode: "GV", categoryCode: "GV.OC", status: "full" }, ""),
    );
    expect(visible.map((outcome) => outcome.element.code)).toEqual(["GV.OC-01"]);
    const gaps = report.outcomes.filter((outcome) =>
      outcomeMatches(outcome, CSF_ELEMENTS, { query: "", functionCode: null, categoryCode: "GV.OC", status: "attention" }, ""),
    );
    expect(gaps.map((outcome) => outcome.element.code)).toEqual(["GV.OC-02", "GV.OC-03", "GV.OC-04", "GV.OC-05"]);
  });

  it("does not let another workspace's assessments change this workspace", () => {
    const db = signInDemo(freshDemo(), "owner@example.com");
    const acme = db.tenants.find((tenant) => tenant.slug === "acme-corp");
    const meridian = db.tenants.find((tenant) => tenant.slug === "meridian-health");
    const outcome = elementByCode("ID.AM-01");
    const service = db.services.find((item) => item.tenant_id === acme?.id);
    if (!acme || !meridian || !outcome || !service) throw new Error("fixture");
    const report = aggregateCoverage({
      elements: CSF_ELEMENTS,
      mappings: [mapping("x", acme.id, service.id, outcome.id, "full")],
      services: db.services,
      tenantId: meridian.id,
    });
    expect(report.counts.full).toBe(0);
    expect(report.counts.unmapped).toBe(106);
  });
});

describe("demo cache and checkout", () => {
  it("keeps V1 through V1.2 edits and does not turn blueprint hints into coverage", () => {
    const migrated = migrateDemoState({
      session: { userId: "user", email: "editor@example.com" },
      activeTenantId: "t1",
      tenants: [
        {
          id: "t1",
          slug: "acme-corp",
          name: "Acme Corp — edited",
          service_code_mode: "category_prefix",
          logo_url: null,
          catalog_columns: { keys: ["service_code", "name"] },
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      ],
      members: [],
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
        {
          id: "field-csf",
          tenant_id: "t1",
          field_key: "primary_csf_function",
          label: "Primary CSF Function",
          help_text: "Primary NIST CSF 2.0 function. Detailed control mapping comes in a later version.",
          input_type: "dropdown",
          lookup_field_key: "primary_csf_function",
          is_required: false,
          visibility: "public",
          depth_level: 2,
          sort_order: 280,
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
          archived_at: "2026-10-01T00:00:00.000Z",
          custom_fields: { note: "keep me", nist_csf_subcategories: ["DE.CM-01"] },
        },
      ],
      mappings: [
        {
          id: "keep-map",
          tenant_id: "t1",
          service_id: "s1",
          element_id: elementByCode("GV.OC-01")?.id,
          coverage: "partial",
          rationale: "Kept",
          notes: null,
          created_by: null,
          updated_by: null,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      audit: [{ id: "a1" }],
    });
    expect(migrated?.tenants[0]?.name).toBe("Acme Corp — edited");
    expect(migrated?.tenants[0]?.logo_url).toBeNull();
    expect(migrated?.tenants[0]?.catalog_columns?.keys).toEqual(["service_code", "name"]);
    expect(migrated?.services[0]?.name).toBe("Edited monitoring entry");
    expect(migrated?.services[0]?.archived_at).toBe("2026-10-01T00:00:00.000Z");
    expect(migrated?.services[0]?.custom_fields).toEqual({ note: "keep me", nist_csf_subcategories: ["DE.CM-01"] });
    expect(migrated?.lookups[0]?.label).toBe("Harbor Team");
    expect(migrated?.lookups.filter((option) => option.field_key === "outcome_coverage").map((option) => option.code)).toEqual([
      "full",
      "partial",
      "none",
    ]);
    expect(migrated?.fields.find((field) => field.field_key === "name")?.help_text).toBe("Custom name help");
    expect(migrated?.fields.find((field) => field.field_key === "primary_csf_function")?.help_text).toContain("does not count as coverage");
    expect(migrated?.elements).toHaveLength(134);
    expect(migrated?.mappings).toHaveLength(1);
    expect(migrated?.audit).toHaveLength(1);
    const again = migrateDemoState(migrated);
    expect(again?.mappings).toHaveLength(1);
    expect(again?.elements.map((element) => element.id)).toEqual(migrated?.elements.map((element) => element.id));
    const coverage = aggregateCoverage({
      elements: migrated?.elements ?? [],
      mappings: migrated?.mappings ?? [],
      services: migrated?.services ?? [],
      tenantId: "t1",
    });
    expect(coverage.counts.partial).toBe(0);
    expect(coverage.counts.unmapped).toBe(106);
    expect(coverage.outcomes.find((outcome) => outcome.element.code === "GV.OC-01")?.excludedArchived).toBe(1);

    let db = signInDemo(freshDemo(), "demo.practitioner@example.com");
    const tenantId = db.activeTenantId;
    if (!tenantId) throw new Error("tenant");
    const before = db.mappings.length;
    const planned = planBlueprintCheckout({
      tenantId,
      blueprintIds: ["soc-monitoring"],
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
    expect(db.mappings).toHaveLength(before);
    expect(db.services.some((service) => Array.isArray(service.custom_fields.nist_csf_subcategories) && service.custom_fields.nist_csf_subcategories.length > 0)).toBe(true);
  });
});

describe("assessment dropdown", () => {
  it("keeps full, partial, and none as workspace lookup rows", () => {
    const rows = STARTER_LOOKUPS.filter((row) => row.field_key === "outcome_coverage");
    expect(rows.map((row) => row.code)).toEqual(["full", "partial", "none"]);
    expect(rows.every((row) => row.description)).toBe(true);
    const help = STARTER_FIELDS.find((field) => field.field_key === "primary_csf_function")?.help_text ?? "";
    expect(help).toContain("does not count as coverage");
  });
});

function editorDb(): CatalogDb {
  return withRole(signInDemo(freshDemo(), "editor@example.com"), "editor");
}

function withRole(db: CatalogDb, role: Role): CatalogDb {
  return {
    ...db,
    members: db.members.map((member) => (member.user_id === DEMO_USER_ID ? { ...member, role } : member)),
  };
}

describe("dashboard status panels", () => {
  it("lists exactly the outcomes counted in each summary box", () => {
    const db = signInDemo(freshDemo(), "owner@example.com");
    const tenantId = db.activeTenantId ?? "";
    const outcome = elementByCode("DE.CM-01");
    const service = db.services.find((item) => item.tenant_id === tenantId && !item.archived_at);
    if (!outcome || !service) throw new Error("fixture");
    const saved = saveOutcomeMapping(db, {
      serviceId: service.id,
      elementId: outcome.id,
      coverage: "partial",
      rationale: "Watching the agreed sources.",
    });
    const report = aggregateCoverage({
      elements: saved.elements,
      mappings: saved.mappings,
      services: saved.services,
      tenantId,
      frameworkId: CSF_FRAMEWORK.id,
    });
    for (const status of ["full", "partial", "none", "unmapped"] as const) {
      const rows = dashboardOutcomes(report.outcomes, saved.elements, { kind: "status", status });
      expect(rows).toHaveLength(report.counts[status]);
      expect(rows.every((row) => row.status === status)).toBe(true);
    }
    const partial = dashboardOutcomes(report.outcomes, saved.elements, { kind: "status", status: "partial" });
    expect(partial.map((row) => row.element.code)).toEqual(["DE.CM-01"]);
    expect(partial[0]?.contributions).toHaveLength(1);
    const unmapped = dashboardOutcomes(report.outcomes, saved.elements, { kind: "status", status: "unmapped" });
    expect(unmapped.every((row) => row.contributions.length === 0)).toBe(true);
    expect(report.counts.full + report.counts.partial + report.counts.none + report.counts.unmapped).toBe(report.denominator);
  });
});

describe("service attach list", () => {
  it("offers only unattached CSF subcategories, grouped by function and category", () => {
    const attached = elementByCode("DE.CM-01");
    if (!attached) throw new Error("DE.CM-01");
    const open = outcomeChoiceGroups({ elements: CSF_ELEMENTS, frameworkId: CSF_FRAMEWORK.id });
    const choices = open.flatMap((group) => group.outcomes);
    expect(choices).toHaveLength(106);
    expect(choices.some((choice) => choice.label.startsWith("DE.CM-01 · Networks and network services are monitored"))).toBe(true);
    const monitor = open.find((group) => group.label.includes("DE.CM"));
    expect(monitor?.label.toLowerCase()).toContain("detect");
    expect(monitor?.outcomes.some((outcome) => outcome.id === attached.id)).toBe(true);

    const remaining = outcomeChoiceGroups({
      elements: CSF_ELEMENTS,
      frameworkId: CSF_FRAMEWORK.id,
      excludeIds: new Set([attached.id]),
    });
    const left = remaining.flatMap((group) => group.outcomes);
    expect(left).toHaveLength(105);
    expect(left.some((choice) => choice.id === attached.id)).toBe(false);
    expect(remaining.every((group) => group.outcomes.length > 0)).toBe(true);
  });
});

function activeService(db: CatalogDb): ServiceRecord {
  const service = db.services.find((item) => item.tenant_id === db.activeTenantId && !item.archived_at);
  if (!service) throw new Error("expected a service");
  return service;
}

function mapping(
  id: string,
  tenantId: string,
  serviceId: string,
  elementId: string,
  coverage: "full" | "partial" | "none",
) {
  return { id, tenant_id: tenantId, service_id: serviceId, element_id: elementId, coverage };
}
