import { describe, expect, it } from "vitest";
import { activeOptions, optionLabel, withLookupActive } from "@/lib/catalog/lookups";
import type { LookupOption } from "@/lib/catalog/types";

const options: LookupOption[] = [
  {
    id: "tier-0",
    tenant_id: "tenant",
    field_key: "service_tier",
    code: "tier_0",
    label: "Tier 0 — Mission-Critical / Crown Jewel",
    description: "Highest resilience.",
    code_prefix: null,
    sort_order: 20,
    is_active: true,
  },
  {
    id: "tier-1",
    tenant_id: "tenant",
    field_key: "service_tier",
    code: "tier_1",
    label: "Tier 1 — Core Operational",
    description: "Everyday controls.",
    code_prefix: null,
    sort_order: 10,
    is_active: true,
  },
  {
    id: "status",
    tenant_id: "tenant",
    field_key: "status",
    code: "active",
    label: "Active",
    description: null,
    code_prefix: null,
    sort_order: 10,
    is_active: true,
  },
];

describe("lookup retirement", () => {
  it("hides a retired option from the dropdown and still resolves its label", () => {
    const retired = withLookupActive(options, "tier-0", false);
    const visible = activeOptions(retired, "service_tier").map((option) => option.code);
    expect(visible).toEqual(["tier_1"]);
    expect(optionLabel(retired, "service_tier", "tier_0")).toBe("Tier 0 — Mission-Critical / Crown Jewel");
    const restored = withLookupActive(retired, "tier-0", true);
    expect(activeOptions(restored, "service_tier").map((option) => option.code)).toEqual(["tier_1", "tier_0"]);
  });

  it("does not remove the row", () => {
    expect(withLookupActive(options, "tier-1", false)).toHaveLength(options.length);
  });
});
