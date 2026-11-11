import { describe, expect, it } from "vitest";
import { distributionMarking } from "@/lib/catalog/csv";
import { normalizeWorkspaceName } from "@/lib/catalog/workspace-name";
import { freshDemo, renameWorkspace, signInDemo, type CatalogDb } from "@/lib/data/model";
import type { Role } from "@/lib/catalog/types";

function asRole(db: CatalogDb, role: Role): CatalogDb {
  const tenantId = db.activeTenantId;
  return {
    ...db,
    members: db.members.map((member) => (member.tenant_id === tenantId ? { ...member, role } : member)),
  };
}

describe("workspace rename", () => {
  it("trims the name and rejects an empty or overlong one", () => {
    expect(normalizeWorkspaceName("  Northwind Security  ")).toBe("Northwind Security");
    expect(() => normalizeWorkspaceName("   ")).toThrow(/workspace name/i);
    expect(() => normalizeWorkspaceName("")).toThrow(/workspace name/i);
    expect(() => normalizeWorkspaceName("n".repeat(81))).toThrow(/80 characters/i);
  });

  it("updates the active workspace name, keeps the slug, audits the change, and feeds export markings", () => {
    let db = signInDemo(freshDemo(), "owner@example.com");
    const before = db.tenants.find((tenant) => tenant.id === db.activeTenantId);
    if (!before) throw new Error("workspace");
    db = renameWorkspace(db, "  Northwind Security  ");
    const after = db.tenants.find((tenant) => tenant.id === before.id);
    if (!after) throw new Error("renamed workspace");
    expect(after.name).toBe("Northwind Security");
    expect(after.slug).toBe(before.slug);
    expect(db.tenants.filter((tenant) => tenant.id !== before.id).every((tenant) => tenant.name !== "Northwind Security")).toBe(true);
    expect(db.audit[0]).toMatchObject({
      table_name: "tenants",
      action: "update",
      before_data: { name: before.name, slug: before.slug },
      after_data: { name: "Northwind Security", slug: before.slug },
    });
    expect(distributionMarking(after.name, "public")).toBe("NORTHWIND SECURITY \u2014 APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(distributionMarking(after.name, "all")).toBe("NORTHWIND SECURITY \u2014 DO NOT DISTRIBUTE EXTERNALLY");
  });

  it("hides the change from viewers and editors", () => {
    const signed = signInDemo(freshDemo(), "member@example.com");
    expect(() => renameWorkspace(asRole(signed, "viewer"), "Other Name")).toThrow(/admin/i);
    expect(() => renameWorkspace(asRole(signed, "editor"), "Other Name")).toThrow(/admin/i);
    const unchanged = asRole(signed, "viewer").tenants.find((tenant) => tenant.id === signed.activeTenantId);
    expect(unchanged?.name).not.toBe("Other Name");
  });
});
