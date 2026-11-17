"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelInviteAction,
  deleteWorkspaceAction,
  removeMemberAction,
  resendInviteAction,
  saveWorkspaceSettingsAction,
  setMemberRoleAction,
  transferWorkspaceOwnerAction,
} from "@/app/actions/workspace";
import { inviteNoticeFailed } from "@/lib/auth/invites";
import { roleLabel } from "@/lib/catalog/access";
import { distributionWordingForEditor, distributionWordingToStore } from "@/lib/catalog/csv";
import { FULL_PRESET_NAME, PUBLIC_PRESET_NAME, workspaceFieldSetChoice } from "@/lib/catalog/export-plan";
import { ownerDisplayName } from "@/lib/catalog/owner-names";
import { MAX_LOGO_FILE_BYTES } from "@/lib/catalog/logos";
import { SERVICE_ID_STYLES } from "@/lib/catalog/service-code";
import type { Role } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { useSaveToast } from "@/components/save-toast";
import { WorkspaceMark } from "@/components/workspace-mark";

const ASSIGNABLE: Role[] = ["tenant_admin", "editor", "service_manager", "viewer"];

export function WorkspaceSettings() {
  const api = useCatalog();
  const persist = usePersistSettings();
  const tenant = api.activeTenant;
  if (!tenant) return null;
  const readOnly = !api.canAdmin;

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <p className="micro">Workspace</p>
          <h1>Workspace settings</h1>
          <p className="lede">Defaults, members, and invites for {tenant.name}. Viewers can read General.</p>
        </div>
      </div>
      {api.ownerReminderDue ? (
        <div className="banner" role="status">
          Reconcile service owners against the active staff list.
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              persist({
                distributionPublic: tenant.distribution_public ?? "",
                distributionInternal: tenant.distribution_internal ?? "",
                exportFormat: tenant.default_export_format ?? "",
                exportProfileId: tenant.default_export_profile_id ?? "",
                exportFieldSet: storedFieldSet(tenant),
                reminderEnabled: true,
                markReminderSeen: true,
              })
            }
          >
            Dismiss for 30 days
          </button>
        </div>
      ) : null}
      <div className="settings-grid">
        <GeneralSection readOnly={readOnly} />
        <DistributionSection
          key={`${tenant.id}:${tenant.name}:${tenant.distribution_public ?? ""}:${tenant.distribution_internal ?? ""}`}
          readOnly={readOnly}
        />
        <ExportSection readOnly={readOnly} />
        {readOnly ? (
          <section className="panel settings-block settings-span">
            <h2>Members and invites</h2>
            <p className="lede">Member management is limited to Admins.</p>
          </section>
        ) : (
          <MembersSection />
        )}
        {api.role === "platform_owner" && !api.demo ? <DangerSection /> : null}
      </div>
    </div>
  );
}

function GeneralSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const toast = useSaveToast();
  const persist = usePersistSettings();
  const tenant = api.activeTenant;
  const [name, setName] = useState(tenant?.name ?? "");
  const [logoUrl, setLogoUrl] = useState("");
  const [reminder, setReminder] = useState(Boolean(tenant?.owner_reminder_enabled));
  if (!tenant) return null;
  const selectedStyle = SERVICE_ID_STYLES.find((item) => item.mode === tenant.service_code_mode) ?? SERVICE_ID_STYLES[0];

  return (
    <section className="panel settings-block">
      <h2>General</h2>
      <div className="stack">
        <label htmlFor="settings-name">Company</label>
        <div className="name-row">
          <input
            id="settings-name"
            className="input"
            value={name}
            disabled={readOnly}
            onChange={(event) => setName(event.target.value)}
          />
          {readOnly ? null : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void api.renameWorkspace(name).then(() => undefined, () => undefined)}
            >
              Rename
            </button>
          )}
        </div>
        <p className="hint">Slug stays {tenant.slug}.</p>
        <div className="name-row">
          <WorkspaceMark name={tenant.name} logoUrl={tenant.logo_url} size={28} />
          {readOnly ? null : (
            <>
              <label className="btn btn-secondary">
                Upload logo
                <input
                  className="file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  aria-label="Upload company logo"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > MAX_LOGO_FILE_BYTES) {
                      toast.error("Use an image under 80 KB.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = typeof reader.result === "string" ? reader.result : "";
                      void api.setTenantLogo(result);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <input
                className="input"
                value={logoUrl}
                placeholder="https://example.com/logo.png"
                aria-label="Logo image URL"
                onChange={(event) => setLogoUrl(event.target.value)}
              />
              <button type="button" className="btn btn-secondary" disabled={!logoUrl.trim()} onClick={() => void api.setTenantLogo(logoUrl)}>
                Use URL
              </button>
            </>
          )}
        </div>
        <div className="id-style-row">
          <div className="segmented" role="radiogroup" aria-label="Service ID style">
            {SERVICE_ID_STYLES.map((item) => (
              <button
                key={item.mode}
                type="button"
                role="radio"
                aria-checked={tenant.service_code_mode === item.mode}
                disabled={readOnly}
                onClick={() => void api.setServiceCodeMode(item.mode)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="id-style-copy">{selectedStyle?.description}</p>
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={reminder}
            onChange={(event) => {
              const enabled = event.target.checked;
              setReminder(enabled);
              if (readOnly) return;
              persist({
                distributionPublic: tenant.distribution_public ?? "",
                distributionInternal: tenant.distribution_internal ?? "",
                exportFormat: tenant.default_export_format ?? "",
                exportProfileId: tenant.default_export_profile_id ?? "",
                exportFieldSet: storedFieldSet(tenant),
                reminderEnabled: enabled,
              });
            }}
          />
          Remind Admins about once a month to reconcile owners
        </label>
      </div>
    </section>
  );
}

function DistributionSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const company = tenant?.name ?? "";
  const [publicMark, setPublicMark] = useState(() =>
    distributionWordingForEditor(company, "public", tenant?.distribution_public),
  );
  const [internalMark, setInternalMark] = useState(() =>
    distributionWordingForEditor(company, "internal", tenant?.distribution_internal),
  );
  if (!tenant) return null;
  const builtinPublic = distributionWordingForEditor(tenant.name, "public", null);
  const builtinInternal = distributionWordingForEditor(tenant.name, "internal", null);
  return (
    <section className="panel settings-block distribution-card">
      <h2>Distribution wording</h2>
      <div className="stack">
        <label htmlFor="dist-public">Public</label>
        <textarea id="dist-public" className="textarea" rows={2} disabled={readOnly} value={publicMark} onChange={(event) => setPublicMark(event.target.value)} />
        <label htmlFor="dist-internal">Internal</label>
        <textarea id="dist-internal" className="textarea" rows={2} disabled={readOnly} value={internalMark} onChange={(event) => setInternalMark(event.target.value)} />
        {readOnly ? null : (
          <div className="name-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPublicMark(builtinPublic);
                setInternalMark(builtinInternal);
              }}
            >
              Revert to built-in
            </button>
            <SaveDefaults
              publicMark={distributionWordingToStore(tenant.name, "public", publicMark)}
              internalMark={distributionWordingToStore(tenant.name, "internal", internalMark)}
              format={tenant.default_export_format ?? ""}
              profileId={tenant.default_export_profile_id ?? ""}
              fieldSet={storedFieldSet(tenant)}
              reminder={Boolean(tenant.owner_reminder_enabled)}
              label="Save wording"
            />
          </div>
        )}
      </div>
    </section>
  );
}

const EXPORT_FORMATS = [
  ["csv", "CSV"],
  ["xlsx", "Excel"],
  ["docx", "Word"],
  ["pdf", "PDF"],
  ["json", "JSON"],
] as const;

function ExportSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const profileIds = api.exportProfiles.map((profile) => profile.id);
  const [format, setFormat] = useState<string>(tenant?.default_export_format || "csv");
  const [fieldChoice, setFieldChoice] = useState(() =>
    workspaceFieldSetChoice({
      profileId: tenant?.default_export_profile_id,
      fieldSet: tenant?.default_export_field_set,
      profileIds,
    }),
  );
  if (!tenant) return null;
  const savedProfileId = fieldChoice === "public" || fieldChoice === "full" ? "" : fieldChoice;
  const savedFieldSet = fieldChoice === "full" ? "full" : savedProfileId ? "" : "public";
  return (
    <section className="panel settings-block settings-span">
      <h2>Export defaults</h2>
      <div className="export-defaults-row">
        <div>
          <label htmlFor="export-format">Default format</label>
          <select id="export-format" className="select" disabled={readOnly} value={format || "csv"} onChange={(event) => setFormat(event.target.value)}>
            {EXPORT_FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="export-field-set">Default field set</label>
          <select
            id="export-field-set"
            className="select"
            disabled={readOnly}
            value={fieldChoice}
            onChange={(event) => setFieldChoice(event.target.value)}
          >
            <option value="public">{PUBLIC_PRESET_NAME}</option>
            <option value="full">{FULL_PRESET_NAME}</option>
            {api.exportProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
        {readOnly ? null : (
          <SaveDefaults
            publicMark={tenant.distribution_public ?? ""}
            internalMark={tenant.distribution_internal ?? ""}
            format={format || "csv"}
            profileId={savedProfileId}
            fieldSet={savedFieldSet}
            reminder={Boolean(tenant.owner_reminder_enabled)}
            label="Save export defaults"
          />
        )}
      </div>
      <p className="hint export-defaults-note">Field sets are saved from the Export dialog.</p>
    </section>
  );
}

function storedFieldSet(tenant: { default_export_profile_id?: string | null; default_export_field_set?: string | null }): string {
  if (tenant.default_export_profile_id) return "";
  return tenant.default_export_field_set === "full" ? "full" : "public";
}

function SaveDefaults({
  publicMark,
  internalMark,
  format,
  profileId,
  fieldSet,
  reminder,
  label,
}: {
  publicMark: string;
  internalMark: string;
  format: string;
  profileId: string;
  fieldSet: string;
  reminder: boolean;
  label: string;
}) {
  const persist = usePersistSettings();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        persist({
          distributionPublic: publicMark,
          distributionInternal: internalMark,
          exportFormat: format,
          exportProfileId: profileId,
          exportFieldSet: fieldSet,
          reminderEnabled: reminder,
        })
      }
    >
      {label}
    </button>
  );
}

function usePersistSettings() {
  const api = useCatalog();
  const toast = useSaveToast();
  return (input: {
    distributionPublic: string;
    distributionInternal: string;
    exportFormat: string;
    exportProfileId: string;
    exportFieldSet: string;
    reminderEnabled: boolean;
    markReminderSeen?: boolean;
  }) => {
    const tenant = api.activeTenant;
    if (!tenant) return;
    if (api.demo) {
      const result = api.demoDispatch({
        type: "settings",
        distributionPublic: input.distributionPublic,
        distributionInternal: input.distributionInternal,
        exportFormat: input.exportFormat,
        exportProfileId: input.exportProfileId,
        exportFieldSet: input.exportFieldSet,
        reminderEnabled: input.reminderEnabled,
        markReminderSeen: input.markReminderSeen,
      });
      if (!result.ok) toast.error(result.error);
      else if (!input.markReminderSeen) toast.success("Settings saved");
      return;
    }
    void saveWorkspaceSettingsAction({
      tenantId: tenant.id,
      distributionPublic: input.distributionPublic,
      distributionInternal: input.distributionInternal,
      exportFormat: input.exportFormat,
      exportProfileId: input.exportProfileId,
      exportFieldSet: input.exportFieldSet,
      reminderEnabled: input.reminderEnabled,
      markReminderSeen: input.markReminderSeen,
    }).then(async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await api.refresh();
      if (!input.markReminderSeen) toast.success("Settings saved");
    });
  };
}

