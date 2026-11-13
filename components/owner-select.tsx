"use client";

import { useMemo, useState } from "react";
import { ownerDisplayName } from "@/lib/catalog/owner-names";
import type { ServiceOwner } from "@/lib/catalog/types";

export function OwnerSelect({
  id,
  owners,
  value,
  disabled,
  onChange,
}: {
  id: string;
  owners: ServiceOwner[];
  value: string | null;
  disabled?: boolean;
  onChange: (ownerId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = owners.find((owner) => owner.id === value) ?? null;
  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return owners
      .filter((owner) => owner.is_active && !owner.deactivated_user)
      .filter((owner) => {
        if (!needle) return true;
        const display = ownerDisplayName(owner.first_name, owner.last_name).toLowerCase();
        return display.includes(needle) || (owner.title ?? "").toLowerCase().includes(needle) || (owner.email ?? "").toLowerCase().includes(needle);
      })
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  }, [owners, query]);

  return (
    <div className="owner-select">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder="Search active owners"
        value={open ? query : selected ? ownerDisplayName(selected.first_name, selected.last_name) : ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {selected && !selected.is_active ? <p className="hint">Current owner is archived. Pick an active owner to replace them.</p> : null}
      {selected?.deactivated_user ? <p className="hint">This owner’s account is deactivated.</p> : null}
      {open && !disabled ? (
        <ul className="owner-menu" role="listbox" id={`${id}-options`}>
          <li>
            <button type="button" onMouseDown={() => onChange(null)}>
              No owner
            </button>
          </li>
          {choices.map((owner) => (
            <li key={owner.id}>
              <button type="button" onMouseDown={() => onChange(owner.id)}>
                <strong>{ownerDisplayName(owner.first_name, owner.last_name)}</strong>
                <span className="micro">{[owner.title, owner.team_code, owner.email].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {choices.length === 0 ? <li className="micro">No active owners match.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
