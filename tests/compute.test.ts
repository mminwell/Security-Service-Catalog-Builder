import { describe, expect, it } from "vitest";
import { addMonths, maturityGap, nextReviewDate } from "@/lib/catalog/compute";
import { buildService, withComputed } from "@/lib/catalog/service";

describe("maturity gap", () => {
  it("subtracts current from target", () => {
    expect(maturityGap(2, 5)).toBe(3);
    expect(maturityGap(5, 5)).toBe(0);
    expect(maturityGap(4, 2)).toBe(-2);
  });

  it("stays empty until both sides are set", () => {
    expect(maturityGap(null, 3)).toBeNull();
    expect(maturityGap(2, null)).toBeNull();
    expect(maturityGap(undefined, undefined)).toBeNull();
  });
});

describe("next review date", () => {
  it("adds the cadence interval and clamps month ends", () => {
    expect(nextReviewDate("2026-01-15", "monthly")).toBe("2026-02-15");
    expect(nextReviewDate("2026-01-15", "quarterly")).toBe("2026-04-15");
    expect(nextReviewDate("2026-01-15", "semi_annual")).toBe("2026-07-15");
    expect(nextReviewDate("2026-01-15", "annual")).toBe("2027-01-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("does not invent a date for On Change or missing inputs", () => {
    expect(nextReviewDate("2026-01-15", "on_change")).toBeNull();
    expect(nextReviewDate(null, "quarterly")).toBeNull();
    expect(nextReviewDate("2026-01-15", null)).toBeNull();
    expect(nextReviewDate("2026-01-15", "whenever")).toBeNull();
  });

  it("recomputes when the service inputs change", () => {
    const service = buildService("tenant", {
      service_code: "SVC-001",
      name: "Watch",
      category: "secops",
      status: "active",
      service_tier: "tier_0",
      summary: "Monitor.",
      owner_team: "soc",
      current_maturity_cmmi: 1,
      target_maturity_cmmi: 4,
      review_cadence: "quarterly",
      last_reviewed_date: "2026-01-20",
    });
    expect(service.maturity_gap).toBe(3);
    expect(service.next_review_date).toBe("2026-04-20");
    const updated = withComputed({
      ...service,
      target_maturity_cmmi: 2,
      review_cadence: "on_change",
    });
    expect(updated.maturity_gap).toBe(1);
    expect(updated.next_review_date).toBeNull();
  });
});
