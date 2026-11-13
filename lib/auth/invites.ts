import type { Role } from "@/lib/catalog/types";

export const INVITE_DAYS = 7;

export const WORKSPACE_ROLES = ["tenant_admin", "editor", "viewer", "service_manager"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(role: string): role is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(role);
}

export function inviteExpiry(from: Date): Date {
  return new Date(from.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

export type StoredInvite = {
  email: string;
  role: Role;
  acceptedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
};

export type InviteDecision =
  | { accept: true; role: Role }
  | { accept: false; reason: string };

/** The stored invite chooses the role. The account never supplies one. */
export function decideInvite(invite: StoredInvite, accountEmail: string, now: Date): InviteDecision {
  const email = accountEmail.trim().toLowerCase();
  if (email.length === 0 || email !== invite.email.trim().toLowerCase()) {
    return { accept: false, reason: "This invite is for a different email address." };
  }
  if (invite.acceptedAt) return { accept: false, reason: "This invite has already been used." };
  if (invite.cancelledAt) return { accept: false, reason: "This invite was cancelled." };
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= now.getTime()) {
    return { accept: false, reason: "This invite has expired." };
  }
  if (!isWorkspaceRole(invite.role) && invite.role !== "platform_owner") {
    return { accept: false, reason: "This invite has an unknown role." };
  }
  return { accept: true, role: invite.role };
}
