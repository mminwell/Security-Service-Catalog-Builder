"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { downloadName, servicesToCsv } from "@/lib/catalog/csv";
import { filterServices } from "@/lib/catalog/filter";
import { activeOptions, optionLabel } from "@/lib/catalog/lookups";
import {
  capabilityTone,
  cmmiTone,
  completenessTone,
  formatDate,
  gapText,
  reviewTone,
  shortTier,
  statusTone,
} from "@/lib/catalog/present";
import { completenessPercent } from "@/lib/catalog/service";
import { EMPTY_FILTERS, type CatalogFilters } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { AuditDrawer, Badge } from "@/components/widgets";

export function CatalogScreen() {
  const api = useCatalog();
  const router = useRouter();
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [preview, setPreview] = useState<"internal" | "public">("internal");
  const [history, setHistory] = useState(false);
  const filtered = useMemo(() => filterServices(api.services, filters), [api.services, filters]);
  const showInternal = preview === "internal";

  function setFilter<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function exportCsv(visibility: "public" | "all") {
    const csv = servicesToCsv(filtered, api.fields, api.lookups, visibility);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadName(api.activeTenant?.slug ?? "catalog", visibility);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Catalog</p>
          <h1>{api.activeTenant?.name}</h1>
          <p className="lede">
            Search and filter the services in this workspace. Public preview hides internal fields. Completeness counts
            every active field, not only the ones on screen.
          </p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setHistory(true)}>
            Change history
          </button>
          {api.canWrite ? (
            <Link className="btn btn-primary" href="/services/new">
              Add service
            </Link>
          ) : null}
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Catalog visibility">
          <button type="button" role="radio" aria-checked={preview === "internal"} onClick={() => setPreview("internal")}>
            Full internal view
          </button>
          <button type="button" role="radio" aria-checked={preview === "public"} onClick={() => setPreview("public")}>
            Public preview
          </button>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => exportCsv("public")} disabled={filtered.length === 0}>
          Export public CSV
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => exportCsv("all")} disabled={filtered.length === 0}>
          Export full CSV
        </button>
      </div>

      <div className="filters">
        <input
          className="input search"
          placeholder="Search code, name, or summary"
          value={filters.query}
          aria-label="Search services"
          onChange={(event) => setFilter("query", event.target.value)}
        />
        <FilterSelect label="Category" value={filters.category} fieldKey="category" onChange={(value) => setFilter("category", value)} />
        <FilterSelect label="Status" value={filters.status} fieldKey="status" onChange={(value) => setFilter("status", value)} />
        <FilterSelect label="Service tier" value={filters.service_tier} fieldKey="service_tier" onChange={(value) => setFilter("service_tier", value)} />
        <FilterSelect label="Owner team" value={filters.owner_team} fieldKey="team" onChange={(value) => setFilter("owner_team", value)} />
        <FilterSelect
          label="Capability"
          value={filters.capability_rating}
          fieldKey="capability_rating"
          onChange={(value) => setFilter("capability_rating", value)}
        />
      </div>

      {preview === "public" ? (
        <p className="hint" style={{ marginBottom: 12 }}>
          Public preview hides internal columns such as internal name, CMMI, maturity gap, cost, and internal notes.
          The public CSV uses the same rule across every public field.
        </p>
      ) : null}

      {api.services.length === 0 ? (
        <section className="empty">
          <h2>This workspace has no services yet.</h2>
          <p className="lede">Add the first service, or load a starter set you can edit.</p>
          <div className="row-actions" style={{ marginTop: 16 }}>
            {api.canWrite ? (
              <button type="button" className="btn btn-primary" onClick={() => void api.loadSampleServices()}>
                Load starter sample services
              </button>
            ) : null}
            {api.canWrite ? (
              <Link className="btn btn-secondary" href="/services/new">
                Add a service
              </Link>
            ) : null}
          </div>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty">
          <h2>No services match these filters.</h2>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </section>
      ) : (
        <div className="panel table-wrap">
          <table className="catalog">
            <thead>
              <tr>
                <th>Code</th>
                <th>Service</th>
                <th>Category</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Owner team</th>
                <th>Capability</th>
                <th>Next review</th>
                {showInternal ? <th>Internal name</th> : null}
                {showInternal ? <th>CMMI</th> : null}
                {showInternal ? <th>Gap</th> : null}
                <th>Completeness</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((service) => {
                const percent = completenessPercent(service, api.fields);
                const tone = completenessTone(percent);
                return (
                  <tr key={service.id} className="clickable" onClick={() => router.push(`/services/${service.id}`)}>
                    <td className="code">{service.service_code}</td>
                    <td>
                      <Link className="service-name" href={`/services/${service.id}`} onClick={(event) => event.stopPropagation()}>
                        {service.name}
                      </Link>
                    </td>
                    <td>{optionLabel(api.lookups, "category", service.category)}</td>
                    <td>
                      <Badge tone={statusTone(service.status)}>
                        {optionLabel(api.lookups, "status", service.status) || "—"}
                      </Badge>
                    </td>
                    <td>{shortTier(optionLabel(api.lookups, "service_tier", service.service_tier)) || "—"}</td>
                    <td>{optionLabel(api.lookups, "team", service.owner_team) || "—"}</td>
                    <td>
                      {service.capability_rating ? (
                        <Badge tone={capabilityTone(service.capability_rating)}>
                          {optionLabel(api.lookups, "capability_rating", service.capability_rating)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {service.next_review_date ? (
                        <Badge tone={reviewTone(service.next_review_date)}>{formatDate(service.next_review_date)}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    {showInternal ? <td>{service.internal_name || "—"}</td> : null}
                    {showInternal ? (
                      <td>
                        {service.current_maturity_cmmi == null ? (
                          "—"
                        ) : (
                          <Badge tone={cmmiTone(service.current_maturity_cmmi)}>{service.current_maturity_cmmi}</Badge>
                        )}
                      </td>
                    ) : null}
                    {showInternal ? (
                      <td>
                        {service.maturity_gap == null ? (
                          "—"
                        ) : (
                          <Badge tone={service.maturity_gap > 0 ? "warning" : "success"}>
                            <span title={gapText(service.maturity_gap)}>{service.maturity_gap}</span>
                          </Badge>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <div className="meter" title="Filled fields divided by all active field definitions">
                        <div className={`meter-track ${tone === "success" ? "" : tone}`}>
                          <span style={{ width: `${percent}%` }} />
                        </div>
                        <span className="code">{percent}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {history ? (
        <AuditDrawer title="Workspace history" entries={api.audit} fields={api.fields} onClose={() => setHistory(false)} />
      ) : null}
    </>
  );
}

function FilterSelect({
  label,
  value,
  fieldKey,
  onChange,
}: {
  label: string;
  value: string;
  fieldKey: string;
  onChange: (value: string) => void;
}) {
  const api = useCatalog();
  const options = activeOptions(api.lookups, fieldKey);
  return (
    <select className="select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.id} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
