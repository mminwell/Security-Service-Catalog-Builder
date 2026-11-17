import type { Role } from "@/lib/catalog/types";
import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";

export const INVITE_DAYS = 7;

export const WORKSPACE_ROLES = ["tenant_admin", "editor", "viewer", "service_manager"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(role: string): role is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(role);
}

/** Turn a database failure into a sentence the person who clicked Send can act on. */
export function readableInviteError(message: string): string {
  const text = message.trim();
  if (/rate_limited/i.test(text)) return RATE_LIMIT_MESSAGE;
  if (/gen_random_bytes/i.test(text)) {
    return "The invite was not saved. The database could not create the invite link. Apply the latest database update and try again.";
  }
  if (/^The invite was not saved/i.test(text)) return text;
  if (/Only an Admin|valid email|Unknown role|platform owner|no longer pending|Authentication required/i.test(text)) {
    return text;
  }
  if (looksLikeDatabaseError(text)) return "The invite was not saved. Try again in a moment.";
  return `The invite was not saved. ${text}`;
}

/** Keep a sentence the app already wrote. Hide a raw Postgres error. */
export function plainDatabaseMessage(message: string, fallback: string): string {
  const text = message.trim().replace(/^ERROR:\s*/i, "");
  if (!text || looksLikeDatabaseError(text)) return fallback;
  return text;
}

export const FINISH_INVITE_LOAD_ERROR =
  "We could not load this invite. Try the link again or ask for a new invite.";

const FRIENDLY_FINISH_INVITE = [
  /^this invite is for a different email address\.?$/i,
  /^this invite was cancelled\.?$/i,
  /^this invite has expired\.?$/i,
  /^this invite has already been used\.?$/i,
  /^this invite has an unknown role\.?$/i,
  /^that invite link is not valid\.?$/i,
  /^that invite has an unknown role\.?$/i,
  /^the invite could not be accepted\.?$/i,
  /^authentication required\.?$/i,
  /^this account is deactivated\.?$/i,
];

/**
 * Finish-account keeps the sentences the database already raises for a wrong
 * email, a cancel, or an expiry. Anything that looks like raw Postgres is
 * replaced so the page never shows a column or function error.
 */
export function readableFinishInviteError(message: string): string {
  const text = message.trim().replace(/^ERROR:\s*/i, "");
  if (!text) return FINISH_INVITE_LOAD_ERROR;
  if (FRIENDLY_FINISH_INVITE.some((pattern) => pattern.test(text))) return text;
  if (looksLikeDatabaseError(text)) return FINISH_INVITE_LOAD_ERROR;
  return text;
}

export function inviteNoticeFailed(notice: string): boolean {
  return /was not sent|could not be saved|not saved/i.test(notice);
}

/** Plain confirmation for send, resend, and an existing account. Never includes a token. */
export function inviteNoticeText(input: {
  email: string;
  kind: "invited" | "member";
  sent: boolean;
  resent?: boolean;
}): string {
  const email = input.email.trim();
  if (input.kind === "member") {
    if (!input.sent) {
      return email
        ? `${email} was added to the workspace, but the email was not sent.`
        : "They were added to the workspace, but the email was not sent.";
    }
    return email ? `${email} was added to the workspace.` : "They were added to the workspace.";
  }
  if (!input.sent) return "The invite was saved, but the email was not sent.";
  if (input.resent) return email ? `Invite resent to ${email}.` : "Invite resent.";
  return email ? `Invite sent to ${email}.` : "Invite sent.";
}

function looksLikeDatabaseError(text: string): boolean {
  return /column reference|ambiguous|does not exist|syntax error|permission denied|violates |duplicate key|null value in column|schema cache|PGRST|SQLSTATE|operator does not exist|invalid input syntax|could not find the function|row-level security|relation ["']|function public\.|auth\.users|42702|42P01|42804/i.test(
    text,
  );
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
