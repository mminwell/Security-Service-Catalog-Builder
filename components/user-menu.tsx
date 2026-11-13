"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { headerLabel } from "@/lib/auth/profile";
import { roleLabel } from "@/lib/catalog/access";
import { placeAnchoredPanel } from "@/lib/catalog/popup-placement";
import { useCatalog } from "@/components/catalog-provider";
import { ProfileForm } from "@/components/profile-form";
import { useDismiss } from "@/components/widgets";

export function UserMenu() {
  const api = useCatalog();
  const session = api.session;
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useDismiss(open, () => setOpen(false), panelRef);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const placement = placeAnchoredPanel(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
        320,
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

  if (!session) return null;

  const label = headerLabel(session);
  const role = api.role ? roleLabel(api.role) : "";

  return (
    <div className="user-menu" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary user-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="account-menu"
        title={session.email}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="who">
          {label}
          {role ? ` · ${role}` : ""}
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id="account-menu"
              className="switcher-panel user-panel"
              ref={panelRef}
              role="dialog"
              aria-label="Profile"
              style={panelStyle}
            >
              <p className="micro">Profile</p>
              <p className="hint">{session.email}</p>
              <ProfileForm
                key={`${session.userId}:${session.firstName ?? ""}:${session.lastName ?? ""}:${session.company ?? ""}`}
                idPrefix="account"
                initial={{
                  firstName: session.firstName ?? "",
                  lastName: session.lastName ?? "",
                  company: session.company ?? "",
                }}
                submitLabel="Save profile"
                onSubmit={async (profile) => {
                  await api.saveProfile(profile);
                  setOpen(false);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
