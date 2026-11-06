import { describe, expect, it } from "vitest";
import { servicesToCsv } from "@/lib/catalog/csv";
import { activeFilterCount, filterServices } from "@/lib/catalog/filter";
import { materializeFields } from "@/lib/catalog/fields";
import { DEMO_LOGOS, normalizeLogoInput } from "@/lib/catalog/logos";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { buildService, completenessPercent, isFilled, readField, withComputed } from "@/lib/catalog/service";
import { DEMO_USER_ID, EMPTY_FILTERS, type LookupOption, type Role } from "@/lib/catalog/types";
import {
  deleteService,
  freshDemo,
  saveField,
  setServiceArchived,
  signInDemo,
  type CatalogDb,
} from "@/lib/data/model";
import { migrateDemoState } from "@/lib/data/storage";

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

const monitored = buildService("tenant", {
  service_code: "SVC-001",
  name: "Enterprise Security Monitoring",
  category: "secops",
  status: "active",
  service_tier: "tier_0",
  summary: "Detect threats across the estate.",
  owner_team: "soc",
  capability_rating: "full",
  approval_required: true,
  target_audience: ["executives", "security_team"],
  current_maturity_cmmi: 3,
  target_maturity_cmmi: 4,
  last_reviewed_date: "2026-08-12",
  review_cadence: "quarterly",
  internal_notes: "Holiday paging coverage is thin.",
});

const planned = buildService("tenant", {
  service_code: "SVC-002",
  name: "Planned architecture review",
  category: "sec_architecture",
  status: "planned",
  service_tier: "tier_2",
  summary: "Not offered yet.",
  owner_team: "sec_engineering",
  capability_rating: "none",
  approval_required: false,
  current_maturity_cmmi: 1,
  target_maturity_cmmi: 1,
});

describe("dynamic catalog filters", () => {
  it("stacks rules across fields and can show archived services", () => {
    const archived = { ...monitored, archived_at: "2026-11-06T12:00:00.000Z" };
    const active = { ...planned, archived_at: null };
    const legacy = { ...monitored, id: "legacy", service_code: "SVC-009", archived_at: undefined as unknown as null };

    expect(filterServices([archived, active, legacy], EMPTY_FILTERS, fields).map((service) => service.service_code)).toEqual([
      "SVC-002",
      "SVC-009",
    ]);
    expect(
      filterServices([archived, active], { ...EMPTY_FILTERS, scope: "archived" }, fields).map((service) => service.service_code),
    ).toEqual(["SVC-001"]);

    const stacked = filterServices(
      [monitored, planned],
      {
        query: "detect",
        scope: "active",
        rules: [
          { id: "category", fieldKey: "category", op: "eq", value: "secops" },
          { id: "capability", fieldKey: "capability_rating", op: "eq", value: "full" },
          { id: "audience", fieldKey: "target_audience", op: "includes", value: "executives" },
          { id: "approval", fieldKey: "approval_required", op: "eq", value: "true" },
          { id: "cmmi", fieldKey: "current_maturity_cmmi", op: "eq", value: "3" },
          { id: "gap", fieldKey: "maturity_gap", op: "gte", value: "1" },
          { id: "reviewed", fieldKey: "last_reviewed_date", op: "before", value: "2026-09-01" },
          { id: "summary", fieldKey: "summary", op: "contains", value: "estate" },
        ],
      },
      fields,
    );
    expect(stacked.map((service) => service.service_code)).toEqual(["SVC-001"]);
    expect(activeFilterCount({ query: "", scope: "archived", rules: stacked.length ? [{ id: "x", fieldKey: "status", op: "eq", value: "active" }] : [] })).toBe(2);

    const contradicted = filterServices(
      [monitored, planned],
      {
        query: "",
        scope: "active",
        rules: [
          { id: "a", fieldKey: "status", op: "eq", value: "active" },
          { id: "b", fieldKey: "status", op: "eq", value: "planned" },
        ],
      },
      fields,
    );
    expect(contradicted).toEqual([]);
  });

  it("ignores rules for retired fields and still reads stored values", () => {
    const retired = fields.map((field) => (field.field_key === "category" ? { ...field, is_active: false } : field));
    const matched = filterServices(
      [monitored, planned],
      {
        query: "",
        scope: "active",
        rules: [{ id: "category", fieldKey: "category", op: "eq", value: "does-not-exist" }],
      },
      retired,
    );
    expect(matched).toHaveLength(2);
    expect(monitored.category).toBe("secops");
  });
});

