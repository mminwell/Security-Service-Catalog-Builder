"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { cartIdsFor, subscribeCart } from "@/lib/catalog/cart-store";
import { columnLabel, formatCatalogCell } from "@/lib/catalog/columns";
import { CATALOG_SEARCH_DESKTOP, CATALOG_SEARCH_PLACEHOLDER } from "@/lib/catalog/catalog-toolbar";
import { CLOSED_COMPOSER, requestAdditionalFilter, type FilterComposer } from "@/lib/catalog/filter";
import { filterServices } from "@/lib/catalog/filter";
import { SHOP_FREE_BLUEPRINTS_LABEL } from "@/lib/catalog/shop-label";
import { EMPTY_FILTERS, type CatalogFilters } from "@/lib/catalog/types";
import { BlueprintCartArt } from "@/components/blueprint-art";
import { ExportDialog } from "@/components/export-dialog";
import { FilterChipRow, FilterControl } from "@/components/catalog-tools";
import { ColumnPicker, useCatalogColumns } from "@/components/column-picker";
import { useCatalog } from "@/components/catalog-provider";
import { CartIcon } from "@/components/icons";
import { AuditDrawer, Badge } from "@/components/widgets";
import { WorkspaceMark } from "@/components/workspace-mark";

export function CatalogScreen() {
  const api = useCatalog();
  const router = useRouter();
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [composer, setComposer] = useState<FilterComposer>(CLOSED_COMPOSER);
  const [history, setHistory] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const tenant = api.activeTenant;
  const columns = useCatalogColumns(tenant?.id ?? null, tenant?.catalog_columns?.keys ?? null, api.fields);
  const cartCount = useSyncExternalStore(
    subscribeCart,
    () => cartIdsFor(tenant?.id ?? null).length,
    () => 0,
  );

  const filtered = useMemo(
    () => filterServices(api.services, filters, api.fields),
    [api.services, api.fields, filters],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Catalog</p>
          <div className="identity">
            {tenant ? <WorkspaceMark name={tenant.name} logoUrl={tenant.logo_url} size={40} /> : null}
            <h1>{tenant?.name}</h1>
          </div>
          <p className="lede">Search and filter the services in this workspace. Completeness counts every active field.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setHistory(true)}>
            Change history
          </button>
          <Link className="btn btn-secondary" href="/blueprints" aria-label={SHOP_FREE_BLUEPRINTS_LABEL}>
            <CartIcon />
            {SHOP_FREE_BLUEPRINTS_LABEL}
            {cartCount > 0 ? <span className="cart-badge">{cartCount}</span> : null}
          </Link>
          {api.canWrite ? (
            <Link className="btn btn-primary" href="/services/new">
              Add service
            </Link>
          ) : null}
        </div>
      </div>

      <div
        className="toolbar catalog-toolbar service-catalog-toolbar"
        style={{
          ["--catalog-search" as string]: `${CATALOG_SEARCH_DESKTOP.preferred}px`,
          ["--catalog-search-min" as string]: `${CATALOG_SEARCH_DESKTOP.min}px`,
          ["--catalog-search-max" as string]: `${CATALOG_SEARCH_DESKTOP.max}px`,
        }}
      >
        <input
          className="input search"
          data-control="search"
          placeholder={CATALOG_SEARCH_PLACEHOLDER}
          value={filters.query}
          aria-label="Search services"
          onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
        />
        <FilterControl
          filters={filters}
          fields={api.fields}
          lookups={api.lookups}
          composer={composer}
          onChange={setFilters}
          onComposer={setComposer}
        />
        <ColumnPicker
          fields={api.fields}
          keys={columns.keys}
          canAdmin={api.canAdmin}
          onChange={columns.update}
          onSaveDefault={(keys) => void api.saveCatalogColumns(keys)}
        />
        <button type="button" className="btn btn-secondary" data-control="export" onClick={() => setExportOpen(true)} disabled={filtered.length === 0}>
          Export
        </button>
      </div>
      <FilterChipRow
        filters={filters}
        fields={api.fields}
        lookups={api.lookups}
        onChange={setFilters}
        onComposer={setComposer}
        onAddAdditional={() => setComposer((current) => requestAdditionalFilter(current))}
      />

      {api.services.length === 0 ? (
        <section className="hero-card">
          <BlueprintCartArt />
          <div>
            <p className="micro">Blueprint store</p>
            <h2>Don&apos;t start from scratch.</h2>
            <p className="lede">
              Shop pre-built security service blueprints, bundle them by company size or industry, and tailor every field
              to your organization.
            </p>
            <div className="row-actions" style={{ marginTop: 16 }}>
              <Link className="btn btn-primary" href="/blueprints">
                <CartIcon />
                Shop Pre-Built Security Services
              </Link>
              {api.canWrite ? (
                <Link className="btn btn-secondary" href="/services/new">
                  Add a service from scratch
                </Link>
              ) : null}
            </div>
            {api.canWrite ? (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => void api.loadSampleServices()}>
                Or load four starter samples
              </button>
            ) : null}
          </div>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty">
          <h2>{filters.scope === "archived" ? "No archived services match." : "No services match these filters."}</h2>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setComposer(CLOSED_COMPOSER);
            }}
          >
            Clear filters
          </button>
        </section>
      ) : (
        <div className="panel table-wrap">
          <table className="catalog">
            <thead>
              <tr>
                {columns.keys.map((key) => (
                  <th key={key}>{columnLabel(key, api.fields)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((service) => (
                <tr key={service.id} className="clickable" onClick={() => router.push(`/services/${service.id}`)}>
                  {columns.keys.map((key) => (
                    <td key={key}>
                      <CatalogCell fieldKey={key} service={service} />
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
          logoUrl={tenant.logo_url}
          profiles={api.exportProfiles}
          canAdmin={api.canAdmin}
          elements={api.elements}
          frameworks={api.frameworks}
          mappings={api.mappings}
          tenantId={tenant.id}
          artifacts={api.artifacts}
          artifactLinks={api.artifactLinks}
          onClose={() => setExportOpen(false)}
          onSaveProfile={(input) => api.saveExportProfile(input)}
          onDeleteProfile={(profileId) => api.deleteExportProfile(profileId)}
          onRecordExport={(meta) => api.recordExport(meta)}
        />
      ) : null}

      {history ? <AuditDrawer title="Workspace history" entries={api.audit} fields={api.fields} onClose={() => setHistory(false)} /> : null}
    </>
  );
}

function CatalogCell({ fieldKey, service }: { fieldKey: string; service: import("@/lib/catalog/types").ServiceRecord }) {
  const api = useCatalog();
  if (fieldKey === "name") {
    return (
      <span className="name-cell">
        <Link className="service-name" href={`/services/${service.id}`} onClick={(event) => event.stopPropagation()}>
          {service.name}
        </Link>
        {service.archived_at ? <Badge tone="neutral">Archived</Badge> : null}
      </span>
    );
  }
  const field = api.fields.find((item) => item.field_key === fieldKey);
  const model = formatCatalogCell(fieldKey, service, field, api.lookups, api.fields);
  if (model.kind === "code") return <span className="code">{model.text}</span>;
  if (model.kind === "meter") {
    return (
      <div className="meter" title={model.title}>
        <div className={`meter-track ${model.tone === "success" ? "" : model.tone ?? ""}`}>
          <span style={{ width: `${model.percent ?? 0}%` }} />
        </div>
        <span className="code">{model.text}</span>
      </div>
    );
  }
  if (model.kind === "badge" && model.tone) {
    return (
      <Badge tone={model.tone}>
        <span title={model.title}>{model.text}</span>
      </Badge>
    );
  }
  if (model.kind === "pills") {
    return (
      <span className="pill-row" title={model.title}>
        {model.pills?.map((pill) => (
          <span className="mini-pill" key={pill}>
            {pill}
          </span>
        ))}
      </span>
    );
  }
  return <span title={model.title}>{model.text}</span>;
}
