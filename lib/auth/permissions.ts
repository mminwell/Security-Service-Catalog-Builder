import type { Role } from "@/lib/catalog/types";

/**
 * Mirrors the SQL helpers in 0001: a platform owner can reach every workspace.
 * Everyone else is limited to rows where they have a membership.
 * Server actions and the client role label both use this so they stay aligned with RLS.
 */
export type Membership = {
  userId: string;
  tenantId: string;
  role: Role;
};

export type AccessLevel = "read" | "write" | "admin";

export function membershipRole(rows: Membership[], userId: string, tenantId: string): Role | null {
  const mine = rows.filter((row) => row.userId === userId);
  if (mine.some((row) => row.role === "platform_owner")) return "platform_owner";
  return mine.find((row) => row.tenantId === tenantId)?.role ?? null;
}

export function allows(role: Role | null, level: AccessLevel): boolean {
  if (!role) return false;
  if (role === "platform_owner") return true;
  if (level === "read") return role === "tenant_admin" || role === "editor" || role === "viewer";
  if (level === "write") return role === "tenant_admin" || role === "editor";
  return role === "tenant_admin";
}

export function canReadTenant(rows: Membership[], userId: string, tenantId: string): boolean {
  return allows(membershipRole(rows, userId, tenantId), "read");
}

export function canWriteTenant(rows: Membership[], userId: string, tenantId: string): boolean {
  return allows(membershipRole(rows, userId, tenantId), "write");
}

export function canAdminTenant(rows: Membership[], userId: string, tenantId: string): boolean {
  return allows(membershipRole(rows, userId, tenantId), "admin");
}

export function visibleTenantIds(rows: Membership[], userId: string, allTenantIds: string[]): string[] {
  const mine = rows.filter((row) => row.userId === userId);
  if (mine.some((row) => row.role === "platform_owner")) return [...allTenantIds];
  const allowed = new Set(mine.map((row) => row.tenantId));
  return allTenantIds.filter((id) => allowed.has(id));
}
