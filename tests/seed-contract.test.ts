import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STARTER_FIELDS } from "@/lib/catalog/fields";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { SAMPLE_TENANTS } from "@/lib/catalog/samples";

const sql = [
  readFileSync("supabase/migrations/0001_v1_catalog_core.sql", "utf8"),
  readFileSync("supabase/migrations/0002_v1_1_polish.sql", "utf8"),
  readFileSync("supabase/seed.sql", "utf8"),
].join("\n");

describe("starter catalog contract", () => {
  it("locks the six required core fields and unique keys", () => {
    const keys = STARTER_FIELDS.map((field) => field.field_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(STARTER_FIELDS.filter((field) => field.is_required).map((field) => field.field_key)).toEqual([
      "service_code",
      "name",
      "category",
      "status",
      "summary",
      "owner_team",
    ]);
    for (const field of STARTER_FIELDS) {
      expect([1, 2, 3]).toContain(field.depth_level);
      expect(["public", "internal"]).toContain(field.visibility);
    }
  });

  it("includes the locked lookup descriptions", () => {
    const tiers = STARTER_LOOKUPS.filter((row) => row.field_key === "service_tier");
    expect(tiers.map((row) => row.code)).toEqual(["tier_0", "tier_1", "tier_2", "tier_3"]);
    expect(tiers[0]?.description).toContain("Failure immediately exposes the organization");
    expect(STARTER_LOOKUPS.filter((row) => row.field_key === "maturity_cmmi").map((row) => row.code)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(STARTER_LOOKUPS.filter((row) => row.field_key === "capability_rating").map((row) => row.label)).toEqual([
      "Full",
      "Partial",
      "None",
    ]);
    const categories = STARTER_LOOKUPS.filter((row) => row.field_key === "category");
    expect(categories).toHaveLength(14);
    expect(categories.map((row) => row.code_prefix)).toEqual([
      "GRC",
      "SOC",
      "IRF",
      "VUL",
      "IAM",
      "NET",
      "END",
      "CLD",
      "APP",
      "PRV",
      "AIS",
      "ARC",
      "TPR",
      "SAT",
    ]);
    expect(STARTER_LOOKUPS.filter((row) => row.field_key === "status")).toHaveLength(6);
  });

  it("mirrors starter lookups into SQL and ships two fictional workspaces", () => {
    for (const row of STARTER_LOOKUPS) {
      expect(sql).toContain(row.code);
      if (row.description) expect(sql).toContain(row.description.slice(0, 48));
    }
    expect(SAMPLE_TENANTS.map((tenant) => tenant.name)).toEqual(["Acme Corp", "Meridian Health"]);
    expect(sql).toContain("Acme Corp");
    expect(sql).toContain("Meridian Health");
    expect(sql).toContain("logo_url");
    expect(sql).toContain("archived_at");
    expect(sql).toContain("data:image/svg+xml");
    expect(sql).not.toMatch(/mminwell|supabase\.co|service_role/i);
  });
});