describe("archive, restore, and permanent delete", () => {
  function withRole(db: CatalogDb, role: Role): CatalogDb {
    return {
      ...db,
      members: db.members.map((member) => (member.user_id === DEMO_USER_ID ? { ...member, role } : member)),
    };
  }

  it("soft-archives for editors, restores, and permanently deletes for admins only", () => {
    let db = signInDemo(freshDemo(), "alex.rivera@example.com");
    const tenantId = db.activeTenantId;
    const service = db.services.find((item) => item.tenant_id === tenantId);
    if (!service || !tenantId) throw new Error("expected a demo service");
    const now = "2026-11-06T12:00:00.000Z";

    db = withRole(db, "editor");
    db = setServiceArchived(db, service.id, true, now);
    expect(db.services.find((item) => item.id === service.id)?.archived_at).toBe(now);
    expect(db.audit[0]?.action).toBe("update");
    expect(db.audit[0]?.after_data?.archived_at).toBe(now);
    expect(db.services.find((item) => item.id === service.id)?.name).toBe(service.name);

    db = setServiceArchived(db, service.id, false, "2026-11-06T13:00:00.000Z");
    expect(db.services.find((item) => item.id === service.id)?.archived_at).toBeNull();
    expect(() => deleteService(db, service.id)).toThrow(/workspace admin/i);

    db = withRole(db, "viewer");
    expect(() => setServiceArchived(db, service.id, true)).toThrow(/permission/i);
    expect(() => deleteService(db, service.id)).toThrow(/workspace admin/i);
    expect(db.services.some((item) => item.id === service.id)).toBe(true);

    db = withRole(db, "tenant_admin");
    db = deleteService(db, service.id, now);
    expect(db.services.some((item) => item.id === service.id)).toBe(false);
    expect(db.audit[0]?.action).toBe("delete");
    expect(db.audit[0]?.before_data?.service_code).toBe(service.service_code);
    expect(db.audit[0]?.after_data).toBeNull();
  });
});

describe("field retirement", () => {
  it("hides retired fields from completeness and CSV exports and keeps stored values", () => {
    let db = signInDemo(freshDemo(), "alex.rivera@example.com");
    const tenantId = db.activeTenantId;
    if (!tenantId) throw new Error("expected a workspace");
    const tenantFields = () => db.fields.filter((field) => field.tenant_id === tenantId);
    const service = db.services.find((item) => item.tenant_id === tenantId && item.summary);
    const summary = tenantFields().find((field) => field.field_key === "summary");
    const name = tenantFields().find((field) => field.field_key === "name");
    const code = tenantFields().find((field) => field.field_key === "service_code");
    if (!service || !summary || !name || !code) throw new Error("expected starter fields");

    expect(() => saveField(db, { ...name, is_active: false })).toThrow(/stay active/i);
    expect(() => saveField(db, { ...code, is_active: false })).toThrow(/stay active/i);

    db = saveField(db, { ...summary, is_active: false }, "2026-11-06T12:00:00.000Z");
    const retiredFields = tenantFields();
    const stored = db.services.find((item) => item.id === service.id);
    expect(stored?.summary).toBe(service.summary);
    expect(retiredFields.find((field) => field.field_key === "summary")?.is_active).toBe(false);

    const active = retiredFields.filter((field) => field.is_active);
    const shown = withComputed(stored ?? service);
    const filled = active.filter((field) => isFilled(readField(shown, field.field_key), field.input_type)).length;
    expect(completenessPercent(shown, retiredFields)).toBe(Math.round((filled / active.length) * 100));
    expect(active.some((field) => field.field_key === "summary")).toBe(false);

    const hidden = servicesToCsv([shown], retiredFields, lookups, "all");
    expect(hidden).not.toContain("Executive Summary");
    expect(hidden).not.toContain(service.summary ?? "");

    db = saveField(db, { ...summary, is_active: true }, "2026-11-06T12:05:00.000Z");
    const restored = servicesToCsv([shown], tenantFields(), lookups, "public");
    expect(restored).toContain("Executive Summary");
    expect(restored).toContain(service.summary ?? "");
    expect(db.services.find((item) => item.id === service.id)?.summary).toBe(service.summary);
  });
});

