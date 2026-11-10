"use client";

import { useCallback, useRef } from "react";
import { useAnchoredPanel } from "@/components/anchored-panel";
import {
  activeFilterCount,
  clearFilterRules,
  closeFilterPopup,
  commitDraftRule,
  defaultOperator,
  describeRule,
  openFilterPopup,
  operatorsFor,
  removeFilterRule,
  valueKind,
  type FilterComposer,
} from "@/lib/catalog/filter";
import { activeOptions } from "@/lib/catalog/lookups";
import { type CatalogFilters, type FieldDefinition, type FilterOp, type LookupOption } from "@/lib/catalog/types";
import { useDismiss } from "@/components/widgets";

export function FilterControl({
  filters,
  fields,
  lookups,
  composer,
  onChange,
  onComposer,
  showArchive = true,
}: {
  filters: CatalogFilters;
  fields: FieldDefinition[];
  lookups: LookupOption[];
  composer: FilterComposer;
  onChange: (filters: CatalogFilters) => void;
  onComposer: (composer: FilterComposer) => void;
  /** Services use Active / Archived. Other lists leave this off. */
  showArchive?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useDismiss(composer.popupOpen, () => onComposer(closeFilterPopup(composer)));
  const setAnchor = useCallback(
    (node: HTMLDivElement | null) => {
      anchorRef.current = node;
      dismissRef(node);
    },
    [dismissRef],
  );
  const panelStyle = useAnchoredPanel(composer.popupOpen, anchorRef);
  const count = activeFilterCount(filters);
  const activeFields = fields
    .filter((field) => field.is_active)
    .sort((a, b) => a.depth_level - b.depth_level || a.sort_order - b.sort_order);
  const selected = activeFields.find((field) => field.field_key === composer.draftField) ?? null;
  const canAdd = Boolean(selected) && composer.draftValue.trim().length > 0;

  function chooseField(fieldKey: string) {
    const field = activeFields.find((item) => item.field_key === fieldKey);
    onComposer({
      ...composer,
      draftField: fieldKey,
      draftOp: field ? defaultOperator(field) : "eq",
      draftValue: "",
    });
  }

  function addRule() {
    const committed = commitDraftRule(filters, composer, crypto.randomUUID());
    if (!committed) return;
    onChange(committed.filters);
    onComposer(committed.composer);
  }

  return (
    <div className="filter-anchor" ref={setAnchor} data-control="filter">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={composer.popupOpen}
        aria-haspopup="dialog"
        onClick={() => onComposer(composer.popupOpen ? closeFilterPopup(composer) : openFilterPopup(composer))}
      >
        Filter{count > 0 ? ` · ${count}` : ""}
      </button>
      {composer.popupOpen ? (
        <div className="filter-panel" role="dialog" aria-label={showArchive ? "Filter services" : "Filter artifacts"} style={panelStyle}>
          <p className="micro">{showArchive ? "Catalog" : "Artifacts"}</p>
          {showArchive ? (
            <>
              <div className="segmented" role="radiogroup" aria-label="Service archive state">
                <button
                  type="button"
                  role="radio"
                  aria-checked={filters.scope === "active"}
                  onClick={() => onChange({ ...filters, scope: "active" })}
                >
                  Active
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={filters.scope === "archived"}
                  onClick={() => onChange({ ...filters, scope: "archived" })}
                >
                  Archived
                </button>
              </div>
              <p className="hint">Archived services stay in the workspace and can be restored.</p>
            </>
          ) : null}
          {filters.rules.length > 0 ? (
            <div className="filter-rules">
              {filters.rules.map((rule) => {
                const label = describeRule(rule, fields.find((field) => field.field_key === rule.fieldKey), lookups);
                return (
                  <div className="filter-rule" key={rule.id}>
                    <span>{label}</span>
                    <button type="button" className="btn btn-ghost" onClick={() => onChange(removeFilterRule(filters, rule.id))}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
          {composer.composing ? (
            <div className="filter-compose">
              <label htmlFor="filter-field">Field</label>
              <select id="filter-field" className="select" value={composer.draftField} onChange={(event) => chooseField(event.target.value)}>
                <option value="">Choose a field</option>
                {activeFields.map((field) => (
                  <option key={field.id} value={field.field_key}>
                    {field.label}
                  </option>
                ))}
              </select>
              {selected ? (
                <RuleValue
                  field={selected}
                  lookups={lookups}
                  op={composer.draftOp}
                  value={composer.draftValue}
                  onOp={(op) => onComposer({ ...composer, draftOp: op })}
                  onValue={(value) => onComposer({ ...composer, draftValue: value })}
                />
              ) : null}
              <button type="button" className="btn btn-primary" disabled={!canAdd} onClick={addRule}>
                Add
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FilterChipRow({
  filters,
  fields,
  lookups,
  onChange,
  onComposer,
  onAddAdditional,
}: {
  filters: CatalogFilters;
  fields: FieldDefinition[];
  lookups: LookupOption[];
  onChange: (filters: CatalogFilters) => void;
  onComposer: (composer: FilterComposer) => void;
  onAddAdditional: () => void;
}) {
  const chips = [
    ...(filters.scope === "archived"
      ? [{ id: "scope", label: "Archived", remove: () => onChange({ ...filters, scope: "active" }) }]
      : []),
    ...filters.rules.map((rule) => ({
      id: rule.id,
      label: describeRule(rule, fields.find((field) => field.field_key === rule.fieldKey), lookups),
      remove: () => onChange(removeFilterRule(filters, rule.id)),
    })),
  ];
  if (chips.length === 0) return null;
  return (
    <div className="chips" aria-label="Active filters">
      {chips.map((chip) => (
        <span className="chip" key={chip.id}>
          {chip.label}
          <button type="button" aria-label={`Remove ${chip.label}`} onClick={chip.remove}>
            ×
          </button>
        </span>
      ))}
      <div className="chip-actions">
        <button type="button" className="btn btn-ghost" onClick={onAddAdditional}>
          + Add additional filter
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const cleared = clearFilterRules(filters);
            onChange(cleared.filters);
            onComposer(cleared.composer);
          }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

function RuleValue({
  field,
  lookups,
  op,
  value,
  onOp,
  onValue,
}: {
  field: FieldDefinition;
  lookups: LookupOption[];
  op: FilterOp;
  value: string;
  onOp: (op: FilterOp) => void;
  onValue: (value: string) => void;
}) {
  const kind = valueKind(field);
  const operators = operatorsFor(field);
  const options = field.lookup_field_key ? activeOptions(lookups, field.lookup_field_key) : [];
  return (
    <>
      {operators.length > 1 ? (
        <select className="select" aria-label="Comparison" value={op} onChange={(event) => onOp(event.target.value as FilterOp)}>
          {operators.map((item) => (
            <option key={item.op} value={item.op}>
              {item.label}
            </option>
          ))}
        </select>
      ) : (
        <p className="micro">{operators[0]?.label}</p>
      )}
      {kind === "lookup" || kind === "multi" ? (
        options.length === 0 ? (
          <p className="hint">No active options for this field.</p>
        ) : (
          <select className="select" aria-label={`${field.label} value`} value={value} onChange={(event) => onValue(event.target.value)}>
            <option value="">Choose a value</option>
            {options.map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        )
      ) : null}
      {kind === "boolean" ? (
        <select className="select" aria-label={`${field.label} value`} value={value} onChange={(event) => onValue(event.target.value)}>
          <option value="">Choose a value</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : null}
      {kind === "date" ? (
        <input className="input" type="date" aria-label={`${field.label} value`} value={value} onChange={(event) => onValue(event.target.value)} />
      ) : null}
      {kind === "number" ? (
        <input
          className="input"
          type="number"
          aria-label={`${field.label} value`}
          value={value}
          onChange={(event) => onValue(event.target.value)}
        />
      ) : null}
      {kind === "text" ? (
        <input
          className="input"
          aria-label={`${field.label} contains`}
          placeholder="Contains…"
          value={value}
          onChange={(event) => onValue(event.target.value)}
        />
      ) : null}
    </>
  );
}

export { ExportDialog } from "@/components/export-dialog";
