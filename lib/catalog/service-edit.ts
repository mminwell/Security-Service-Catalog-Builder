import type { Role } from "@/lib/catalog/types";

export type ServiceEditGate = {
  role: Role | null;
  userId: string | null;
  ownerUserId: string | null;
  ownerActive: boolean;
  ownerDeactivated: boolean;
};

/**
 * Editors and admins edit every service in the workspace.
 * A Service Manager edits only a service whose active owner record is linked to their account.
 */
export function canEditServiceContent(gate: ServiceEditGate): boolean {
  if (!gate.role || !gate.userId) return false;
  if (gate.role === "platform_owner" || gate.role === "tenant_admin" || gate.role === "editor") return true;
  if (gate.role !== "service_manager") return false;
  return gate.ownerActive && !gate.ownerDeactivated && gate.ownerUserId === gate.userId;
}

export function canCreateService(role: Role | null): boolean {
  return role === "platform_owner" || role === "tenant_admin" || role === "editor";
}