describe("demo state migration", () => {
  it("hydrates V1 localStorage records that omit logo_url and archived_at", () => {
    const seeded = freshDemo();
    expect(seeded.tenants.find((tenant) => tenant.slug === "acme-corp")?.logo_url).toBe(DEMO_LOGOS["acme-corp"]);
    expect(seeded.tenants.find((tenant) => tenant.slug === "meridian-health")?.logo_url).toBe(DEMO_LOGOS["meridian-health"]);
    expect(seeded.services.every((service) => service.archived_at === null)).toBe(true);

    const legacy = JSON.parse(JSON.stringify(seeded)) as {
      tenants: Array<Record<string, unknown>>;
      services: Array<Record<string, unknown>>;
      lookups: unknown[];
      fields: unknown[];
      members: unknown[];
      audit: unknown[];
      session: null;
      activeTenantId: string;
    };
    for (const tenant of legacy.tenants) delete tenant.logo_url;
    for (const service of legacy.services) delete service.archived_at;

    const migrated = migrateDemoState(legacy);
    expect(migrated?.tenants.find((tenant) => tenant.slug === "acme-corp")?.logo_url).toContain("data:image/svg+xml");
    expect(migrated?.tenants.find((tenant) => tenant.slug === "meridian-health")?.logo_url).toContain("data:image/svg+xml");
    expect(migrated?.services.every((service) => service.archived_at === null)).toBe(true);
    expect(migrated?.services.length).toBe(seeded.services.length);

    const cleared = migrateDemoState({
      ...legacy,
      tenants: legacy.tenants.map((tenant) => ({ ...tenant, logo_url: null })),
      services: legacy.services.map((service, index) =>
        index === 0 ? { ...service, archived_at: "2026-11-02T00:00:00.000Z" } : service,
      ),
    });
    expect(cleared?.tenants.every((tenant) => tenant.logo_url === null)).toBe(true);
    expect(cleared?.services[0]?.archived_at).toBe("2026-11-02T00:00:00.000Z");

    const custom = migrateDemoState({
      tenants: [
        {
          id: "t",
          slug: "northwind",
          name: "Northwind",
          service_code_mode: "sequential",
          is_active: true,
          created_at: "",
          updated_at: "",
        },
      ],
      services: [{ id: "s", tenant_id: "t", service_code: "SVC-1", name: "Watch" }],
      lookups: [],
    });
    expect(custom?.tenants[0]?.logo_url).toBeNull();
    expect(custom?.services[0]?.archived_at).toBeNull();
    expect(custom?.services[0]?.name).toBe("Watch");

    expect(migrateDemoState(null)).toBeNull();
    expect(migrateDemoState({ tenants: "nope" })).toBeNull();
    expect(migrateDemoState({ tenants: [null], services: [null], lookups: [] })?.services[0]?.archived_at).toBeNull();
  });

  it("accepts demo marks and image URLs and rejects unsafe logo input", () => {
    expect(normalizeLogoInput(null)).toBeNull();
    expect(normalizeLogoInput("  ")).toBeNull();
    expect(normalizeLogoInput(DEMO_LOGOS["acme-corp"])).toBe(DEMO_LOGOS["acme-corp"]);
    expect(normalizeLogoInput("https://example.com/logo.png")).toBe("https://example.com/logo.png");
    expect(() => normalizeLogoInput("javascript:alert(1)")).toThrow(/http/);
    expect(() => normalizeLogoInput(`data:image/svg+xml,${encodeURIComponent("<svg><script>alert(1)</script></svg>")}`)).toThrow(
      /can't be used/i,
    );
    expect(() => normalizeLogoInput(`data:image/png;base64,${"a".repeat(140_000)}`)).toThrow(/too large/i);
  });
});
