"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  archiveOwnerAction,
  importOwnersAction,
  reactivateOwnerAction,
  reconcileOwnersAction,
  saveOwnerAction,
} from "@/app/actions/workspace";
import { parseCsv } from "@/lib/catalog/lookup-csv";
import { ownerDisplayName, planOwnerImport, planOwnerReconciliation, servicesOwnedBy } from "@/lib/catalog/owner-names";
import type { ServiceOwner } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { OwnerSelect } from "@/components/owner-select";

export function OwnersAdmin() {
  const api = useCatalog();
  const [adding, setAdding] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!api.canAdmin) {
    return (
      <section className="empty">
        <h2>Service Owners are limited to workspace admins.</h2>
      </section>
    );
  }
  if (!api.ownersReady) {
    return (
      <section className="empty">
        <h2>The Service Owner directory is waiting for the database update.</h2>
        <p className="lede">Existing free-text owners are unchanged until that migration is applied.</p>
      </section>
    );
  }

  const owners = [...api.owners].sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  const selected = owners.find((owner) => owner.id === selectedId) ?? null;
  const reviews = api.services.filter((service) => service.owner_review);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Admin</p>
          <h1>Service Owners</h1>
          <p className="lede">
            People who can be named on a service. The list is sorted by last name. The display name is always Last, First.
            Remove archives a person. It does not delete the record.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Add owner
        </button>
      </div>
      {notice ? <p className="hint">{notice}</p> : null}
      <div className="panel table-wrap">
        <table className="catalog">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Title</th>
              <th>Team</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {owners.map((owner) => (
              <tr key={owner.id}>
                <td>
                  <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(owner.id)}>
                    {ownerDisplayName(owner.first_name, owner.last_name)}
                  </button>
                </td>
                <td>{owner.email ?? "—"}</td>
                <td>{owner.title ?? "—"}</td>
                <td>{owner.team_code ?? "—"}</td>
                <td>
                  {!owner.is_active ? "Archived" : owner.deactivated_user ? "Account deactivated" : "Active"}
                </td>
                <td>
                  {owner.is_active ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setArchiveId(owner.id)}>
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        void reactivateOwnerAction(owner.id).then((result) => {
                          setNotice(result.ok ? "Owner reactivated." : result.error);
                          if (result.ok) void api.refresh();
                        });
                      }}
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reviews.length > 0 ? (
        <section className="panel settings-block">
          <h2>Needs review</h2>
          <p className="lede">These service values could not be split into a first and last name. The original text is unchanged.</p>
          <ul>
            {reviews.map((service) => (
              <li key={service.id}>
                <Link href={`/services/${service.id}`}>{service.service_code}</Link> — {service.owner_review}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ImportPanel onNotice={setNotice} />
      <ReconcilePanel onNotice={setNotice} />
      {selected ? <OwnerHistory owner={selected} onClose={() => setSelectedId(null)} /> : null}
      {adding ? <AddOwnerDialog onClose={() => setAdding(false)} onNotice={setNotice} /> : null}
      {archiveId ? <ArchiveDialog ownerId={archiveId} onClose={() => setArchiveId(null)} onNotice={setNotice} /> : null}
    </>
  );
}

function AddOwnerDialog({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const api = useCatalog();
  const tenant = api.activeTenant;
  const [mode, setMode] = useState<"member" | "manual">("member");
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("");
  const members = api.members.filter((member) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return member.email.toLowerCase().includes(needle) || `${member.first_name ?? ""} ${member.last_name ?? ""}`.toLowerCase().includes(needle);
  });
  const teams = api.lookups.filter((option) => option.field_key === "team" && option.is_active);

  async function save() {
    if (!tenant) return;
    const result = await saveOwnerAction({
      tenantId: tenant.id,
      firstName,
      lastName,
      email,
      title,
      teamCode: team,
      userId,
    });
    onNotice(result.ok ? "Owner saved." : result.error);
    if (result.ok) {
      await api.refresh();
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-owner-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="add-owner-title">Add owner</h2>
        <div className="segmented" role="radiogroup" aria-label="How to add an owner">
          <button type="button" role="radio" aria-checked={mode === "member"} onClick={() => setMode("member")}>
            Workspace member
          </button>
          <button type="button" role="radio" aria-checked={mode === "manual"} onClick={() => setMode("manual")}>
            Add manually
          </button>
        </div>
        {mode === "member" ? (
          <div className="stack">
            <label htmlFor="member-search">Workspace members</label>
            <input id="member-search" className="input" placeholder="Search members" value={query} onChange={(event) => setQuery(event.target.value)} />
            <ul className="owner-menu static">
              {members.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setUserId(member.user_id);
                      setFirstName(member.first_name ?? "");
                      setLastName(member.last_name ?? "");
                      setEmail(member.email);
                    }}
                  >
                    <strong>{member.first_name && member.last_name ? ownerDisplayName(member.first_name, member.last_name) : member.email}</strong>
                    <span className="micro">{member.email}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!firstName || !lastName ? <p className="hint">If this member has no name yet, type the first and last name before saving.</p> : null}
          </div>
        ) : (
          <p className="hint">Use this for someone who does not have an account. No user link is stored.</p>
        )}
        <div className="stack">
          <label htmlFor="owner-first">First name</label>
          <input id="owner-first" className="input" required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          <label htmlFor="owner-last">Last name</label>
          <input id="owner-last" className="input" required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          <label htmlFor="owner-email">Email</label>
          <input id="owner-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="owner-title">Title</label>
          <input id="owner-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          <label htmlFor="owner-team">Team</label>
          <select id="owner-team" className="select" value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="">No team</option>
            {teams.map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => void save()}>
              Save owner
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchiveDialog({
  ownerId,
  onClose,
  onNotice,
}: {
  ownerId: string;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const api = useCatalog();
  const owner = api.owners.find((item) => item.id === ownerId);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  if (!owner) return null;
  const count = servicesOwnedBy(
    api.services.map((service) => ({ id: service.id, ownerId: service.owner_id ?? null })),
    owner.id,
  ).length;
  const choices = api.owners.filter((item) => item.id !== owner.id && item.is_active && !item.deactivated_user);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="archive-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="archive-title">Archive {ownerDisplayName(owner.first_name, owner.last_name)}</h2>
        <p className="lede">
          This person currently owns {count} {count === 1 ? "service" : "services"}. The record stays in the directory.
        </p>
        <label htmlFor="replacement-owner">Replacement owner?</label>
        <OwnerSelect
          id="replacement-owner"
          owners={choices}
          value={none ? null : replacement}
          onChange={(id) => {
            setNone(false);
            setReplacement(id);
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={none}
            onChange={(event) => {
              setNone(event.target.checked);
              if (event.target.checked) setReplacement(null);
            }}
          />
          None — flag for review
        </label>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void archiveOwnerAction(owner.id, none ? null : replacement).then((result) => {
                onNotice(result.ok ? `Archived. ${result.data.services} services updated.` : result.error);
                if (result.ok) void api.refresh();
                if (result.ok) onClose();
              });
            }}
          >
            Archive owner
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const api = useCatalog();
  const [rows, setRows] = useState<ReturnType<typeof planOwnerImport>["rows"]>([]);
  const [error, setError] = useState<string | null>(null);
  const teams = api.lookups
    .filter((option) => option.field_key === "team" && option.is_active)
    .map((option) => ({ code: option.code, label: option.label }));

  return (
    <section className="panel settings-block">
      <h2>Import</h2>
      <p className="lede">CSV with First Name and Last Name, or a single full-name column. Rows that cannot be split are listed and are not saved.</p>
      <input
        className="input"
        type="file"
        accept=".csv,text/csv"
        aria-label="Owner CSV"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => {
            const plan = planOwnerImport(parseCsv(text), teams);
            setError(plan.error);
            setRows(plan.rows);
          });
        }}
      />
      {error ? <p className="field-error">{error}</p> : null}
      {rows.some((row) => row.status === "review") ? (
        <ul>
          {rows
            .filter((row) => row.status === "review")
            .map((row) => (
              <li key={row.line}>
                Line {row.line}: {row.sourceName || "(blank)"} — {row.reason}
              </li>
            ))}
        </ul>
      ) : null}
      {rows.some((row) => row.status === "ready") ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (!api.activeTenant) return;
            void importOwnersAction(api.activeTenant.id, rows).then((result) => {
              onNotice(result.ok ? `Imported ${result.data.created} owners.` : result.error);
              if (result.ok) void api.refresh();
            });
          }}
        >
          Import ready rows
        </button>
      ) : null}
    </section>
  );
}

