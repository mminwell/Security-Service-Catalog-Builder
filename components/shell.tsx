"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { roleLabel } from "@/lib/catalog/access";
import type { Role, ServiceCodeMode } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { Loading, useDismiss } from "@/components/widgets";

export function AppShell({ children }: { children: ReactNode }) {
  const api = useCatalog();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (api.ready && !api.session) router.replace("/login");
  }, [api.ready, api.session, router]);

  if (!api.ready || !api.session) return <Loading />;

  if (!api.activeTenant) {
    return (
      <main className="main">
        <p className="micro">Workspace</p>
        <h1>No workspace yet</h1>
        <p className="lede">
          {api.warning ??
            "This account is signed in, but it is not a member of a workspace. A platform owner can add the account, or the first account on a new Supabase project becomes the platform owner automatically."}
        </p>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => void api.signOut()}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/catalog" className="brand">
          <strong>Security Service Catalog</strong>
          <span>Catalog builder</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link href="/catalog" aria-current={pathname.startsWith("/catalog") ? "page" : undefined}>
            Catalog
          </Link>
          {api.canAdmin ? (
            <>
              <Link href="/admin/lookups" aria-current={pathname.startsWith("/admin/lookups") ? "page" : undefined}>
                Lookups
              </Link>
              <Link href="/admin/fields" aria-current={pathname.startsWith("/admin/fields") ? "page" : undefined}>
                Fields
              </Link>
            </>
          ) : null}
        </nav>
        <div className="top-spacer" />
        {api.mode === "demo" ? <span className="demo-pill">Interactive Demo</span> : null}
        <WorkspaceSwitcher />
        <span className="who" title={api.session.email}>
          {api.session.email}
          {api.role ? ` · ${roleLabel(api.role)}` : ""}
        </span>
        {api.mode === "demo" ? (
          <button type="button" className="btn btn-ghost" onClick={api.resetDemoData}>
            Reset demo
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={() => void api.signOut()}>
          Sign out
        </button>
      </header>
      {api.mode === "demo" ? (
        <div className="banner">
          <strong>Interactive Demo Mode.</strong> Acme Corp and Meridian Health live in this browser. Connect Supabase
          when you want a real multi-user workspace. Nothing is sent to a server.
        </div>
      ) : null}
      {api.error ? (
        <div className="banner" role="alert">
          {api.error}{" "}
          <button type="button" className="btn btn-ghost" onClick={api.clearError}>
            Dismiss
          </button>
        </div>
      ) : null}
      <main id="content" className="main">
        {children}
      </main>
    </>
  );
}

function WorkspaceSwitcher() {
  const api = useCatalog();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const ref = useDismiss(open, () => setOpen(false));
  const tenant = api.activeTenant;
  if (!tenant) return null;

  return (
    <div className="switcher" ref={ref}>
      <button type="button" className="btn btn-secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {tenant.name}
      </button>
      {open ? (
        <div className="switcher-panel">
          <p className="micro">Workspaces</p>
          <div className="workspace-list">
            {api.tenants.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={item.id === tenant.id}
                onClick={() => {
                  api.switchTenant(item.id);
                  setOpen(false);
                }}
              >
                <strong>{item.name}</strong>
                <div className="micro">{item.slug}</div>
              </button>
            ))}
          </div>
          <p className="micro">Service IDs</p>
          <div className="segmented" role="radiogroup" aria-label="Service ID style" style={{ margin: "8px 0 12px" }}>
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
                onClick={() => void api.setServiceCodeMode(mode as ServiceCodeMode)}
                disabled={!api.canAdmin}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="micro">Members</p>
          {api.members.map((member) => (
            <div className="member" key={member.id}>
              <span>{member.email}</span>
              <span className="muted">{roleLabel(member.role)}</span>
            </div>
          ))}
          {api.canAdmin ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void api.addMember(email, role).then(() => setEmail(""));
              }}
            >
              <input
                className="input"
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="Member email"
              />
              <div className="row-actions">
                <select className="select" value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Role">
                  <option value="tenant_admin">Workspace admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  {api.canCreateWorkspace ? <option value="platform_owner">Platform owner</option> : null}
                </select>
                <button type="submit" className="btn btn-secondary">
                  Add member
                </button>
              </div>
            </form>
          ) : null}
          {api.mode === "demo" ? (
            <p className="hint">Demo invites stay in this browser. They cannot sign in on their own.</p>
          ) : null}
          {api.canCreateWorkspace ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void api.createTenant(name).then(() => {
                  setName("");
                  setOpen(false);
                });
              }}
            >
              <p className="micro">New workspace</p>
              <input
                className="input"
                value={name}
                placeholder="Client name"
                aria-label="New workspace name"
                onChange={(event) => setName(event.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={name.trim().length < 2}>
                Create workspace
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
