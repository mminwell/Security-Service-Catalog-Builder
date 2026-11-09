"use client";

import { useMemo, useState } from "react";
import {
  artifactTemplateCsv,
  parseCsv,
  planArtifactImport,
  suggestArtifactColumnMap,
  type ArtifactColumnMap,
} from "@/lib/catalog/artifacts";
import { useCatalog } from "@/components/catalog-provider";

const MAP_FIELDS: Array<{ key: keyof ArtifactColumnMap; label: string; required?: boolean }> = [
  { key: "name", label: "Name", required: true },
  { key: "artifact_type", label: "Type", required: true },
  { key: "owner_team", label: "Owner team" },
  { key: "status", label: "Status" },
  { key: "version", label: "Version" },
  { key: "review_cadence", label: "Review cadence" },
  { key: "last_reviewed_date", label: "Last reviewed" },
  { key: "link_url", label: "Link" },
  { key: "description", label: "Description" },
  { key: "visibility", label: "Visibility" },
];

export function ArtifactImportControls() {
  const [open, setOpen] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([artifactTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "artifact-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
        Download CSV template
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Import CSV
      </button>
      {open ? <ImportModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const api = useCatalog();
  const [table, setTable] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ArtifactColumnMap>({
    name: null,
    artifact_type: null,
    owner_team: null,
    status: null,
    version: null,
    review_cadence: null,
    last_reviewed_date: null,
    link_url: null,
    description: null,
    visibility: null,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const headers = table[0] ?? [];
  const plan = useMemo(
    () => (table.length === 0 ? null : planArtifactImport({ table, map, lookups: api.lookups, existing: api.artifacts })),
    [table, map, api.lookups, api.artifacts],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setTable(parsed);
    setFileName(file.name);
    setMap(suggestArtifactColumnMap(parsed[0] ?? []));
    setDone(null);
  }

  async function commit() {
    if (!plan || plan.rows.length === 0 || plan.errors.length > 0) return;
    setBusy(true);
    try {
      const result = await api.importArtifacts(plan.rows);
      setDone(`Imported ${result.created} new artifact${result.created === 1 ? "" : "s"} and updated ${result.updated}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card preview-card" role="dialog" aria-modal="true" aria-labelledby="artifact-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="micro">Artifact import</p>
        <h2 id="artifact-import-title">Import CSV</h2>
        <p className="lede">Map columns, check the preview, then bring the rows into this workspace. A matching name updates that artifact.</p>
        <label className="btn btn-secondary">
          Choose CSV
          <input
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            aria-label="Artifact CSV file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onFile(file);
            }}
          />
        </label>
        {fileName ? <p className="hint">{fileName}</p> : null}
        {headers.length > 0 ? (
          <div className="map-grid">
            {MAP_FIELDS.map((field) => (
              <label key={field.key}>
                <span className="micro">
                  {field.label}
                  {field.required ? " (required)" : ""}
                </span>
                <select
                  className="select"
                  aria-label={field.label}
                  value={map[field.key] == null ? "" : String(map[field.key])}
                  onChange={(event) =>
                    setMap((current) => ({
                      ...current,
                      [field.key]: event.target.value === "" ? null : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">Not mapped</option>
                  {headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
        {plan ? (
          <>
            {plan.errors.map((error) => (
              <p className="hint" key={error} role="alert">
                {error}
              </p>
            ))}
            <p>
              {plan.totalRows} parsed rows · {plan.creates} new · {plan.updates} updated · {plan.skippedBlank} skipped blank
            </p>
            <div className="table-wrap">
              <table className="catalog">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Visibility</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {plan.preview.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.artifact_type}</td>
                      <td>{row.visibility === "public" ? "Public" : "Internal"}</td>
                      <td>{row.action === "create" ? "New" : "Update"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.rows.length > plan.preview.length ? <p className="hint">Showing the first {plan.preview.length} rows.</p> : null}
          </>
        ) : null}
        {done ? <p role="status">{done}</p> : null}
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !plan || plan.rows.length === 0 || plan.errors.length > 0} onClick={() => void commit()}>
            {busy ? "Importing…" : "Import rows"}
          </button>
        </div>
      </div>
    </div>
  );
}
