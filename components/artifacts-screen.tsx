"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ARTIFACT_FILTER_LOOKUPS,
  ARTIFACT_STATUS_KEY,
  ARTIFACT_TYPE_KEY,
  artifactFilterFields,
  artifactFlags,
  filterArtifacts,
  linkCounts,
} from "@/lib/catalog/artifacts";
import { CATALOG_SEARCH_DESKTOP, CATALOG_SEARCH_PLACEHOLDER } from "@/lib/catalog/catalog-toolbar";
import { CLOSED_COMPOSER, requestAdditionalFilter, type FilterComposer } from "@/lib/catalog/filter";
import { optionLabel } from "@/lib/catalog/lookups";
import { localToday } from "@/lib/catalog/present";
import { EMPTY_FILTERS, type CatalogFilters } from "@/lib/catalog/types";
import { ArtifactImportControls } from "@/components/artifact-import";
import { FilterChipRow, FilterControl } from "@/components/catalog-tools";
import { useCatalog } from "@/components/catalog-provider";
import { ExternalUrl } from "@/components/external-url";
import { Badge, VisibilityBadge } from "@/components/widgets";

export function ArtifactsScreen() {
  const api = useCatalog();
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [composer, setComposer] = useState<FilterComposer>(CLOSED_COMPOSER);
  const filterFields = useMemo(() => artifactFilterFields(), []);
  const filterLookups = useMemo(() => [...api.lookups, ...ARTIFACT_FILTER_LOOKUPS], [api.lookups]);
  const today = localToday();
  const counts = useMemo(() => linkCounts(api.artifactLinks), [api.artifactLinks]);
  const filtered = useMemo(
    () =>
      filterArtifacts({
        artifacts: api.artifacts,
        links: api.artifactLinks,
        lookups: api.lookups,
        query: filters.query,
        rules: filters.rules,
        today,
      }).sort((a, b) => a.name.localeCompare(b.name)),
    [api.artifacts, api.artifactLinks, api.lookups, filters.query, filters.rules, today],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">Artifacts</p>
          <h1>Supporting artifacts</h1>
          <p className="lede">
            Policies, standards, procedures, and tools for this workspace. The catalog links out to where each one lives.
            It does not store the file.
          </p>
        </div>
        <div className="row-actions">
          {api.canWrite ? <ArtifactImportControls /> : null}
          {api.canWrite ? (
            <Link className="btn btn-primary" href="/artifacts/new">
              Add artifact
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
          aria-label="Search artifacts"
          onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
        />
        <FilterControl
          filters={filters}
          fields={filterFields}
          lookups={filterLookups}
          composer={composer}
          onChange={setFilters}
          onComposer={setComposer}
          showArchive={false}
        />
      </div>
      <FilterChipRow
        filters={filters}
        fields={filterFields}
        lookups={filterLookups}
        onChange={setFilters}
        onComposer={setComposer}
        onAddAdditional={() => setComposer((current) => requestAdditionalFilter(current))}
      />

      {api.artifacts.length === 0 ? (
        <section className="empty">
          <h2>No artifacts yet</h2>
          <p className="lede">Add a policy, standard, procedure, or tool, or import a CSV of the ones you already track.</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty">
          <h2>No artifacts match these filters.</h2>
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
                <th>Name</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Version</th>
                <th>Visibility</th>
                <th>Next review</th>
                <th>Services</th>
                <th>Flags</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((artifact) => {
                const flags = artifactFlags(artifact, counts.get(artifact.id) ?? 0, today);
                return (
                  <tr key={artifact.id}>
                    <td>
                      <Link href={`/artifacts/${artifact.id}`}>{artifact.name}</Link>
                    </td>
                    <td>{optionLabel(api.lookups, ARTIFACT_TYPE_KEY, artifact.artifact_type) || artifact.artifact_type}</td>
                    <td>{optionLabel(api.lookups, "team", artifact.owner_team) || "—"}</td>
                    <td>{optionLabel(api.lookups, ARTIFACT_STATUS_KEY, artifact.status) || "—"}</td>
                    <td>{artifact.version || "—"}</td>
                    <td>
                      <VisibilityBadge visibility={artifact.visibility} />
                    </td>
                    <td>{artifact.next_review_date || "—"}</td>
                    <td>{counts.get(artifact.id) ?? 0}</td>
                    <td>
                      {flags.overdue ? <Badge tone="warning">Overdue for review</Badge> : null}{" "}
                      {flags.retiredLinked ? <Badge tone="danger">Retired but still linked</Badge> : null}
                      {!flags.overdue && !flags.retiredLinked ? "—" : null}
                    </td>
                    <td>
                      <ExternalUrl url={artifact.link_url}>Open</ExternalUrl>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
