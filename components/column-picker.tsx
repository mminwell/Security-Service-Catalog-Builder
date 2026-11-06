"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useAnchoredPanel } from "@/components/anchored-panel";
import {
  COMPLETENESS_KEY,
  DEFAULT_COLUMN_KEYS,
  columnLabel,
  isPinnedColumn,
  moveColumn,
  resolveColumnKeys,
  toggleColumn,
} from "@/lib/catalog/columns";
import { localColumnKeys, setLocalColumnKeys, subscribeColumns } from "@/lib/catalog/column-prefs";
import type { FieldDefinition } from "@/lib/catalog/types";
import { useDismiss } from "@/components/widgets";

export function useCatalogColumns(tenantId: string | null, workspaceKeys: string[] | null, fields: FieldDefinition[]) {
  const local = useSyncExternalStore(
    subscribeColumns,
    () => localColumnKeys(tenantId),
    () => null,
  );
  const active = new Set(fields.filter((field) => field.is_active).map((field) => field.field_key));
  const stored = local ?? workspaceKeys;
  const keys = resolveColumnKeys(stored, active);
  function update(next: string[]) {
    if (!tenantId) return;
    const resolved = resolveColumnKeys(next, active);
    setLocalColumnKeys(tenantId, resolved);
  }
  return { keys, update, active };
}

export function ColumnPicker({
  fields,
  keys,
  canAdmin,
  onChange,
  onSaveDefault,
}: {
  fields: FieldDefinition[];
  keys: string[];
  canAdmin: boolean;
  onChange: (keys: string[]) => void;
  onSaveDefault: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useDismiss(open, () => setOpen(false));
  const setAnchor = useCallback(
    (node: HTMLDivElement | null) => {
      anchorRef.current = node;
      dismissRef(node);
    },
    [dismissRef],
  );
  const panelStyle = useAnchoredPanel(open, anchorRef, 460);
  const activeFields = fields
    .filter((field) => field.is_active && !isPinnedColumn(field.field_key))
    .sort((a, b) => a.depth_level - b.depth_level || a.sort_order - b.sort_order);
  const movable = keys.filter((key) => !isPinnedColumn(key));

  return (
    <div className="filter-anchor" ref={setAnchor} data-control="columns">
      <button type="button" className="btn btn-secondary" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        Columns
      </button>
      {open ? (
        <div className="filter-panel column-panel" role="dialog" aria-label="Choose catalog columns" style={panelStyle}>
          <p className="micro">Columns</p>
          <p className="hint">Code and Service stay pinned. Other columns follow the order below. Retired fields drop out of the table.</p>
          <ul className="column-list">
            <li>
              <label className="check">
                <input type="checkbox" checked disabled /> Code
              </label>
            </li>
            <li>
              <label className="check">
                <input type="checkbox" checked disabled /> Service
              </label>
            </li>
            {activeFields.map((field) => {
              const checked = keys.includes(field.field_key);
              return (
                <li key={field.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onChange(toggleColumn(keys, field.field_key, event.target.checked))}
                    />
                    {field.label}
                  </label>
                </li>
              );
            })}
            <li>
              <label className="check">
                <input
                  type="checkbox"
                  checked={keys.includes(COMPLETENESS_KEY)}
                  onChange={(event) => onChange(toggleColumn(keys, COMPLETENESS_KEY, event.target.checked))}
                />
                Completeness
              </label>
            </li>
          </ul>
          <p className="micro">Order</p>
          <ul className="column-order">
            {movable.map((key) => (
              <li key={key}>
                <span>{columnLabel(key, fields)}</span>
                <span className="row-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => onChange(moveColumn(keys, key, "up"))}>
                    Move up
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onChange(moveColumn(keys, key, "down"))}>
                    Move down
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={() => onChange([...DEFAULT_COLUMN_KEYS])}>
              Reset to default
            </button>
            {canAdmin ? (
              <button type="button" className="btn btn-primary" onClick={() => onSaveDefault(keys)}>
                Save workspace default
              </button>
            ) : (
              <span className="hint">Saved in this browser.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
