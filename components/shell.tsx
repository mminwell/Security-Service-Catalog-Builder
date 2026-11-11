"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { roleLabel } from "@/lib/catalog/access";
import { placeAnchoredPanel } from "@/lib/catalog/popup-placement";
import { cartIdsFor, subscribeCart } from "@/lib/catalog/cart-store";
import { MAX_LOGO_FILE_BYTES } from "@/lib/catalog/logos";
import { primaryNavCurrent, primaryNavFor } from "@/lib/catalog/primary-nav";
import { TEMPLATES_LABEL } from "@/lib/catalog/shop-label";
import type { Role, ServiceCodeMode } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { CartIcon } from "@/components/icons";
import { Loading, useDismiss } from "@/components/widgets";
import { WorkspaceMark } from "@/components/workspace-mark";

export function AppShell({ children }: { children: ReactNode }) {
  const api = useCatalog();
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useSyncExternalStore(
    subscribeCart,
    () => cartIdsFor(api.activeTenant?.id ?? null).length,
    () => 0,
  );

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
            "This account is signed in, but it is not a member of a workspace. An Admin can invite the account. The first account on a new project becomes Admin of Starter Workspace."}
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
        <div className="topbar-main">
          <Link href="/catalog" className="brand">
            <strong>Security Service Catalog</strong>
            <span>Catalog builder</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            {primaryNavFor(api.canAdmin).map((item) =>
              item.cart ? (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={TEMPLATES_LABEL}
                  aria-current={primaryNavCurrent(pathname, item.href) ? "page" : undefined}
                >
                  <CartIcon />
                  {TEMPLATES_LABEL}
                  {cartCount > 0 ? <span className="cart-badge">{cartCount}</span> : null}
                </Link>
              ) : (
                <Link key={item.href} href={item.href} aria-current={primaryNavCurrent(pathname, item.href) ? "page" : undefined}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="top-spacer" />
          <WorkspaceSwitcher />
          <span className="who" title={api.session.email}>
            {api.session.email}
            {api.role ? ` · ${roleLabel(api.role)}` : ""}
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => void api.signOut()}>
            Sign out
          </button>
        </div>
      </header>
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
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useDismiss(open, () => setOpen(false), panelRef);
  const tenant = api.activeTenant;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const placement = placeAnchoredPanel(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
        380,
        "end",
      );
      setPanelStyle({
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  if (!tenant) return null;

  return (
    <div className="switcher" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary switcher-trigger"
        aria-expanded={open}
        aria-controls="workspace-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <WorkspaceMark name={tenant.name} logoUrl={tenant.logo_url} size={18} />
        <span className="switcher-name">{tenant.name}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
        <div
          id="workspace-menu"
          className="switcher-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Workspace"
          style={panelStyle}
        >
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
                <WorkspaceMark name={item.name} logoUrl={item.logo_url} size={22} />
                <span>
                  <strong>{item.name}</strong>
                  <div className="micro">{item.slug}</div>
                </span>
              </button>
            ))}
          </div>
          <div className="logo-setting">
            <p className="micro">Company logo</p>
            <div className="row-actions">
              <WorkspaceMark name={tenant.name} logoUrl={tenant.logo_url} size={36} />
              {api.canAdmin ? (
                <>
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
                  {tenant.logo_url ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        void api.setTenantLogo(null).then(
                          () => setLogoError(null),
                          (err: unknown) => setLogoError(err instanceof Error ? err.message : "Could not update the logo."),
                        );
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
            {api.canAdmin ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void api.setTenantLogo(logoUrl).then(
                    () => {
                      setLogoUrl("");
                      setLogoError(null);
                    },
                    (err: unknown) => setLogoError(err instanceof Error ? err.message : "Could not update the logo."),
                  );
                }}
              >
                <input
                  className="input"
                  value={logoUrl}
                  placeholder="https://example.com/logo.png"
                  aria-label="Logo image URL"
                  onChange={(event) => setLogoUrl(event.target.value)}
                />
                <button type="submit" className="btn btn-secondary" disabled={logoUrl.trim().length === 0}>
                  Use URL
                </button>
              </form>
            ) : null}
            {logoError ? <p className="field-error">{logoError}</p> : null}
            {api.canAdmin ? <p className="hint">PNG, JPEG, GIF, WebP, or SVG under 80 KB, or an image URL.</p> : null}
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
          {api.invitations.map((invite) => (
            <div className="member" key={invite.id}>
              <span>{invite.email}</span>
              <span className="muted">{roleLabel(invite.role)} · Pending</span>
            </div>
          ))}
          {api.canAdmin ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                setInviteNotice(null);
                void api.addMember(email, role).then(
                  (message) => {
                    setEmail("");
                    setInviteNotice(message);
                  },
                  () => setInviteNotice(null),
                );
              }}
            >
              <input
                className="input"
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="Member email"
                required
              />
              <div className="row-actions">
                <select className="select" value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Role">
                  <option value="tenant_admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  {api.canGrantOwner ? <option value="platform_owner">Platform owner</option> : null}
                </select>
                <button type="submit" className="btn btn-secondary">
                  Invite
                </button>
              </div>
              {inviteNotice ? <p className="hint">{inviteNotice}</p> : null}
            </form>
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
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
