"use client";

import { useState } from "react";
import { downloadName, distributionMarking, servicesToCsv, type CsvVisibility } from "@/lib/catalog/csv";
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
}: {
  filters: CatalogFilters;
  fields: FieldDefinition[];
  lookups: LookupOption[];
  composer: FilterComposer;
  onChange: (filters: CatalogFilters) => void;
  onComposer: (composer: FilterComposer) => void;
}) {
  const ref = useDismiss(composer.popupOpen, () => onComposer(closeFilterPopup(composer)));
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
    <div className="filter-anchor" ref={ref}>
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
        <div className="filter-panel" role="dialog" aria-label="Filter services">
          <p className="micro">Catalog</p>
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

export function ExportDialog({
  services,
  fields,
  lookups,
  companyName,
  slug,
  onClose,
}: {
  services: import("@/lib/catalog/types").ServiceRecord[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
  companyName: string;
  slug: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CsvVisibility>("public");
  const [includeMarking, setIncludeMarking] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const marking = distributionMarking(companyName, kind);

  function download() {
    const csv = servicesToCsv(services, fields, lookups, kind, {
      marking: includeMarking ? marking : null,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadName(slug, kind);
    anchor.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  function requestDownload() {
    if (services.length === 0) return;
    if (kind === "all") {
      setConfirming(true);
      return;
    }
    download();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="micro">Export</p>
        <h2 id="export-title">Export catalog</h2>
        <p className="lede">Exports the services in the current search and filters. Retired fields are left out.</p>
        <label className="export-choice">
          <input type="radio" name="export-kind" checked={kind === "public"} onChange={() => setKind("public")} />
          <span>
            <strong>Public CSV</strong>
            <span className="hint">Active public fields only.</span>
          </span>
        </label>
        <label className="export-choice">
          <input type="radio" name="export-kind" checked={kind === "all"} onChange={() => setKind("all")} />
          <span>
            <strong>Full CSV</strong>
            <span className="hint">Active public and internal fields.</span>
          </span>
        </label>
        <p className="micro" style={{ marginTop: 12 }}>
          Distribution marking
        </p>
        <p className="marking-preview">{marking}</p>
        <label className="check">
          <input type="checkbox" checked={includeMarking} onChange={(event) => setIncludeMarking(event.target.checked)} />
          Include distribution marking row at top of CSV
        </label>
        {includeMarking ? null : <p className="hint">The marking stays off this file. Row 1 will be the column headers.</p>}
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={requestDownload} disabled={services.length === 0}>
            Download CSV
          </button>
        </div>
        <p className="hint">Excel, Word, PDF, and a custom field picker are planned for a later version.</p>
      </div>
      {confirming ? (
        <div
          className="modal-backdrop confirm-layer"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation();
            setConfirming(false);
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Internal use only"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>Internal use only</h2>
            <p className="lede">This contains internal-use-only data. Please do not share it externally.</p>
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={download}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
