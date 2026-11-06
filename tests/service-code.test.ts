import { describe, expect, it } from "vitest";
import { slugify, suggestServiceCode, uniqueSlug } from "@/lib/catalog/service-code";

describe("service ID suggestions", () => {
  it("starts at SVC-001 and continues after the highest code", () => {
    expect(suggestServiceCode({ existingCodes: [], mode: "sequential", categoryPrefix: null })).toBe("SVC-001");
    expect(
      suggestServiceCode({
        existingCodes: ["SVC-001", "SVC-003", "note"],
        mode: "sequential",
        categoryPrefix: null,
      }),
    ).toBe("SVC-004");
    expect(
      suggestServiceCode({
        existingCodes: ["SVC-009"],
        mode: "sequential",
        categoryPrefix: "SOC",
      }),
    ).toBe("SVC-010");
  });

  it("uses the category prefix when the workspace asks for it", () => {
    expect(
      suggestServiceCode({
        existingCodes: ["SVC-004"],
        mode: "category_prefix",
        categoryPrefix: "SOC",
      }),
    ).toBe("SEC-SOC-001");
    expect(
      suggestServiceCode({
        existingCodes: ["SEC-SOC-001", "SEC-SOC-002", "SEC-IAM-009"],
        mode: "category_prefix",
        categoryPrefix: "soc",
      }),
    ).toBe("SEC-SOC-003");
  });

  it("falls back to sequential IDs when the category has no prefix", () => {
    expect(
      suggestServiceCode({
        existingCodes: [],
        mode: "category_prefix",
        categoryPrefix: "  ",
      }),
    ).toBe("SVC-001");
  });
});

describe("workspace slugs", () => {
  it("makes a unique URL-safe slug", () => {
    expect(slugify("Meridian Health")).toBe("meridian-health");
    expect(uniqueSlug("Acme Corp", ["acme-corp"])).toBe("acme-corp-2");
  });
});