function ReconcilePanel({ onNotice }: { onNotice: (message: string) => void }) {
  const api = useCatalog();
  const [mode, setMode] = useState<"active" | "termination">("active");
  const [plan, setPlan] = useState<ReturnType<typeof planOwnerReconciliation> | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [none, setNone] = useState(true);

  const owners = useMemo(
    () =>
      api.owners.map((owner) => ({
        id: owner.id,
        firstName: owner.first_name,
        lastName: owner.last_name,
        email: owner.email,
        isActive: owner.is_active,
      })),
    [api.owners],
  );

  return (
    <section className="panel settings-block">
      <h2>Reconcile owners</h2>
      <p className="lede">
        Upload an HR active-staff list or a termination list. Matching uses email first, then name. Ambiguous names are not archived.
      </p>
      <div className="segmented" role="radiogroup" aria-label="Staff file kind">
        <button type="button" role="radio" aria-checked={mode === "active"} onClick={() => setMode("active")}>
          Active staff
        </button>
        <button type="button" role="radio" aria-checked={mode === "termination"} onClick={() => setMode("termination")}>
          Termination list
        </button>
      </div>
      <input
        className="input"
        type="file"
        accept=".csv,text/csv"
        aria-label="HR CSV"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => {
            const matrix = parseCsv(text);
            const headers = matrix[0]?.map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_")) ?? [];
            const emailCol = headers.findIndex((header) => header === "email" || header === "e-mail");
            const nameCol = headers.findIndex((header) => ["name", "full_name", "fullname"].includes(header));
            const firstCol = headers.findIndex((header) => header === "first_name" || header === "first");
            const lastCol = headers.findIndex((header) => header === "last_name" || header === "last");
            const fileRows = matrix.slice(1).map((cells, index) => ({
              line: index + 2,
              email: emailCol >= 0 ? cells[emailCol] ?? null : null,
              name:
                firstCol >= 0 && lastCol >= 0
                  ? `${cells[lastCol] ?? ""}, ${cells[firstCol] ?? ""}`.trim()
                  : nameCol >= 0
                    ? cells[nameCol] ?? null
                    : null,
            }));
            setPlan(planOwnerReconciliation(mode, owners, fileRows));
          });
        }}
      />
      {plan ? (
        <div className="stack">
          <p>
            {plan.archive.length} owners would be archived. {plan.ambiguous.length} ambiguous. {plan.fileReview.length} file rows need review.
          </p>
          <ul>
            {plan.archive.map((item) => (
              <li key={item.ownerId}>{item.displayName}</li>
            ))}
          </ul>
          {plan.ambiguous.map((item) => (
            <p key={item.label} className="hint">
              {item.label}: {item.reason}
            </p>
          ))}
          {plan.fileReview.map((item) => (
            <p key={item.line} className="hint">
              Line {item.line}: {item.reason}
            </p>
          ))}
          <OwnerSelect
            id="reconcile-replacement"
            owners={api.owners.filter((owner) => owner.is_active)}
            value={none ? null : replacement}
            onChange={(id) => {
              setNone(false);
              setReplacement(id);
            }}
          />
          <label className="check">
            <input type="checkbox" checked={none} onChange={(event) => setNone(event.target.checked)} />
            None — flag for review
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={plan.archive.length === 0 || !api.activeTenant}
            onClick={() => {
              if (!api.activeTenant) return;
              void reconcileOwnersAction(
                api.activeTenant.id,
                plan.archive.map((item) => item.ownerId),
                none ? null : replacement,
              ).then((result) => {
                onNotice(result.ok ? `Reconciled. ${result.data.services} services updated.` : result.error);
                if (result.ok) void api.refresh();
              });
            }}
          >
            Archive listed owners
          </button>
        </div>
      ) : null}
    </section>
  );
}

function OwnerHistory({ owner, onClose }: { owner: ServiceOwner; onClose: () => void }) {
  const api = useCatalog();
  const entries = api.ownerHistory.filter(
    (entry) => entry.old_owner_id === owner.id || entry.new_owner_id === owner.id,
  );
  return (
    <section className="panel settings-block">
      <div className="row-actions">
        <h2>History for {ownerDisplayName(owner.first_name, owner.last_name)}</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {entries.length === 0 ? <p>No owner changes yet.</p> : null}
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.created_at.slice(0, 16).replace("T", " ")} · {entry.reason} · {ownerName(api.owners, entry.old_owner_id)} →{" "}
            {ownerName(api.owners, entry.new_owner_id)}
            {entry.note ? ` · ${entry.note}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ownerName(owners: ServiceOwner[], id: string | null): string {
  if (!id) return "None";
  const owner = owners.find((item) => item.id === id);
  return owner ? ownerDisplayName(owner.first_name, owner.last_name) : "Unknown owner";
}
