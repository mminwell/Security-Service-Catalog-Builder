"use client";

import { useState } from "react";
import {
  cancelInviteAction,
  removeMemberAction,
  resendInviteAction,
  saveWorkspaceSettingsAction,
  setMemberRoleAction,
} from "@/app/actions/workspace";
import { roleLabel } from "@/lib/catalog/access";
import { ownerDisplayName } from "@/lib/catalog/owner-names";
import { MAX_LOGO_FILE_BYTES } from "@/lib/catalog/logos";
import type { Role } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { useSaveToast } from "@/components/save-toast";
import { WorkspaceMark } from "@/components/workspace-mark";

const ASSIGNABLE: Role[] = ["tenant_admin", "editor", "service_manager", "viewer"];

export function WorkspaceSettings() {
  const api = useCatalog();
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
              void saveWorkspaceSettingsAction({
                tenantId: tenant.id,
                distributionPublic: tenant.distribution_public ?? "",
                distributionInternal: tenant.distribution_internal ?? "",
                exportFormat: tenant.default_export_format ?? "",
                exportProfileId: tenant.default_export_profile_id ?? "",
                reminderEnabled: true,
                markReminderSeen: true,
              }).then(() => api.refresh())
            }
          >
            Dismiss for 30 days
          </button>
        </div>
      ) : null}
      <div className="settings-grid">
        <GeneralSection readOnly={readOnly} />
        <DistributionSection readOnly={readOnly} />
        <ExportSection readOnly={readOnly} />
        <ReminderSection readOnly={readOnly} />
        {readOnly ? (
          <section className="panel settings-block settings-span">
            <h2>Members and invites</h2>
            <p className="lede">Member management is limited to Admins.</p>
          </section>
        ) : (
          <MembersSection />
        )}
        {readOnly ? null : <DangerSection />}
      </div>
    </div>
  );
}

function GeneralSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const toast = useSaveToast();
  const tenant = api.activeTenant;
  const [name, setName] = useState(tenant?.name ?? "");
  const [logoUrl, setLogoUrl] = useState("");
  if (!tenant) return null;

  return (
    <section className="panel settings-block">
      <h2>General</h2>
      <div className="stack">
        <label htmlFor="settings-name">Workspace name</label>
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
        <div className="segmented" role="radiogroup" aria-label="Service ID style">
          {(
            [
              ["sequential", "SVC-001"],
              ["category_prefix", "SEC-SOC-001"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={tenant.service_code_mode === mode}
              disabled={readOnly}
              onClick={() => void api.setServiceCodeMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DistributionSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const [publicMark, setPublicMark] = useState(tenant?.distribution_public ?? "");
  const [internalMark, setInternalMark] = useState(tenant?.distribution_internal ?? "");
  if (!tenant) return null;
  return (
    <section className="panel settings-block">
      <h2>Distribution wording</h2>
      <div className="stack">
        <label htmlFor="dist-public">Public</label>
        <textarea id="dist-public" className="textarea" rows={2} disabled={readOnly} value={publicMark} onChange={(event) => setPublicMark(event.target.value)} />
        <label htmlFor="dist-internal">Internal</label>
        <textarea id="dist-internal" className="textarea" rows={2} disabled={readOnly} value={internalMark} onChange={(event) => setInternalMark(event.target.value)} />
        <p className="hint">Blank uses the built-in wording.</p>
        {readOnly ? null : (
          <div className="name-row">
            <button type="button" className="btn btn-ghost" onClick={() => { setPublicMark(""); setInternalMark(""); }}>
              Revert to built-in
            </button>
            <SaveDefaults
              publicMark={publicMark}
              internalMark={internalMark}
              format={tenant.default_export_format ?? ""}
              profileId={tenant.default_export_profile_id ?? ""}
              reminder={Boolean(tenant.owner_reminder_enabled)}
              label="Save wording"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ExportSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const [format, setFormat] = useState(tenant?.default_export_format ?? "");
  const [profileId, setProfileId] = useState(tenant?.default_export_profile_id ?? "");
  if (!tenant) return null;
  return (
    <section className="panel settings-block">
      <h2>Export defaults</h2>
      <div className="stack">
        <label htmlFor="export-format">Format</label>
        <select id="export-format" className="select" disabled={readOnly} value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="">CSV</option>
          <option value="csv">CSV</option>
          <option value="xlsx">Excel</option>
          <option value="docx">Word</option>
          <option value="pdf">PDF</option>
          <option value="json">JSON</option>
        </select>
        <label htmlFor="export-profile">Profile</label>
        <select id="export-profile" className="select" disabled={readOnly} value={profileId} onChange={(event) => setProfileId(event.target.value)}>
          <option value="">Marked default</option>
          {api.exportProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        {readOnly ? null : (
          <SaveDefaults
            publicMark={tenant.distribution_public ?? ""}
            internalMark={tenant.distribution_internal ?? ""}
            format={format}
            profileId={profileId}
            reminder={Boolean(tenant.owner_reminder_enabled)}
            label="Save export defaults"
          />
        )}
      </div>
    </section>
  );
}

function ReminderSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const [reminder, setReminder] = useState(Boolean(tenant?.owner_reminder_enabled));
  if (!tenant) return null;
  return (
    <section className="panel settings-block">
      <h2>Owner reminders</h2>
      <label className="settings-check">
        <input type="checkbox" disabled={readOnly} checked={reminder} onChange={(event) => setReminder(event.target.checked)} />
        Remind Admins about once a month to reconcile owners
      </label>
      {readOnly ? null : (
        <SaveDefaults
          publicMark={tenant.distribution_public ?? ""}
          internalMark={tenant.distribution_internal ?? ""}
          format={tenant.default_export_format ?? ""}
          profileId={tenant.default_export_profile_id ?? ""}
          reminder={reminder}
          label="Save reminder"
        />
      )}
    </section>
  );
}

function SaveDefaults({
  publicMark,
  internalMark,
  format,
  profileId,
  reminder,
  label,
}: {
  publicMark: string;
  internalMark: string;
  format: string;
  profileId: string;
  reminder: boolean;
  label: string;
}) {
  const api = useCatalog();
  const toast = useSaveToast();
  const tenant = api.activeTenant;
  if (!tenant) return null;
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        void saveWorkspaceSettingsAction({
          tenantId: tenant.id,
          distributionPublic: publicMark,
          distributionInternal: internalMark,
          exportFormat: format,
          exportProfileId: profileId,
          reminderEnabled: reminder,
        }).then(async (result) => {
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          await api.refresh();
          toast.success("Settings saved");
        });
      }}
    >
      {label}
    </button>
  );
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
              {invite.expires_at ? ` · expires ${invite.expires_at.slice(0, 10)}` : ""}
            </span>
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
                  toast.success(result.data.notice);
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
    </section>
  );
}

function DangerSection() {
  return (
    <section className="panel settings-block danger-zone settings-span">
      <h2>Danger zone</h2>
      <p className="hint">Transfer and delete are not available in this version.</p>
      <div className="name-row">
        <button type="button" className="btn btn-secondary" disabled>
          Transfer ownership
        </button>
        <button type="button" className="btn btn-secondary" disabled>
          Delete workspace
        </button>
      </div>
    </section>
  );
}

