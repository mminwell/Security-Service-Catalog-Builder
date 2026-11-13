"use server";

import { normalizeEmail, validateEmail, validatePassword } from "@/lib/auth/credentials";
import { sendInviteNotice } from "@/lib/auth/invite-mail";
import { isWorkspaceRole } from "@/lib/auth/invites";
import { normalizeAccountProfile } from "@/lib/auth/profile";
import { isUuid } from "@/lib/auth/ids";
import type { PlannedOwnerImport } from "@/lib/catalog/owner-names";
import type { Role } from "@/lib/catalog/types";
import { createAuthedClient, loadOwnMemberships } from "@/lib/server/guard";
import { fail, ok, type ActionResult } from "@/lib/server/result";
import { persistUserProfile } from "@/lib/data/remote";

export async function cancelInviteAction(inviteId: string): Promise<ActionResult<null>> {
  try {
    if (!isUuid(inviteId)) throw new Error("That invite is not valid.");
    const { supabase } = await createAuthedClient();
    const { error } = await supabase.rpc("cancel_workspace_invitation", { p_invite: inviteId });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function resendInviteAction(inviteId: string): Promise<ActionResult<{ notice: string }>> {
  try {
    if (!isUuid(inviteId)) throw new Error("That invite is not valid.");
    const { supabase } = await createAuthedClient();
    const { data, error } = await supabase.rpc("resend_workspace_invitation", { p_invite: inviteId });
    if (error) throw new Error(error.message);
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const role = typeof record.role === "string" && isWorkspaceRole(record.role) ? record.role : "viewer";
    const mailed = await sendInviteNotice({
      email: typeof record.email === "string" ? record.email : "",
      token: typeof record.token === "string" ? record.token : null,
      workspaceName: typeof record.workspace_name === "string" ? record.workspace_name : "your workspace",
      role,
      kind: "invited",
    });
    return ok({ notice: mailed.detail });
  } catch (error) {
    return fail(error);
  }
}

export async function setMemberRoleAction(tenantId: string, userId: string, role: Role): Promise<ActionResult<null>> {
  try {
    if (!isUuid(tenantId) || !isUuid(userId)) throw new Error("That member is not valid.");
    if (!isWorkspaceRole(role) && role !== "platform_owner") throw new Error("Unknown role.");
    const { supabase } = await createAuthedClient();
    const { error } = await supabase.rpc("set_member_role", { p_tenant: tenantId, p_user: userId, p_role: role });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function removeMemberAction(tenantId: string, userId: string): Promise<ActionResult<null>> {
  try {
    if (!isUuid(tenantId) || !isUuid(userId)) throw new Error("That member is not valid.");
    const { supabase } = await createAuthedClient();
    const { error } = await supabase.rpc("remove_tenant_member", { p_tenant: tenantId, p_user: userId });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function saveWorkspaceSettingsAction(input: {
  tenantId: string;
  distributionPublic: string;
  distributionInternal: string;
  exportFormat: string;
  exportProfileId: string;
  reminderEnabled: boolean;
  markReminderSeen?: boolean;
}): Promise<ActionResult<null>> {
  try {
    if (!isUuid(input.tenantId)) throw new Error("That workspace is not valid.");
    if (input.exportProfileId && !isUuid(input.exportProfileId)) throw new Error("That export profile is not valid.");
    const { supabase } = await createAuthedClient();
    const { error } = await supabase.rpc("save_workspace_settings", {
      p_tenant: input.tenantId,
      p_distribution_public: input.distributionPublic,
      p_distribution_internal: input.distributionInternal,
      p_format: input.exportFormat,
      p_profile: input.exportProfileId || null,
      p_reminder: input.reminderEnabled,
      p_mark_reminder_seen: Boolean(input.markReminderSeen),
    });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function saveOwnerAction(input: {
  tenantId: string;
  id?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  teamCode: string;
  userId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    if (!isUuid(input.tenantId)) throw new Error("That workspace is not valid.");
    if (input.userId && !isUuid(input.userId)) throw new Error("That account is not valid.");
    const { supabase } = await createAuthedClient();
    const { data, error } = await supabase.rpc("upsert_service_owner", {
      p_tenant: input.tenantId,
      p_owner: {
        id: input.id || null,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        title: input.title,
        team_code: input.teamCode,
        user_id: input.userId || null,
        history_reason: "edit",
      },
    });
    if (error) throw new Error(error.message);
    if (typeof data !== "string" || !isUuid(data)) throw new Error("The owner could not be saved.");
    return ok({ id: data });
  } catch (error) {
    return fail(error);
  }
}

export async function archiveOwnerAction(
  ownerId: string,
  replacementId: string | null,
): Promise<ActionResult<{ services: number }>> {
  try {
    if (!isUuid(ownerId)) throw new Error("That owner is not valid.");
    if (replacementId && !isUuid(replacementId)) throw new Error("That replacement owner is not valid.");
    const { supabase } = await createAuthedClient();
    const { data, error } = await supabase.rpc("archive_service_owner", {
      p_owner: ownerId,
      p_replacement: replacementId,
      p_reason: "archive",
    });
    if (error) throw new Error(error.message);
    return ok({ services: typeof data === "number" ? data : 0 });
  } catch (error) {
    return fail(error);
  }
}

export async function reactivateOwnerAction(ownerId: string): Promise<ActionResult<null>> {
  try {
    if (!isUuid(ownerId)) throw new Error("That owner is not valid.");
    const { supabase } = await createAuthedClient();
    const { error } = await supabase.rpc("reactivate_service_owner", { p_owner: ownerId });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function importOwnersAction(
  tenantId: string,
  rows: PlannedOwnerImport[],
): Promise<ActionResult<{ created: number }>> {
  try {
    if (!isUuid(tenantId)) throw new Error("That workspace is not valid.");
    const ready = rows.filter((row) => row.status === "ready" && row.firstName && row.lastName);
    if (ready.length === 0) throw new Error("No rows are ready to import.");
    if (ready.some((row) => row.reason)) throw new Error("Flagged rows are not imported.");
    const { supabase } = await createAuthedClient();
    const { data, error } = await supabase.rpc("import_service_owners", {
      p_tenant: tenantId,
      p_rows: ready.map((row) => ({
        first_name: row.firstName,
        last_name: row.lastName,
        email: row.email,
        title: row.title,
        team_code: row.teamCode,
      })),
    });
    if (error) throw new Error(error.message);
    const created = data && typeof data === "object" && "created" in data ? Number(data.created) : ready.length;
    return ok({ created: Number.isFinite(created) ? created : ready.length });
  } catch (error) {
    return fail(error);
  }
}

export async function reconcileOwnersAction(
  tenantId: string,
  ownerIds: string[],
  replacementId: string | null,
): Promise<ActionResult<{ services: number }>> {
  try {
    if (!isUuid(tenantId)) throw new Error("That workspace is not valid.");
    if (ownerIds.some((id) => !isUuid(id))) throw new Error("That owner is not valid.");
    if (replacementId && !isUuid(replacementId)) throw new Error("That replacement owner is not valid.");
    const { supabase } = await createAuthedClient();
    const { data, error } = await supabase.rpc("apply_owner_reconciliation", {
      p_tenant: tenantId,
      p_owner_ids: ownerIds,
      p_replacement: replacementId,
    });
    if (error) throw new Error(error.message);
    return ok({ services: typeof data === "number" ? data : 0 });
  } catch (error) {
    return fail(error);
  }
}

export async function listSiteAccountsAction(): Promise<
  ActionResult<
    Array<{
      user_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      deactivated_at: string | null;
      memberships: Array<{ tenant_id: string; name: string; role: string }>;
    }>
  >
> {
  try {
    const { supabase, user } = await createAuthedClient();
    const memberships = await loadOwnMemberships(supabase, user.id);
    if (!memberships.some((row) => row.role === "platform_owner")) {
      throw new Error("Only a platform owner can manage accounts.");
    }
    const { data, error } = await supabase.rpc("list_site_accounts");
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    return ok(
      rows.map((row) => {
        const record = row as Record<string, unknown>;
        const membershipsRaw = Array.isArray(record.memberships) ? record.memberships : [];
        return {
          user_id: String(record.user_id),
          email: String(record.email ?? ""),
          first_name: typeof record.first_name === "string" ? record.first_name : null,
          last_name: typeof record.last_name === "string" ? record.last_name : null,
          deactivated_at: typeof record.deactivated_at === "string" ? record.deactivated_at : null,
          memberships: membershipsRaw.map((item) => {
            const membership = item as Record<string, unknown>;
            return {
              tenant_id: String(membership.tenant_id ?? ""),
              name: String(membership.name ?? ""),
              role: String(membership.role ?? ""),
            };
          }),
        };
      }),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function setAccountActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult<{ services: number; owners: number }>> {
  try {
    if (!isUuid(userId)) throw new Error("That account is not valid.");
    const { supabase } = await createAuthedClient();
    const { data, error } = await supabase.rpc("set_account_active", { p_user: userId, p_active: active });
    if (error) throw new Error(error.message);
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    return ok({
      services: typeof record.services === "number" ? record.services : 0,
      owners: typeof record.owners === "number" ? record.owners : 0,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAccountAction(userId: string, email: string): Promise<ActionResult<null>> {
  try {
    if (!isUuid(userId)) throw new Error("That account is not valid.");
    const emailError = validateEmail(email);
    if (emailError) throw new Error(emailError);
    const { supabase } = await createAuthedClient();
    const { error } = await supabase.rpc("delete_site_account", { p_user: userId, p_email: normalizeEmail(email) });
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function reassignDeactivatedOwnersAction(
  ownerIds: string[],
  replacementId: string | null,
): Promise<ActionResult<null>> {
  try {
    if (ownerIds.some((id) => !isUuid(id))) throw new Error("That owner is not valid.");
    if (replacementId && !isUuid(replacementId)) throw new Error("That replacement owner is not valid.");
    const { supabase } = await createAuthedClient();
    for (const ownerId of ownerIds) {
      const { error } = await supabase.rpc("reassign_owned_services", {
        p_owner: ownerId,
        p_replacement: replacementId,
      });
      if (error) throw new Error(error.message);
    }
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function previewInviteAction(token: string): Promise<
  ActionResult<{ email: string; role: Role; workspaceName: string; company: string }>
> {
  try {
    if (!/^[a-f0-9]{32,128}$/i.test(token)) throw new Error("That invite link is not valid.");
    const { supabase, user } = await createAuthedClient();
    const { data, error } = await supabase.rpc("preview_invitation", { p_token: token });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") throw new Error("That invite link is not valid.");
    const record = row as Record<string, unknown>;
    const roleValue = String(record.role ?? "");
    if (!isWorkspaceRole(roleValue)) throw new Error("That invite has an unknown role.");
    const workspaceName = String(record.workspace_name ?? "");
    const profile = await supabase.from("user_profiles").select("company").eq("user_id", user.id).maybeSingle();
    const company = profile.data && typeof profile.data.company === "string" ? profile.data.company : workspaceName;
    return ok({
      email: String(record.email ?? user.email ?? ""),
      role: roleValue,
      workspaceName,
      company,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function finishInviteAction(input: {
  token: string;
  firstName: string;
  lastName: string;
  company: string;
  password: string;
}): Promise<ActionResult<{ tenantId: string }>> {
  try {
    if (!/^[a-f0-9]{32,128}$/i.test(input.token)) throw new Error("That invite link is not valid.");
    const passwordError = validatePassword(input.password);
    if (passwordError) throw new Error(passwordError);
    const { supabase, user } = await createAuthedClient();
    const preview = await supabase.rpc("preview_invitation", { p_token: input.token });
    if (preview.error) throw new Error(preview.error.message);
    const row = Array.isArray(preview.data) ? preview.data[0] : preview.data;
    const workspaceName =
      row && typeof row === "object" && "workspace_name" in row ? String((row as { workspace_name?: string }).workspace_name ?? "") : "";
    const company = input.company.trim() || workspaceName;
    const profile = normalizeAccountProfile({
      firstName: input.firstName,
      lastName: input.lastName,
      company,
    });
    const password = await supabase.auth.updateUser({ password: input.password });
    if (password.error) throw new Error(password.error.message);
    await persistUserProfile(supabase, user.id, profile);
    const accepted = await supabase.rpc("accept_invitation", { p_token: input.token });
    if (accepted.error) throw new Error(accepted.error.message);
    if (typeof accepted.data !== "string") throw new Error("The invite could not be accepted.");
    return ok({ tenantId: accepted.data });
  } catch (error) {
    return fail(error);
  }
}