function MembersSection() {
  const api = useCatalog();
  const toast = useSaveToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const admins = api.members.filter((member) => member.role === "tenant_admin" || member.role === "platform_owner");

  return (
    <section className="panel settings-block settings-span">
      <h2>Members and invites</h2>
      <table className="catalog settings-members">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {api.members.map((member) => {
            const lastAdmin = admins.length < 2 && (member.role === "tenant_admin" || member.role === "platform_owner");
            const name = member.first_name && member.last_name ? ownerDisplayName(member.first_name, member.last_name) : member.email;
            return (
              <tr key={member.id}>
                <td>{name}</td>
                <td>{member.email}</td>
                <td>{member.deactivated_at ? "Deactivated" : "Active"}</td>
                <td>
                  <select
                    className="select"
                    aria-label={`Role for ${member.email}`}
                    value={member.role}
                    onChange={(event) => {
                      const next = event.target.value as Role;
                      if (api.demo) {
                        const result = api.demoDispatch({ type: "member-role", userId: member.user_id, role: next });
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Role saved");
                        return;
                      }
                      void setMemberRoleAction(member.tenant_id, member.user_id, next).then(async (result) => {
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        await api.refresh();
                        toast.success("Role saved");
                      });
                    }}
                  >
                    {ASSIGNABLE.map((item) => (
                      <option key={item} value={item}>
                        {roleLabel(item)}
                      </option>
                    ))}
                    {api.canGrantOwner || member.role === "platform_owner" ? <option value="platform_owner">Platform owner</option> : null}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={lastAdmin}
                    onClick={() => {
                      if (api.demo) {
                        const result = api.demoDispatch({ type: "remove-member", userId: member.user_id });
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Removed from workspace");
                        return;
                      }
                      void removeMemberAction(member.tenant_id, member.user_id).then(async (result) => {
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        await api.refresh();
                        toast.success("Removed from workspace");
                      });
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">Remove leaves the account in place. The last Admin cannot be removed.</p>
      <form
        className="invite-row"
        onSubmit={(event) => {
          event.preventDefault();
          void api.addMember(email, role).then(
            () => setEmail(""),
            () => undefined,
          );
        }}
      >
        <label className="sr-only" htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          className="input"
          type="email"
          required
          placeholder="person@example.com"
          aria-label="Invite email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="sr-only" htmlFor="invite-role">
          Role
        </label>
        <select id="invite-role" className="select" aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ASSIGNABLE.map((item) => (
            <option key={item} value={item}>
              {roleLabel(item)}
            </option>
          ))}
          {api.canGrantOwner ? <option value="platform_owner">Platform owner</option> : null}
        </select>
        <button type="submit" className="btn btn-primary">
          Send
        </button>
      </form>
      {api.invitations.length === 0 ? <p className="hint">No pending invites.</p> : null}
      {api.invitations.map((invite) => (
        <div className="member" key={invite.id}>
          <span>
            {invite.email}
            <span className="micro">
              {" "}
              · {roleLabel(invite.role)}
              {invite.becomes_owner ? " · becomes owner on acceptance" : ""}
              {invite.expires_at ? ` · expires ${invite.expires_at.slice(0, 10)}` : ""}
            </span>
          </span>
          <span className="name-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (api.demo) {
                  const result = api.demoDispatch({ type: "resend-invite", inviteId: invite.id });
                  if (!result.ok) toast.error(result.error);
                  else showInviteToast(toast, result.notice);
                  return;
                }
                void resendInviteAction(invite.id).then(async (result) => {
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  await api.refresh();
                  showInviteToast(toast, result.data.notice);
                });
              }}
            >
              Resend
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (api.demo) {
                  const result = api.demoDispatch({ type: "cancel-invite", inviteId: invite.id });
                  if (!result.ok) toast.error(result.error);
                  else toast.success("Invite cancelled");
                  return;
                }
                void cancelInviteAction(invite.id).then(async (result) => {
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  await api.refresh();
                  toast.success("Invite cancelled");
                });
              }}
            >
              Cancel
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function DangerSection() {
  const api = useCatalog();
  const router = useRouter();
  const toast = useSaveToast();
  const tenant = api.activeTenant;
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!tenant) return null;

  const owner = api.members.find((member) => member.user_id === tenant.owner_user_id);
  const ownerLabel = owner
    ? owner.first_name && owner.last_name
      ? `${ownerDisplayName(owner.first_name, owner.last_name)} (${owner.email})`
      : owner.email
    : "Not recorded yet";
  const candidates = api.members.filter((member) => member.user_id !== tenant.owner_user_id && !member.deactivated_at);
  const pending = api.invitations.filter((invite) => invite.becomes_owner);
  const nameMatches = confirmName.trim() === tenant.name;

  return (
    <section className="panel settings-block danger-zone settings-span">
      <h2>Danger zone</h2>
      <p className="hint">
        Site Admin only. The current owner is {ownerLabel}. Transfer keeps that person as owner until the new owner is in
        place. Delete removes this workspace and its data.
      </p>
      {pending.map((invite) => (
        <div className="member" key={invite.id}>
          <span>
            {invite.email}
            <span className="micro"> · pending ownership invite · becomes owner on acceptance</span>
          </span>
          <span className="name-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void resendInviteAction(invite.id).then(async (result) => {
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  await api.refresh();
                  showInviteToast(toast, result.data.notice);
                });
              }}
            >
              Resend
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void cancelInviteAction(invite.id).then(async (result) => {
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  await api.refresh();
                  toast.success("Invite cancelled");
                });
              }}
            >
              Cancel
            </button>
          </span>
        </div>
      ))}
      <div className="name-row">
        <button type="button" className="btn btn-secondary" onClick={() => setTransferOpen(true)}>
          Transfer ownership
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(true)}>
          Delete workspace
        </button>
      </div>
      {transferOpen ? (
        <div className="modal-backdrop confirm-layer" role="presentation" onMouseDown={() => setTransferOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="transfer-title">Transfer ownership</h2>
            <p className="lede">
              Choose a current member, or enter an email for someone who is not in this workspace. A new email gets an
              invitation and becomes the owner only after they accept. Until then the current owner stays owner. The
              previous owner becomes an Admin.
            </p>
            <label htmlFor="transfer-member">Existing member</label>
            <select
              id="transfer-member"
              className="select"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">Choose a member</option>
              {candidates.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.email}
                </option>
              ))}
            </select>
            <label htmlFor="transfer-email">Email of someone not in this workspace</label>
            <input
              id="transfer-email"
              className="input"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setTransferOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  setBusy(true);
                  void transferWorkspaceOwnerAction({
                    tenantId: tenant.id,
                    userId: memberId || null,
                    email: email.trim() || null,
                  }).then(async (result) => {
                    setBusy(false);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    setTransferOpen(false);
                    setMemberId("");
                    setEmail("");
                    await api.refresh();
                    showInviteToast(toast, result.data.notice);
                  });
                }}
              >
                Transfer ownership
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteOpen ? (
        <div className="modal-backdrop confirm-layer" role="presentation" onMouseDown={() => setDeleteOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-workspace-title">Delete workspace</h2>
            <p className="lede">
              This deletes {tenant.name} and the data that belongs to it. Type {tenant.name} to confirm.
            </p>
            <label htmlFor="delete-workspace-name">Type the name to confirm</label>
            <input
              id="delete-workspace-name"
              className="input"
              value={confirmName}
              autoComplete="off"
              onChange={(event) => setConfirmName(event.target.value)}
            />
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!nameMatches || busy}
                onClick={() => {
                  if (!nameMatches || busy) return;
                  setBusy(true);
                  void deleteWorkspaceAction(tenant.id, confirmName.trim()).then(async (result) => {
                    if (!result.ok) {
                      setBusy(false);
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Workspace deleted");
                    try {
                      await api.refresh();
                    } catch {
                      // The workspace is already gone. Opening the catalog reloads what remains.
                    }
                    router.push("/catalog");
                    router.refresh();
                  });
                }}
              >
                Delete workspace
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function showInviteToast(
  toast: { success: (message: string) => void; error: (message: string) => void },
  notice: string,
) {
  if (inviteNoticeFailed(notice)) toast.error(notice);
  else toast.success(notice);
}

