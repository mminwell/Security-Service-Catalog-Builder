"use client";

import { useMemo, useState } from "react";
import { activeOptions, optionByCode } from "@/lib/catalog/lookups";
import { isExplicitCoverage } from "@/lib/catalog/coverage";
import { ancestorOfType, blueprintHintCodes, type FrameworkElement } from "@/lib/catalog/framework";
import type { LookupOption, OutcomeMapping, ServiceRecord } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { Badge } from "@/components/widgets";

export function ServiceMappingSection({ serviceId }: { serviceId: string }) {
  const api = useCatalog();
  const service = api.services.find((item) => item.id === serviceId) ?? null;
  const elements = api.elements;
  const mappings = api.mappings.filter((mapping) => mapping.service_id === serviceId);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(mappings[0]?.element_id ?? null);
  const selected = elements.find((element) => element.id === selectedId && element.element_type === "subcategory") ?? null;
  const selectedMapping = mappings.find((mapping) => mapping.element_id === selectedId) ?? null;
  const [coverage, setCoverage] = useState(selectedMapping?.coverage ?? "");
  const [rationale, setRationale] = useState(selectedMapping?.rationale ?? "");
  const [notes, setNotes] = useState(selectedMapping?.notes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function selectOutcome(id: string) {
    const mapping = mappings.find((item) => item.element_id === id);
    setSelectedId(id);
    setCoverage(mapping?.coverage ?? "");
    setRationale(mapping?.rationale ?? "");
    setNotes(mapping?.notes ?? "");
    setMessage(null);
    setLocalError(null);
  }

  const hints = useMemo(() => hintRows(service, elements), [service, elements]);
  const tree = useMemo(() => filterTree(elements, query), [elements, query]);

  if (!service) return null;
  const record = service;
  const readOnly = !api.canWrite;

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    setLocalError(null);
    try {
      await api.saveOutcomeMapping({
        serviceId: record.id,
        elementId: selected.id,
        coverage,
        rationale,
        notes,
      });
      setMessage("Assessment saved.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "The assessment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedMapping) return;
    setSaving(true);
    setMessage(null);
    setLocalError(null);
    try {
      await api.removeOutcomeMapping(selectedMapping.id);
      setMessage("Assessment removed.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "The assessment could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-section" id="mapping">
      <h2>Mapping</h2>
      <p className="lede">
        Record how this service addresses a NIST CSF 2.0 subcategory outcome. Saving an assessment is explicit. A
        blueprint hint or the Primary CSF Function dropdown is not coverage, and this is not a certification.
      </p>
      {service.archived_at ? (
        <div className="callout">
          This service is archived, so these assessments stay on the record and are excluded from coverage until you
          restore it.
        </div>
      ) : null}
      {readOnly ? <div className="callout">You have view access. Outcome assessments are read only.</div> : null}

      <SavedMappings mappings={mappings} elements={elements} lookups={api.lookups} onOpen={selectOutcome} />

      {hints.length > 0 ? (
        <div className="hint-block">
          <p className="micro">Blueprint hints</p>
          <p className="hint">These codes came in with the blueprint. They are not coverage until you save an assessment.</p>
          <div className="hint-row">
            {hints.map((hint) =>
              hint.element ? (
                <button key={hint.code} type="button" className="btn btn-secondary" onClick={() => hint.element && selectOutcome(hint.element.id)}>
                  {hint.code}
                </button>
              ) : (
                <span key={hint.code} className="hint">
                  {hint.code} is not a current CSF 2.0 outcome.
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}

      <label className="field-label" htmlFor="outcome-search">
        Search outcomes
      </label>
      <input
        id="outcome-search"
        className="input"
        value={query}
        placeholder="Function, category, or outcome"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="picker" aria-label="CSF outcomes">
        {tree.length === 0 ? <p className="hint">No outcomes match that search.</p> : null}
        {tree.map((fn) => (
          <div key={fn.element.id}>
            <h3>
              <span className="code">{fn.element.code}</span> {fn.element.title}
            </h3>
            {fn.categories.map((category) => (
              <div key={category.element.id}>
                <h4>
                  <span className="code">{category.element.code}</span> {category.element.title}
                </h4>
                <p className="picker-statement">{category.element.statement}</p>
                {category.outcomes.map((outcome) => {
                  const pressed = outcome.id === selectedId;
                  return (
                    <button
                      key={outcome.id}
                      type="button"
                      className={pressed ? "picker-outcome is-selected" : "picker-outcome"}
                      aria-pressed={pressed}
                      onClick={() => selectOutcome(outcome.id)}
                    >
                      <span className="code">{outcome.code}</span>
                      <span>{outcome.statement}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {selected ? (
        <div className="assessment-card">
          <p className="micro">
            {ancestorOfType(selected, "function", elements)?.title} · {ancestorOfType(selected, "category", elements)?.title}
          </p>
          <h3>
            <span className="code">{selected.code}</span> {selected.title === selected.code ? "Outcome" : selected.title}
          </h3>
          <p>{selected.statement}</p>
          <OutcomeAssessmentFields
            lookups={api.lookups}
            coverage={coverage}
            rationale={rationale}
            notes={notes}
            disabled={readOnly || saving}
            onCoverage={setCoverage}
            onRationale={setRationale}
            onNotes={setNotes}
          />
          {localError ? (
            <p className="field-error" role="alert">
              {localError}
            </p>
          ) : null}
          {message ? (
            <p className="saved-banner" role="status">
              {message}
            </p>
          ) : null}
          {readOnly ? null : (
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !coverage}>
                {saving ? "Saving…" : "Save assessment"}
              </button>
              {selectedMapping ? (
                <button type="button" className="btn btn-secondary" onClick={() => void remove()} disabled={saving}>
                  Remove assessment
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <p className="hint">Choose an outcome to read its official statement and record an assessment.</p>
      )}
    </section>
  );
}

export function OutcomeAssessmentFields({
  lookups,
  coverage,
  rationale,
  notes,
  disabled,
  onCoverage,
  onRationale,
  onNotes,
  serviceChoices,
  serviceId,
  onServiceId,
}: {
  lookups: LookupOption[];
  coverage: string;
  rationale: string;
  notes: string;
  disabled: boolean;
  onCoverage: (value: string) => void;
  onRationale: (value: string) => void;
  onNotes: (value: string) => void;
  serviceChoices?: Array<{ id: string; label: string }>;
  serviceId?: string;
  onServiceId?: (value: string) => void;
}) {
  const options = activeOptions(lookups, "outcome_coverage").filter((option) => isExplicitCoverage(option.code));
  const described = options.find((option) => option.code === coverage);
  if (options.length === 0) {
    return (
      <p className="field-error" role="alert">
        Coverage choices are missing from this workspace. An admin can restore Full, Partial, and None under Lookups.
      </p>
    );
  }
  return (
    <div className="assessment-fields">
      {serviceChoices && onServiceId ? (
        <label>
          <span className="field-label">Active service</span>
          <select className="select" value={serviceId ?? ""} disabled={disabled} onChange={(event) => onServiceId(event.target.value)}>
            <option value="">Choose a service</option>
            {serviceChoices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <span className="field-label">Assessment</span>
        <select className="select" value={coverage} disabled={disabled} onChange={(event) => onCoverage(event.target.value)}>
          <option value="">Choose an assessment</option>
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {described?.description ? <p className="hint">{described.description}</p> : null}
      <label>
        <span className="field-label">Rationale</span>
        <textarea className="textarea" value={rationale} disabled={disabled} rows={3} onChange={(event) => onRationale(event.target.value)} />
      </label>
      <label>
        <span className="field-label">Notes</span>
        <textarea className="textarea" value={notes} disabled={disabled} rows={2} onChange={(event) => onNotes(event.target.value)} />
      </label>
    </div>
  );
}

function SavedMappings({
  mappings,
  elements,
  lookups,
  onOpen,
}: {
  mappings: OutcomeMapping[];
  elements: FrameworkElement[];
  lookups: LookupOption[];
  onOpen: (elementId: string) => void;
}) {
  if (mappings.length === 0) {
    return <p className="hint">No saved assessments on this service yet.</p>;
  }
  return (
    <ul className="saved-mappings">
      {mappings.map((mapping) => {
        const element = elements.find((item) => item.id === mapping.element_id);
        const label = optionByCode(lookups, "outcome_coverage", mapping.coverage)?.label ?? mapping.coverage;
        return (
          <li key={mapping.id}>
            <button type="button" className="btn btn-ghost" onClick={() => onOpen(mapping.element_id)}>
              <span className="code">{element?.code ?? "Outcome"}</span>
              <Badge tone={mapping.coverage === "full" ? "success" : mapping.coverage === "partial" ? "warning" : "accent"}>{label}</Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function hintRows(service: ServiceRecord | null, elements: FrameworkElement[]) {
  return blueprintHintCodes(service?.custom_fields).map((code) => ({
    code,
    element: elements.find((element) => element.code === code && element.element_type === "subcategory") ?? null,
  }));
}

type TreeCategory = { element: FrameworkElement; outcomes: FrameworkElement[] };
type TreeFunction = { element: FrameworkElement; categories: TreeCategory[] };

function filterTree(elements: FrameworkElement[], query: string): TreeFunction[] {
  const needle = query.trim().toLowerCase();
  const functions = elements.filter((element) => element.element_type === "function").sort((a, b) => a.sort_order - b.sort_order);
  return functions.flatMap((fn) => {
    const categories = elements
      .filter((element) => element.element_type === "category" && element.parent_id === fn.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((category) => {
        const outcomes = elements
          .filter((element) => element.element_type === "subcategory" && element.parent_id === category.id)
          .filter((outcome) => !needle || matches(needle, fn, category, outcome))
          .sort((a, b) => a.sort_order - b.sort_order);
        return outcomes.length > 0 ? [{ element: category, outcomes }] : [];
      });
    return categories.length > 0 ? [{ element: fn, categories }] : [];
  });
}

function matches(needle: string, fn: FrameworkElement, category: FrameworkElement, outcome: FrameworkElement): boolean {
  return [fn.code, fn.title, fn.statement, category.code, category.title, category.statement, outcome.code, outcome.statement]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
