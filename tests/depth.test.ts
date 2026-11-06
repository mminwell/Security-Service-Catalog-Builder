import { describe, expect, it } from "vitest";
import { fieldsAtDepth, projectForDepth, requiredKeys } from "@/lib/catalog/depth";
import { materializeFields, REQUIRED_FIELD_KEYS } from "@/lib/catalog/fields";
import { buildService } from "@/lib/catalog/service";

const fields = materializeFields("tenant", (key) => key);

describe("form depth", () => {
  it("hides deeper fields without clearing saved values", () => {
    const service = buildService("tenant", {
      service_code: "SVC-014",
      name: "Architecture review",
      category: "sec_architecture",
      status: "planned",
      service_tier: "tier_2",
      summary: "A design review.",
      owner_team: "sec_engineering",
      internal_notes: "keep me",
      current_maturity_cmmi: 2,
      target_maturity_cmmi: 5,
      cost_model: "no_charge_core",
      delivery_team: "it_infrastructure",
    });
    const core = projectForDepth(service, fields, 1);
    expect(core.record).toBe(service);
    expect(core.visibleKeys).toContain("service_code");
    expect(core.visibleKeys).toContain("owner_team");
    expect(core.visibleKeys).not.toContain("delivery_team");
    expect(core.visibleKeys).not.toContain("internal_notes");
    expect(core.visibleKeys).not.toContain("current_maturity_cmmi");
    expect(core.record.internal_notes).toBe("keep me");
    expect(core.record.current_maturity_cmmi).toBe(2);
    expect(core.record.maturity_gap).toBe(3);
    expect(core.record.cost_model).toBe("no_charge_core");

    const operations = fieldsAtDepth(fields, 2).map((field) => field.field_key);
    expect(operations).toContain("delivery_team");
    expect(operations).toContain("internal_notes");
    expect(operations).not.toContain("cost_model");
    expect(fieldsAtDepth(fields, 3).map((field) => field.field_key)).toContain("maturity_gap");
  });

  it("does not make level 2 or 3 fields required", () => {
    expect(requiredKeys(fields)).toEqual(REQUIRED_FIELD_KEYS);
    expect(requiredKeys(fields)).toEqual([
      "service_code",
      "name",
      "category",
      "status",
      "summary",
      "owner_team",
    ]);
    const deeperRequired = fields.filter((field) => field.depth_level > 1 && field.is_required);
    expect(deeperRequired).toEqual([]);
  });
});
