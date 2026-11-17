"use client";

import { useMemo, useState } from "react";
import { parseCsv } from "@/lib/catalog/lookup-csv";
import { displayServiceOwner } from "@/lib/catalog/owner-names";
import {
  emptyServiceColumnMap,
  planServiceImport,
  serviceImportTargets,
  serviceTemplateCsv,
  suggestServiceColumnMap,
  type ServiceColumnMap,
} from "@/lib/catalog/service-import";
import { useCatalog } from "@/components/catalog-provider";

export function ServiceImportControls() {
  const [open, setOpen] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([serviceTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "service-import-template.csv";
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
  const targets = useMemo(() => serviceImportTargets(api.fields), [api.fields]);
  const [table, setTable] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ServiceColumnMap>(() => emptyServiceColumnMap(api.fields));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const headers = table[0] ?? [];
  const plan = useMemo(
    () =>
      table.length === 0
        ? null
        : planServiceImport({
            table,
            map,
            fields: api.fields,
            lookups: api.lookups,
            existing: api.services,
          }),
    [table, map, api.fields, api.lookups, api.services],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setTable(parsed);
    setFileName(file.name);
    setMap(suggestServiceColumnMap(parsed[0] ?? [], api.fields));
    setDone(null);
  }

  async function commit() {
    if (!plan || plan.rows.length === 0 || plan.errors.length > 0) return;
    setBusy(true);
    try {
      const result = await api.importServices(plan.rows);
      setDone(`Imported ${result.created} new service${result.created === 1 ? "" : "s"} and updated ${result.updated}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card preview-card" role="dialog" aria-modal="true" aria-labelledby="service-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="micro">Service import</p>
        <h2 id="service-import-title">Import CSV</h2>
        <p className="lede">
          Map a first-name column and a last-name column, or one full-name column. A person is stored as Last, First. A role stays as written.
        </p>
        <label className="btn btn-secondary">
          Choose CSV
          <input
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            aria-label="Service CSV file"
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
            {targets.map((target) => (
              <label key={target.key}>
                <span className="micro">
                  {target.label}
                  {target.required ? " (required)" : ""}
                </span>
                <select
                  className="select"
                  aria-label={target.label}
                  value={map[target.key] == null ? "" : String(map[target.key])}
                  onChange={(event) =>
                    setMap((current) => ({
                      ...current,
                      [target.key]: event.target.value === "" ? null : Number(event.target.value),
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
                    <th>Service</th>
                    <th>Code</th>
                    <th>Service Owner</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {plan.preview.map((row) => (
                    <tr key={`${row.line}-${row.service_code ?? row.name}`}>
                      <td>{row.name}</td>
                      <td className="code">{row.service_code ?? "Assigned on import"}</td>
                      <td>{displayServiceOwner(row.service_owner) || "—"}</td>
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
