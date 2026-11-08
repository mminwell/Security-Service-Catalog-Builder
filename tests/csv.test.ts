import { describe, expect, it } from "vitest";
import { distributionMarking, exportColumns, servicesToCsv } from "@/lib/catalog/csv";
import { materializeFields } from "@/lib/catalog/fields";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { filterServices } from "@/lib/catalog/filter";
import { buildService } from "@/lib/catalog/service";
import type { LookupOption } from "@/lib/catalog/types";

const fields = materializeFields("tenant", (key) => `field:${key}`);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: seed.code,
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
const services = [
  buildService("tenant", {
    service_code: "SVC-001",
    name: "Enterprise Security Monitoring",
    category: "secops",
    status: "active",
    service_tier: "tier_0",
    summary: "Detect threats.",
    owner_team: "soc",
    capability_rating: "full",
    internal_name: "SOC watch",
    internal_notes: secret,
    current_maturity_cmmi: 3,
    target_maturity_cmmi: 4,
    cost_model: "no_charge_core",
  }),
  buildService("tenant", {
    service_code: "SVC-002",
    name: "Planned architecture review",
    category: "sec_architecture",
    status: "planned",
    service_tier: "tier_2",
    summary: "Not offered yet.",
    owner_team: "sec_engineering",
    capability_rating: "none",
    internal_notes: "Do not publish this note.",
  }),
];

describe("CSV export visibility", () => {
  it("keeps internal fields out of the public file and in the full file", () => {
    const filtered = filterServices(
      services,
      {
        query: "",
        scope: "active",
        rules: [{ id: "status", fieldKey: "status", op: "eq", value: "active" }],
      },
      fields,
    );
    const publicCsv = servicesToCsv(filtered, fields, lookups, "public").replace(/^\uFEFF/, "");
    const fullCsv = servicesToCsv(filtered, fields, lookups, "all").replace(/^\uFEFF/, "");

    expect(publicCsv).toContain("Enterprise Security Monitoring");
    expect(publicCsv).toContain("Service Description");
    expect(publicCsv).not.toContain("Service Code");
    expect(publicCsv).not.toContain("SVC-001");
    expect(publicCsv).not.toContain("Security Operations & Monitoring");
    expect(publicCsv).not.toContain("SVC-002");
    expect(publicCsv).not.toContain(secret);
    expect(publicCsv).not.toContain("Internal Notes");
    expect(publicCsv).not.toContain("Current Maturity");
    expect(publicCsv).not.toContain("Cost Model");
    expect(publicCsv).not.toContain("SOC watch");

    expect(fullCsv).toContain(secret);
    expect(fullCsv).toContain("Internal Notes");
    expect(fullCsv).toContain("SOC watch");
    expect(fullCsv).toContain("No Charge / Core Funded");
    expect(fullCsv.split("\r\n")[0]?.split(",").length).toBeGreaterThan(
      publicCsv.split("\r\n")[0]?.split(",").length ?? 0,
    );
  });

  it("escapes commas and quotes", () => {
    const csv = servicesToCsv(
      [
        buildService("tenant", {
          service_code: "SVC-009",
          name: 'Detection, "priority"',
          category: "secops",
          status: "active",
          service_tier: "tier_1",
          summary: "Line one\nLine two",
          owner_team: "soc",
        }),
      ],
      fields,
      lookups,
      "public",
    );
    expect(csv).toContain('"Detection, ""priority"""');
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("writes the corporate distribution marking on row 1 when requested", () => {
    const publicMark = distributionMarking("Meridian Health", "public");
    const fullMark = distributionMarking(" meridian health ", "all");
    expect(publicMark).toBe("MERIDIAN HEALTH \u2014 APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(fullMark).toBe("MERIDIAN HEALTH \u2014 DO NOT DISTRIBUTE EXTERNALLY");

    const withMark = servicesToCsv(services, fields, lookups, "public", { marking: publicMark }).replace(/^\uFEFF/, "");
    const lines = withMark.split("\r\n");
    expect(lines[0]).toBe(publicMark);
    expect(lines[1]).toContain("Service Name");
    expect(lines[1]).not.toContain("Service Code");
    expect(withMark).not.toContain("DO NOT DISTRIBUTE EXTERNALLY");
    expect(withMark).not.toContain(secret);

    const without = servicesToCsv(services, fields, lookups, "public").replace(/^\uFEFF/, "");
    expect(without.split("\r\n")[0]).toContain("Service Name");
    expect(without).not.toContain("APPROVED FOR CLIENT");

    const full = servicesToCsv(services, fields, lookups, "all", { marking: fullMark }).replace(/^\uFEFF/, "");
    expect(full.split("\r\n")[0]).toBe(fullMark);
    expect(full).toContain(secret);
  });

  it("quotes a marking that contains a comma", () => {
    const marking = distributionMarking("Acme, Corp", "public");
    const csv = servicesToCsv(services.slice(0, 1), fields, lookups, "public", { marking }).replace(/^\uFEFF/, "");
    expect(csv.split("\r\n")[0]).toBe('"ACME, CORP \u2014 APPROVED FOR CLIENT/LIMITED DISTRIBUTION"');
  });

  it("public columns are only public fields", () => {
    expect(exportColumns(fields, "public").every((field) => field.visibility === "public")).toBe(true);
    expect(exportColumns(fields, "all").some((field) => field.visibility === "internal")).toBe(true);
  });
});
