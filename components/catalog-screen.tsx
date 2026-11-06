"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { filterServices } from "@/lib/catalog/filter";
import { optionLabel } from "@/lib/catalog/lookups";
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
import { EMPTY_FILTERS, type CatalogFilters, type ServiceRecord } from "@/lib/catalog/types";
import { ExportDialog, FilterControl } from "@/components/catalog-tools";
import { useCatalog } from "@/components/catalog-provider";
import { AuditDrawer, Badge } from "@/components/widgets";
import { WorkspaceMark } from "@/components/workspace-mark";

const COLUMNS: Array<{ id: string; label: string; fieldKey?: string }> = [
  { id: "code", label: "Code", fieldKey: "service_code" },
  { id: "name", label: "Service", fieldKey: "name" },
  { id: "category", label: "Category", fieldKey: "category" },
  { id: "status", label: "Status", fieldKey: "status" },
  { id: "tier", label: "Tier", fieldKey: "service_tier" },
  { id: "owner", label: "Owner team", fieldKey: "owner_team" },
  { id: "capability", label: "Capability", fieldKey: "capability_rating" },
  { id: "review", label: "Next review", fieldKey: "next_review_date" },
  { id: "internal", label: "Internal name", fieldKey: "internal_name" },
  { id: "cmmi", label: "CMMI", fieldKey: "current_maturity_cmmi" },
  { id: "gap", label: "Gap", fieldKey: "maturity_gap" },
  { id: "complete", label: "Completeness" },
];

export function CatalogScreen() {
  const api = useCatalog();
  const router = useRouter();
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [history, setHistory] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const filtered = useMemo(
    () => filterServices(api.services, filters, api.fields),
    [api.services, api.fields, filters],
  );
  const activeKeys = useMemo(
    () => new Set(api.fields.filter((field) => field.is_active).map((field) => field.field_key)),
    [api.fields],
  );
  const columns = COLUMNS.filter((column) => !column.fieldKey || activeKeys.has(column.fieldKey));
  const tenant = api.activeTenant;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Catalog</p>
          <div className="identity">
            {tenant ? <WorkspaceMark name={tenant.name} logoUrl={tenant.logo_url} size={40} /> : null}
            <h1>{tenant?.name}</h1>
          </div>
          <p className="lede">
            Search and filter the services in this workspace. Completeness counts every active field.
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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setExportOpen(true)}
          disabled={filtered.length === 0}
        >
          Export
        </button>
      </div>

      <div className="filters">
        <input
          className="input search"
          placeholder="Search code, name, or summary"
          value={filters.query}
          aria-label="Search services"
          onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
        />
        <FilterControl filters={filters} fields={api.fields} lookups={api.lookups} onChange={setFilters} />
      </div>

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
          <h2>{filters.scope === "archived" ? "No archived services match." : "No services match these filters."}</h2>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </section>
      ) : (
        <div className="panel table-wrap">
          <table className="catalog">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.id}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((service) => (
                <tr key={service.id} className="clickable" onClick={() => router.push(`/services/${service.id}`)}>
                  {columns.map((column) => (
                    <td key={column.id}>
                      <CatalogCell columnId={column.id} service={service} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {exportOpen && tenant ? (
        <ExportDialog
          services={filtered}
          fields={api.fields}
          lookups={api.lookups}
          companyName={tenant.name}
          slug={tenant.slug}
          onClose={() => setExportOpen(false)}
        />
      ) : null}

      {history ? (
        <AuditDrawer title="Workspace history" entries={api.audit} fields={api.fields} onClose={() => setHistory(false)} />
      ) : null}
    </>
  );
}

function CatalogCell({ columnId, service }: { columnId: string; service: ServiceRecord }) {
  const api = useCatalog();
  if (columnId === "code") return <span className="code">{service.service_code}</span>;
  if (columnId === "name") {
    return (
      <span className="name-cell">
        <Link className="service-name" href={`/services/${service.id}`} onClick={(event) => event.stopPropagation()}>
          {service.name}
        </Link>
        {service.archived_at ? <Badge tone="neutral">Archived</Badge> : null}
      </span>
    );
  }
  if (columnId === "category") return <>{optionLabel(api.lookups, "category", service.category)}</>;
  if (columnId === "status") {
    return (
      <Badge tone={statusTone(service.status)}>{optionLabel(api.lookups, "status", service.status) || "—"}</Badge>
    );
  }
  if (columnId === "tier") return <>{shortTier(optionLabel(api.lookups, "service_tier", service.service_tier)) || "—"}</>;
  if (columnId === "owner") return <>{optionLabel(api.lookups, "team", service.owner_team) || "—"}</>;
  if (columnId === "capability") {
    return service.capability_rating ? (
      <Badge tone={capabilityTone(service.capability_rating)}>
        {optionLabel(api.lookups, "capability_rating", service.capability_rating)}
      </Badge>
    ) : (
      <>{"—"}</>
    );
  }
  if (columnId === "review") {
    return service.next_review_date ? (
      <Badge tone={reviewTone(service.next_review_date)}>{formatDate(service.next_review_date)}</Badge>
    ) : (
      <>{"—"}</>
    );
  }
  if (columnId === "internal") return <>{service.internal_name || "—"}</>;
  if (columnId === "cmmi") {
    return service.current_maturity_cmmi == null ? (
      <>{"—"}</>
    ) : (
      <Badge tone={cmmiTone(service.current_maturity_cmmi)}>{service.current_maturity_cmmi}</Badge>
    );
  }
  if (columnId === "gap") {
    return service.maturity_gap == null ? (
      <>{"—"}</>
    ) : (
      <Badge tone={service.maturity_gap > 0 ? "warning" : "success"}>
        <span title={gapText(service.maturity_gap)}>{service.maturity_gap}</span>
      </Badge>
    );
  }
  const percent = completenessPercent(service, api.fields);
  const tone = completenessTone(percent);
  return (
    <div className="meter" title="Filled fields divided by all active field definitions">
      <div className={`meter-track ${tone === "success" ? "" : tone}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="code">{percent}%</span>
    </div>
  );
}
