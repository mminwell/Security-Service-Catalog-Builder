import { describe, expect, it } from "vitest";
import { validateEmail, validatePassword, normalizeEmail } from "@/lib/auth/credentials";
import { friendlyAuthError } from "@/lib/auth/messages";
import {
  allows,
  canAdminTenant,
  canReadTenant,
  canWriteTenant,
  visibleTenantIds,
  type Membership,
} from "@/lib/auth/permissions";
import { isPublicPath, safeNextPath } from "@/lib/auth/redirect";
import { normalizeLogoInput } from "@/lib/catalog/logos";
import { safeHttpUrl } from "@/lib/catalog/artifacts";

const workspaceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function member(userId: string, tenantId: string, role: Membership["role"]): Membership {
  return { userId, tenantId, role };
}

describe("auth credentials and redirects", () => {
  it("accepts a normal email and rejects a blank or oversized one", () => {
    expect(validateEmail("  Ada@Example.com ")).toBeNull();
    expect(normalizeEmail("  Ada@Example.com ")).toBe("ada@example.com");
    expect(validateEmail("not-an-email")).toMatch(/valid email/i);
    expect(validatePassword("short")).toMatch(/8 characters/);
    expect(validatePassword("long-enough")).toBeNull();
  });

  it("keeps post-login redirects on this site", () => {
    expect(safeNextPath("/catalog")).toBe("/catalog");
    expect(safeNextPath("/artifacts/123")).toBe("/artifacts/123");
    expect(safeNextPath("https://evil.example")).toBe("/catalog");
    expect(safeNextPath("//evil.example")).toBe("/catalog");
    expect(safeNextPath("/\\evil")).toBe("/catalog");
    expect(safeNextPath(null, "/login")).toBe("/login");
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/auth/reset")).toBe(true);
    expect(isPublicPath("/catalog")).toBe(false);
  });

  it("turns rate-limit and duplicate-account errors into plain language", () => {
    expect(friendlyAuthError("Request rate limit reached")).toMatch(/too many attempts/i);
    expect(friendlyAuthError("User already registered")).toMatch(/already have an account/i);
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/do not match/i);
  });
});

describe("role gates", () => {
  it("lets viewers read, editors write, and admins administer", () => {
    expect(allows("viewer", "read")).toBe(true);
    expect(allows("viewer", "write")).toBe(false);
    expect(allows("editor", "write")).toBe(true);
    expect(allows("editor", "admin")).toBe(false);
    expect(allows("tenant_admin", "admin")).toBe(true);
    expect(allows("platform_owner", "admin")).toBe(true);
    expect(allows(null, "read")).toBe(false);
  });
});

describe("tenant isolation", () => {
  const rows = [
    member("ada", workspaceA, "tenant_admin"),
    member("bea", workspaceB, "editor"),
    member("vic", workspaceA, "viewer"),
  ];

  it("stops a member of workspace A from reading or writing workspace B", () => {
    expect(canReadTenant(rows, "ada", workspaceB)).toBe(false);
    expect(canWriteTenant(rows, "ada", workspaceB)).toBe(false);
    expect(canAdminTenant(rows, "ada", workspaceB)).toBe(false);
    expect(canReadTenant(rows, "bea", workspaceA)).toBe(false);
    expect(canWriteTenant(rows, "bea", workspaceA)).toBe(false);
    expect(visibleTenantIds(rows, "ada", [workspaceA, workspaceB])).toEqual([workspaceA]);
    expect(visibleTenantIds(rows, "bea", [workspaceA, workspaceB])).toEqual([workspaceB]);
  });

  it("lets an editor change their own workspace and blocks a viewer from writing", () => {
    expect(canWriteTenant(rows, "bea", workspaceB)).toBe(true);
    expect(canAdminTenant(rows, "bea", workspaceB)).toBe(false);
    expect(canReadTenant(rows, "vic", workspaceA)).toBe(true);
    expect(canWriteTenant(rows, "vic", workspaceA)).toBe(false);
  });

  it("treats platform owner as the operator exception, not as a normal invite role", () => {
    const withOwner = [...rows, member("ops", workspaceA, "platform_owner")];
    expect(canReadTenant(withOwner, "ops", workspaceB)).toBe(true);
    expect(canWriteTenant(withOwner, "ops", workspaceB)).toBe(true);
    expect(visibleTenantIds(withOwner, "ops", [workspaceA, workspaceB])).toEqual([workspaceA, workspaceB]);
    expect(canReadTenant(withOwner, "ada", workspaceB)).toBe(false);
  });
});

describe("url and logo sanitizing", () => {
  it("drops javascript and credentialed links", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://user:pass@example.com/a")).toBeNull();
    expect(safeHttpUrl("https://example.com/runbook")).toMatch(/^https:\/\/example.com\/runbook/);
  });

  it("rejects an svg logo that carries a script or an event handler", () => {
    const script = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}`;
    const handler = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')}`;
    expect(() => normalizeLogoInput(script)).toThrow(/can't be used/i);
    expect(() => normalizeLogoInput(handler)).toThrow(/can't be used/i);
  });
});
