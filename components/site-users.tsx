"use client";

import { useEffect, useState } from "react";
import {
  deleteAccountAction,
  listSiteAccountsAction,
  reassignDeactivatedOwnersAction,
  setAccountActiveAction,
} from "@/app/actions/workspace";
import { roleLabel } from "@/lib/catalog/access";
import { ownerDisplayName } from "@/lib/catalog/owner-names";
import type { Role, SiteAccount } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { OwnerSelect } from "@/components/owner-select";

export function SiteUsers({ previewAccounts }: { previewAccounts?: SiteAccount[] }) {
  const api = useCatalog();
  const [accounts, setAccounts] = useState<SiteAccount[] | null>(previewAccounts ?? null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<string[] | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [none, setNone] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const result = await listSiteAccountsAction();
    if (!result.ok) {
      setError(result.error);
      setAccounts([]);
      return;
    }
    setAccounts(result.data as SiteAccount[]);
  }

  useEffect(() => {
    if (previewAccounts) return;
    let cancelled = false;
    void listSiteAccountsAction().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setAccounts([]);
        return;
      }
      setAccounts(result.data as SiteAccount[]);
    });
    return () => {
      cancelled = true;
    };
  }, [previewAccounts]);

  if (api.role !== "platform_owner") {
    return (
      <section className="empty">
        <h2>Site Admin is limited to platform owners.</h2>
      </section>
    );
  }

  const filtered = (accounts ?? []).filter((account) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      account.email.toLowerCase().includes(needle) ||
      `${account.first_name ?? ""} ${account.last_name ?? ""}`.toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Site Admin</p>
          <h1>Accounts</h1>
          <p className="lede">
            Deactivate is the default and can be reversed. Permanent deletion asks you to type the email. A workspace
            Admin cannot open this page.
          </p>
        </div>
      </div>
      <section className="panel settings-block">
        <h2>Workspaces</h2>
        <p className="hint">A simple list of workspace names. A fuller overview still needs requirements.</p>
        <ul>
          {api.tenants.map((tenant) => (
            <li key={tenant.id}>{tenant.name}</li>
          ))}
        </ul>
      </section>
      <label htmlFor="account-search">Search accounts</label>
      <input id="account-search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} />
      {error ? <p className="field-error">{error}</p> : null}
      {notice ? <p className="hint">{notice}</p> : null}
      <div className="panel table-wrap">
        <table className="catalog">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Workspaces</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((account) => (
              <tr key={account.user_id}>
                <td>
                  {account.first_name && account.last_name
                    ? ownerDisplayName(account.first_name, account.last_name)
                    : "—"}
                </td>
                <td>{account.email}</td>
                <td>
                  {account.memberships.map((membership) => `${membership.name} (${roleLabel(membership.role as Role)})`).join(", ") || "—"}
                </td>
                <td>{account.deactivated_at ? "Deactivated" : "Active"}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      void setAccountActiveAction(account.user_id, Boolean(account.deactivated_at)).then(async (result) => {
                        if (!result.ok) {
                          setNotice(result.error);
                          return;
                        }
                        const linked = api.owners.filter((owner) => owner.user_id === account.user_id).map((owner) => owner.id);
                        if (!account.deactivated_at && result.data.services > 0 && linked.length > 0) {
                          setReplacementFor(linked);
                          setNotice(`Deactivated. ${result.data.services} services still name this person.`);
                        } else {
                          setNotice(account.deactivated_at ? "Account reactivated." : "Account deactivated.");
                        }
                        await load();
                        await api.refresh();
                      });
                    }}
                  >
                    {account.deactivated_at ? "Reactivate" : "Deactivate"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(account.user_id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pendingDelete ? (
        <section className="panel settings-block danger-zone">
          <h2>Delete account</h2>
          <p className="lede">Type the email address to permanently delete this account.</p>
          <input className="input" aria-label="Type the email to confirm" value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} />
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void deleteAccountAction(pendingDelete, confirmEmail).then(async (result) => {
                  setNotice(result.ok ? "Account deleted." : result.error);
                  if (result.ok) {
                    setPendingDelete(null);
                    setConfirmEmail("");
                    await load();
                    await api.refresh();
                  }
                });
              }}
            >
              Delete account
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      {replacementFor ? (
        <section className="panel settings-block">
          <h2>Replacement owner?</h2>
          <p className="lede">The linked owner records are flagged. Choose a replacement for the services they own, or flag those services Owner needed.</p>
          <OwnerSelect
            id="site-replacement"
            owners={api.owners.filter((owner) => owner.is_active && !replacementFor.includes(owner.id))}
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
            className="btn btn-primary"
            onClick={() => {
              void reassignDeactivatedOwnersAction(replacementFor, none ? null : replacement).then(async (result) => {
                setNotice(result.ok ? "Services updated." : result.error);
                if (result.ok) {
                  setReplacementFor(null);
                  await api.refresh();
                }
              });
            }}
          >
            Apply
          </button>
        </section>
      ) : null}
    </>
  );
}
