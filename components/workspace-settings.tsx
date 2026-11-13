"use client";

import Link from "next/link";
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
import { WorkspaceMark } from "@/components/workspace-mark";

const ASSIGNABLE: Role[] = ["tenant_admin", "editor", "service_manager", "viewer"];

export function WorkspaceSettings() {
  const api = useCatalog();
  const tenant = api.activeTenant;
  if (!tenant) return null;
  const readOnly = !api.canAdmin;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Workspace</p>
          <h1>Workspace settings</h1>
          <p className="lede">
            General defaults, members, and invites for {tenant.name}. Viewers and Editors can read the general section.
            Member changes stay with Admins.
          </p>
        </div>
      </div>
      {api.ownerReminderDue ? (
        <div className="banner" role="status">
          It has been about a month since the last owner check.{" "}
          <Link href="/admin/owners">Reconcile service owners</Link> against the active staff list.
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
      <GeneralSection readOnly={readOnly} />
      {readOnly ? (
        <section className="panel settings-block">
          <h2>Members</h2>
          <p className="lede">Member management is limited to Admins.</p>
        </section>
      ) : (
        <>
          <MembersSection />
          <InvitesSection />
          <RolesSection />
          <DangerSection />
        </>
      )}
    </>
  );
}

function GeneralSection({ readOnly }: { readOnly: boolean }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const [name, setName] = useState(tenant?.name ?? "");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [publicMark, setPublicMark] = useState(tenant?.distribution_public ?? "");
  const [internalMark, setInternalMark] = useState(tenant?.distribution_internal ?? "");
  const [format, setFormat] = useState(tenant?.default_export_format ?? "");
  const [profileId, setProfileId] = useState(tenant?.default_export_profile_id ?? "");
  const [reminder, setReminder] = useState(Boolean(tenant?.owner_reminder_enabled));
  const [notice, setNotice] = useState<string | null>(null);
  if (!tenant) return null;

  async function saveDefaults() {
    if (!tenant) return;
    setNotice(null);
    const result = await saveWorkspaceSettingsAction({
      tenantId: tenant.id,
      distributionPublic: publicMark,
      distributionInternal: internalMark,
      exportFormat: format,
      exportProfileId: profileId,
      reminderEnabled: reminder,
    });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    await api.refresh();
    setNotice("Saved.");
  }

  return (
    <section className="panel settings-block">
      <h2>General</h2>
      <div className="stack">
        <label htmlFor="settings-name">Workspace name</label>
        <input id="settings-name" className="input" value={name} disabled={readOnly} onChange={(event) => setName(event.target.value)} />
        {readOnly ? null : (
          <button type="button" className="btn btn-secondary" onClick={() => void api.renameWorkspace(name)}>
            Rename workspace
          </button>
        )}
        <p className="hint">The slug stays {tenant.slug}. Renames are written to the audit log.</p>
        <p className="micro">Logo</p>
        <div className="row-actions">
          <WorkspaceMark name={tenant.name} logoUrl={tenant.logo_url} size={36} />
          {readOnly ? null : (
            <label className="btn btn-secondary">
              Upload image
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
                    setLogoError("Use an image under 80 KB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = typeof reader.result === "string" ? reader.result : "";
                    void api.setTenantLogo(result).then(
                      () => setLogoError(null),
                      (err: unknown) => setLogoError(err instanceof Error ? err.message : "Could not update the logo."),
                    );
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
        </div>
        {readOnly ? null : (
          <div className="row-actions">
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
          </div>
        )}
        {logoError ? <p className="field-error">{logoError}</p> : null}
        <p className="micro">Service IDs</p>
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
        <label htmlFor="dist-public">Default public distribution statement</label>
        <textarea id="dist-public" className="textarea" disabled={readOnly} value={publicMark} onChange={(event) => setPublicMark(event.target.value)} />
        <label htmlFor="dist-internal">Default internal distribution statement</label>
        <textarea id="dist-internal" className="textarea" disabled={readOnly} value={internalMark} onChange={(event) => setInternalMark(event.target.value)} />
        <p className="hint">Leave either blank to use the built-in wording for that audience.</p>
        {readOnly ? null : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPublicMark("");
              setInternalMark("");
            }}
          >
            Revert to built-in wording
          </button>
        )}
        <label htmlFor="export-format">Default export format</label>
        <select id="export-format" className="select" disabled={readOnly} value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="">CSV, unless the person changes it</option>
          <option value="csv">CSV</option>
          <option value="xlsx">Excel</option>
          <option value="docx">Word</option>
          <option value="pdf">PDF</option>
          <option value="json">JSON</option>
        </select>
        <label htmlFor="export-profile">Default export profile</label>
        <select id="export-profile" className="select" disabled={readOnly} value={profileId} onChange={(event) => setProfileId(event.target.value)}>
          <option value="">The profile already marked default</option>
          {api.exportProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" disabled={readOnly} checked={reminder} onChange={(event) => setReminder(event.target.checked)} />
          Remind Admins in the app, about once a month, to reconcile service owners
        </label>
        {readOnly ? null : (
          <button type="button" className="btn btn-primary" onClick={() => void saveDefaults()}>
            Save defaults
          </button>
        )}
        {notice ? <p className="hint">{notice}</p> : null}
      </div>
    </section>
  );
}

function MembersSection() {
  const api = useCatalog();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [notice, setNotice] = useState<string | null>(null);
  const admins = api.members.filter((member) => member.role === "tenant_admin" || member.role === "platform_owner");

  return (
    <section className="panel settings-block">
      <h2>Members</h2>
      <div className="stack">
        {api.members.map((member) => {
          const name = member.first_name && member.last_name ? ownerDisplayName(member.first_name, member.last_name) : member.email;
          const lastAdmin = admins.length < 2 && (member.role === "tenant_admin" || member.role === "platform_owner");
          return (
            <div className="member" key={member.id}>
              <span>
                <strong>{name}</strong>
                <div className="micro">{member.email}{member.deactivated_at ? " · Deactivated" : " · Active"}</div>
              </span>
              <span className="row-actions">
                <select
                  className="select"
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  onChange={(event) => {
                    const next = event.target.value as Role;
                    void setMemberRoleAction(member.tenant_id, member.user_id, next).then((result) => {
                      setNotice(result.ok ? "Role updated." : result.error);
                      if (result.ok) void api.refresh();
                    });
                  }}
                >
                  {ASSIGNABLE.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel(item)}
                    </option>
                  ))}
                  {api.canGrantOwner || member.role === "platform_owner" ? (
                    <option value="platform_owner">Platform owner</option>
                  ) : null}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={lastAdmin}
                  onClick={() => {
                    void removeMemberAction(member.tenant_id, member.user_id).then((result) => {
                      setNotice(result.ok ? "Removed from this workspace." : result.error);
                      if (result.ok) void api.refresh();
                    });
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
          );
        })}
        <p className="hint">Removing someone takes them out of this workspace only. It does not delete the account. The last Admin stays until another Admin is appointed.</p>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void api.addMember(email, role).then(
              (message) => {
                setEmail("");
                setNotice(message);
              },
              () => setNotice(null),
            );
          }}
        >
          <label htmlFor="invite-email">Invite by email</label>
          <input id="invite-email" className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="invite-role">Role</label>
          <select id="invite-role" className="select" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ASSIGNABLE.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)}
              </option>
            ))}
            {api.canGrantOwner ? <option value="platform_owner">Platform owner</option> : null}
          </select>
          <button type="submit" className="btn btn-primary">
            Send invite
          </button>
        </form>
        {notice ? <p className="hint">{notice}</p> : null}
      </div>
    </section>
  );
}

