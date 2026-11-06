"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AGGREGATION_SUMMARY,
  aggregateCoverage,
  countsFor,
  outcomeMatches,
  type CoverageFilter,
  type OutcomeAssessment,
  type OutcomeStatus,
} from "@/lib/catalog/coverage";
import { ancestorOfType, CSF_FRAMEWORK } from "@/lib/catalog/framework";
import { optionByCode } from "@/lib/catalog/lookups";
import { useCatalog } from "@/components/catalog-provider";
import { CsfFunctionIcon } from "@/components/icons";
import { OutcomeAssessmentFields } from "@/components/outcome-mapping";
import { Badge } from "@/components/widgets";

const STATUS_TONE = {
  full: "success",
  partial: "warning",
  none: "accent",
  unmapped: "neutral",
} as const;

export function CoverageScreen() {
  const api = useCatalog();
  const elements = api.elements;
  const services = api.services;
  const [filter, setFilter] = useState<CoverageFilter>({
    query: "",
    functionCode: null,
    categoryCode: null,
    status: null,
  });
  const [attachId, setAttachId] = useState<string | null>(null);
  const report = useMemo(
    () =>
      aggregateCoverage({
        elements,
        mappings: api.mappings,
        services,
        tenantId: api.activeTenant?.id ?? "",
      }),
    [elements, api.mappings, services, api.activeTenant?.id],
  );
  const activeServices = services.filter((service) => !service.archived_at);
  const functions = elements.filter((element) => element.element_type === "function").sort((a, b) => a.sort_order - b.sort_order);
  const categories = elements
    .filter((element) => element.element_type === "category")
    .filter((element) => {
      if (!filter.functionCode) return true;
      const fn = ancestorOfType(element, "function", elements);
      return fn?.code === filter.functionCode;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  const visible = report.outcomes.filter((outcome) => {
    const linked = outcome.contributions
      .map((item) => services.find((service) => service.id === item.serviceId))
      .filter((service) => service != null)
      .map((service) => `${service.service_code} ${service.name}`)
      .join(" ");
    return outcomeMatches(outcome, elements, filter, linked);
  });
  const grouped = groupVisible(visible, elements);

  if (!api.framework || elements.length === 0) {
    return (
      <section className="empty">
        <h1>Coverage</h1>
        <p className="lede">
          NIST CSF 2.0 is not loaded in this workspace yet. Apply <span className="code">0004_v2_csf_mappings.sql</span>{" "}
          and reload. Demo Mode includes the core automatically.
        </p>
      </section>
    );
  }

  const frameworkName = api.framework.version === "2.0" ? api.framework.name : CSF_FRAMEWORK.name;
  const noServices = services.length === 0;
  const noAssessments = report.counts.full + report.counts.partial + report.counts.none === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">NIST CSF 2.0</p>
          <h1>Coverage</h1>
          <p className="lede">
            {frameworkName}. {report.denominator} subcategory outcomes. {activeServices.length} active{" "}
            {activeServices.length === 1 ? "service" : "services"}
            {services.length - activeServices.length > 0
              ? `, ${services.length - activeServices.length} archived excluded`
              : ""}
            .
          </p>
        </div>
      </div>

      <div className="callout">
        <p>{AGGREGATION_SUMMARY}</p>
        <p className="hint">
          Denominator: all {report.denominator} subcategory outcomes in the seeded CSF 2.0 core. The four counts add up
          to that denominator. Dropdown labels can be edited; the assessment codes stay full, partial, and none.
        </p>
      </div>

      {noServices ? (
        <section className="empty">
          <h2>No services yet</h2>
          <p>
            Every outcome is unmapped. Add a service, then save an assessment. Nothing on this page is inferred from a
            blueprint hint or a primary function.
          </p>
        </section>
      ) : null}
      {!noServices && noAssessments ? (
        <section className="empty">
          <h2>No saved assessments</h2>
          <p>
            Active services are in the catalog, and none has a saved outcome assessment. Primary CSF function,
            capability rating, CMMI, and blueprint hints are not coverage.
          </p>
        </section>
      ) : null}

      <div className="coverage-counts" aria-label="Workspace outcome counts">
        <Count label="Full" value={report.counts.full} tone="success" />
        <Count label="Partial" value={report.counts.partial} tone="warning" />
        <Count label="None" value={report.counts.none} tone="accent" />
        <Count label="Unmapped" value={report.counts.unmapped} tone="neutral" />
      </div>

      <div className="coverage-functions">
        {functions.map((fn) => {
          const inFunction = report.outcomes.filter((outcome) => ancestorOfType(outcome.element, "function", elements)?.id === fn.id);
          const counts = countsFor(inFunction);
          const pressed = filter.functionCode === fn.code;
          return (
            <button
              key={fn.id}
              type="button"
              className="coverage-function"
              aria-pressed={pressed}
              onClick={() =>
                setFilter((current) => ({
                  ...current,
                  functionCode: pressed ? null : fn.code,
                  categoryCode: pressed ? current.categoryCode : null,
                }))
              }
            >
              <span className="coverage-function-copy">
                <span className="code">{fn.code}</span>
                <strong>{fn.title}</strong>
                <span className="coverage-mini">
                  {counts.full} full · {counts.partial} partial · {counts.none} none · {counts.unmapped} unmapped
                </span>
              </span>
              <CsfFunctionIcon code={fn.code} />
            </button>
          );
        })}
      </div>

      <div className="coverage-filters">
        <label>
          <span className="micro">Search</span>
          <input
            className="input"
            value={filter.query}
            aria-label="Search outcomes"
            placeholder="Search"
            onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
          />
        </label>
        <label>
          <span className="micro">Function</span>
          <select
            className="select"
            aria-label="Filter by function"
            value={filter.functionCode ?? ""}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                functionCode: event.target.value || null,
                categoryCode: null,
              }))
            }
          >
            <option value="">All functions</option>
            {functions.map((fn) => (
              <option key={fn.id} value={fn.code}>
                {fn.code} {fn.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="micro">Category</span>
          <select
            className="select"
            aria-label="Filter by category"
            value={filter.categoryCode ?? ""}
            onChange={(event) => setFilter((current) => ({ ...current, categoryCode: event.target.value || null }))}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.code}>
                {category.code} {category.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="micro">Coverage</span>
          <select
            className="select"
            aria-label="Filter by coverage"
            value={filter.status ?? ""}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                status: (event.target.value || null) as CoverageFilter["status"],
              }))
            }
          >
            <option value="">All outcomes</option>
            <option value="attention">Gaps (partial, none, unmapped)</option>
            <option value="full">Full</option>
            <option value="partial">Partial</option>
            <option value="none">None</option>
            <option value="unmapped">Unmapped</option>
          </select>
        </label>
      </div>
      <p className="hint">Showing {visible.length} of {report.denominator} outcomes. Workspace counts above stay on the full core.</p>

      {visible.length === 0 ? (
        <section className="empty">
          <h2>No outcomes match</h2>
          <p>Try another function, category, coverage filter, or search.</p>
        </section>
      ) : (
        <div className="outcome-groups">
          {grouped.map((group) => (
            <section key={group.category.id} className="outcome-group">
              <h2>
                <span className="code">{group.fn?.code}</span> {group.fn?.title}
                <span className="muted"> · </span>
                <span className="code">{group.category.code}</span> {group.category.title}
              </h2>
              <p className="picker-statement">{group.category.statement}</p>
              <ul>
                {group.outcomes.map((outcome) => (
                  <OutcomeRow
                    key={outcome.element.id}
                    outcome={outcome}
                    open={attachId === outcome.element.id}
                    onToggle={() => setAttachId((current) => (current === outcome.element.id ? null : outcome.element.id))}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function OutcomeRow({
  outcome,
  open,
  onToggle,
}: {
  outcome: OutcomeAssessment;
  open: boolean;
  onToggle: () => void;
}) {
  const api = useCatalog();
  const label = statusLabel(api.lookups, outcome.status);
  const [serviceId, setServiceId] = useState(outcome.contributions[0]?.serviceId ?? "");
  const [coverage, setCoverage] = useState<string>(outcome.contributions[0]?.coverage ?? "");
  const [rationale, setRationale] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const choices = api.services
    .filter((service) => !service.archived_at)
    .map((service) => ({ id: service.id, label: `${service.service_code} · ${service.name}` }));

  async function save() {
    setSaving(true);
    setMessage(null);
    setLocalError(null);
    try {
      await api.saveOutcomeMapping({
        serviceId,
        elementId: outcome.element.id,
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

  return (
    <li className="outcome-row">
      <div className="outcome-main">
        <div>
          <p>
            <span className="code">{outcome.element.code}</span> {outcome.element.statement}
          </p>
          <div className="outcome-links">
            {outcome.contributions.length === 0 ? <span className="hint">No active service assessment.</span> : null}
            {outcome.contributions.map((item) => {
              const service = api.services.find((candidate) => candidate.id === item.serviceId);
              if (!service) return null;
              const itemLabel = optionByCode(api.lookups, "outcome_coverage", item.coverage)?.label ?? item.coverage;
              return (
                <Link key={item.mappingId} href={`/services/${service.id}#mapping`}>
                  {service.service_code} · {service.name} · {itemLabel}
                </Link>
              );
            })}
            {outcome.excludedArchived > 0 ? (
              <span className="hint">
                {outcome.excludedArchived} archived {outcome.excludedArchived === 1 ? "assessment is" : "assessments are"} excluded.
              </span>
            ) : null}
          </div>
        </div>
        <Badge tone={STATUS_TONE[outcome.status]}>{label}</Badge>
      </div>
      {api.canWrite ? (
        <div className="outcome-actions">
          <button type="button" className="btn btn-secondary" onClick={onToggle}>
            {open ? "Close" : "Attach service"}
          </button>
        </div>
      ) : null}
      {open && api.canWrite ? (
        <div className="assessment-card">
          {choices.length === 0 ? (
            <p>No active services to attach. Restore or add a service first.</p>
          ) : (
            <OutcomeAssessmentFields
              lookups={api.lookups}
              coverage={coverage}
              rationale={rationale}
              notes={notes}
              disabled={saving}
              onCoverage={setCoverage}
              onRationale={setRationale}
              onNotes={setNotes}
              serviceChoices={choices}
              serviceId={serviceId}
              onServiceId={setServiceId}
            />
          )}
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
          {choices.length > 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !serviceId || !coverage}>
              {saving ? "Saving…" : "Save assessment"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "accent" | "neutral" }) {
  return (
    <div className="coverage-count">
      <span className="micro">{label}</span>
      <strong>{value}</strong>
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}

function statusLabel(lookups: ReturnType<typeof useCatalog>["lookups"], status: OutcomeStatus): string {
  if (status === "unmapped") return "Unmapped";
  return optionByCode(lookups, "outcome_coverage", status)?.label ?? status;
}

function groupVisible(outcomes: OutcomeAssessment[], elements: ReturnType<typeof useCatalog>["elements"]) {
  const groups: Array<{
    fn: (typeof elements)[number] | null;
    category: (typeof elements)[number];
    outcomes: OutcomeAssessment[];
  }> = [];
  for (const outcome of outcomes) {
    const category = ancestorOfType(outcome.element, "category", elements);
    const fn = ancestorOfType(outcome.element, "function", elements);
    if (!category) continue;
    const last = groups[groups.length - 1];
    if (last && last.category.id === category.id) last.outcomes.push(outcome);
    else groups.push({ fn, category, outcomes: [outcome] });
  }
  return groups;
}
