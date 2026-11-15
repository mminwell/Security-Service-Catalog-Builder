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

export const ARCHIVE_SERVICE_CONFIRMATION = "Are you sure you want to archive this service?";
export const DELETE_SERVICE_CONFIRMATION =
  "Are you sure you want to delete this service? This can't be undone.";

/** New services say Save Service. An existing record says Save. */
export function serviceSaveButtonLabel(isNew: boolean, saving: boolean): string {
  if (saving) return "Saving…";
  return isNew ? "Save Service" : "Save";
}