function InvitesSection() {
  const api = useCatalog();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="panel settings-block">
      <h2>Invites</h2>
      {api.invitations.length === 0 ? <p>No pending invites.</p> : null}
      <div className="stack">
        {api.invitations.map((invite) => (
          <div className="member" key={invite.id}>
            <span>
              {invite.email}
              <div className="micro">
                {roleLabel(invite.role)}
                {invite.expires_at ? ` · expires ${invite.expires_at.slice(0, 10)}` : ""}
              </div>
            </span>
            <span className="row-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  void resendInviteAction(invite.id).then((result) => {
                    setNotice(result.ok ? result.data.notice : result.error);
                    if (result.ok) void api.refresh();
                  });
                }}
              >
                Resend
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void cancelInviteAction(invite.id).then((result) => {
                    setNotice(result.ok ? "Invite cancelled." : result.error);
                    if (result.ok) void api.refresh();
                  });
                }}
              >
                Cancel
              </button>
            </span>
          </div>
        ))}
        {notice ? <p className="hint">{notice}</p> : null}
      </div>
    </section>
  );
}

function RolesSection() {
  return (
    <section className="panel settings-block">
      <h2>Roles</h2>
      <ul>
        <li>Platform owner — every workspace, including the Site Admin page.</li>
        <li>Admin — this workspace’s settings, members, fields, and lookups.</li>
        <li>Editor — create and edit services in this workspace.</li>
        <li>Service Manager — edit only services whose owner record is linked to their account.</li>
        <li>Viewer — read and export.</li>
      </ul>
    </section>
  );
}

function DangerSection() {
  return (
    <section className="panel settings-block danger-zone">
      <h2>Danger zone</h2>
      <p className="lede">Transfer ownership and deleting a workspace are not available in this version.</p>
      <div className="row-actions">
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
