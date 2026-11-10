"use client";

import { useMemo, useState } from "react";
import { activeOptions, optionByCode } from "@/lib/catalog/lookups";
import { isExplicitCoverage } from "@/lib/catalog/coverage";
import { CSF_FRAMEWORK, outcomeChoiceGroups } from "@/lib/catalog/framework";
import type { LookupOption, OutcomeMapping } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { Badge } from "@/components/widgets";

type PanelState = {
  mode: "create" | "edit";
  elementId: string;
  coverage: string;
  rationale: string;
  notes: string;
};

export function ServiceMappingSection({ serviceId }: { serviceId: string }) {
  const api = useCatalog();
  const service = api.services.find((item) => item.id === serviceId) ?? null;
  const mappings = api.mappings.filter((mapping) => mapping.service_id === serviceId);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const attachedIds = useMemo(() => new Set(mappings.map((mapping) => mapping.element_id)), [mappings]);
  const groups = useMemo(
    () =>
      outcomeChoiceGroups({
        elements: api.elements,
        frameworkId: api.framework?.id ?? CSF_FRAMEWORK.id,
        excludeIds: panel?.mode === "edit" ? new Set([...attachedIds].filter((id) => id !== panel.elementId)) : attachedIds,
      }),
    [api.elements, api.framework?.id, attachedIds, panel],
  );

  if (!service) return null;
  const record = service;
  const readOnly = !api.canWrite;

  function openCreate() {
    const first = groups[0]?.outcomes[0]?.id ?? "";
    setPanel({ mode: "create", elementId: first, coverage: "", rationale: "", notes: "" });
    setLocalError(null);
  }

  function openEdit(mapping: OutcomeMapping) {
    setPanel({
      mode: "edit",
      elementId: mapping.element_id,
      coverage: mapping.coverage,
      rationale: mapping.rationale ?? "",
      notes: mapping.notes ?? "",
    });
    setLocalError(null);
  }

  async function save() {
    if (!panel || !panel.elementId) return;
    setSaving(true);
    setLocalError(null);
    try {
      await api.saveOutcomeMapping({
        serviceId: record.id,
        elementId: panel.elementId,
        coverage: panel.coverage,
        rationale: panel.rationale,
        notes: panel.notes,
      });
      setPanel(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "The assessment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(mappingId: string) {
    setSaving(true);
    setLocalError(null);
    try {
      await api.removeOutcomeMapping(mappingId);
      if (panel?.mode === "edit") setPanel(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "The assessment could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-section" id="mapping">
      <h2>CSF mapping</h2>
      <p className="lede">
        Attach a NIST CSF 2.0 subcategory and record an assessment. A template hint or the Primary CSF Function dropdown
        is not an assessment, and this is not a certification.
      </p>
      {service.archived_at ? (
        <div className="callout">
          This service is archived, so these assessments stay on the record and are excluded from CSF Mapping until you
          restore it.
        </div>
      ) : null}
      {readOnly ? <div className="callout">You have view access. Outcome assessments are read only.</div> : null}

      {mappings.length === 0 ? <p>No controls are attached yet.</p> : null}
      <div className="stack">
        {mappings.map((mapping) => {
          const element = api.elements.find((item) => item.id === mapping.element_id);
          const label = optionByCode(api.lookups, "outcome_coverage", mapping.coverage)?.label ?? mapping.coverage;
          return (
            <div className="panel" key={mapping.id} style={{ padding: 12 }}>
              <div className="row-actions">
                <span>
                  <span className="code">{element?.code ?? "Outcome"}</span> {element?.statement ?? ""}
                </span>
                <Badge tone={mapping.coverage === "full" ? "success" : mapping.coverage === "partial" ? "warning" : "accent"}>{label}</Badge>
                {readOnly ? null : (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(mapping)} disabled={saving}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => void remove(mapping.id)} disabled={saving}>
                      Remove
                    </button>
                  </>
                )}
              </div>
              {mapping.rationale ? <p>{mapping.rationale}</p> : null}
            </div>
          );
        })}
      </div>

      {readOnly || panel ? null : (
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={openCreate} disabled={groups.length === 0}>
            Map Control
          </button>
        </div>
      )}

      {panel ? (
        <div className="assessment-card" id="map-control">
          <h3>Map control</h3>
          <label htmlFor="map-control-outcome">
            <span className="field-label">NIST CSF 2.0 outcome</span>
            <select
              id="map-control-outcome"
              className="select"
              aria-label="NIST CSF 2.0 outcome"
              value={panel.elementId}
              disabled={saving || panel.mode === "edit"}
              onChange={(event) => setPanel({ ...panel, elementId: event.target.value })}
            >
              {groups.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.outcomes.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>
                      {outcome.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <OutcomeAssessmentFields
            lookups={api.lookups}
            coverage={panel.coverage}
            rationale={panel.rationale}
            notes={panel.notes}
            disabled={saving}
            onCoverage={(coverage) => setPanel({ ...panel, coverage })}
            onRationale={(rationale) => setPanel({ ...panel, rationale })}
            onNotes={(notes) => setPanel({ ...panel, notes })}
          />
          {localError ? (
            <p className="field-error" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !panel.elementId || !panel.coverage}>
              {saving ? "Saving…" : "Save Assessment"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setPanel(null); setLocalError(null); }} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
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

