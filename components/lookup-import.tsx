"use client";

import { useMemo, useState } from "react";
import {
  lookupTemplateCsv,
  parseCsv,
  planLookupImport,
  suggestColumnMap,
  templateFileName,
  type ColumnMap,
} from "@/lib/catalog/lookup-csv";
import { useCatalog } from "@/components/catalog-provider";

export function LookupImportControls({ fieldKey }: { fieldKey: string }) {
  const [open, setOpen] = useState(false);

  function downloadTemplate() {
    const csv = lookupTemplateCsv(fieldKey);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = templateFileName(fieldKey);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="row-actions">
        <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
          Download CSV template
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Import CSV
        </button>
      </div>
      {open ? <ImportModal fieldKey={fieldKey} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImportModal({ fieldKey, onClose }: { fieldKey: string; onClose: () => void }) {
  const api = useCatalog();
  const [table, setTable] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ColumnMap>({ label: null, code: null, description: null, code_prefix: null });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const headers = table[0] ?? [];
  const existing = api.lookups.filter((option) => option.field_key === fieldKey).map((option) => option.code);
  const plan = useMemo(
    () => (table.length === 0 ? null : planLookupImport({ table, map, existingCodes: existing, fieldKey })),
    [table, map, existing, fieldKey],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setTable(parsed);
    setFileName(file.name);
    setMap(suggestColumnMap(parsed[0] ?? []));
    setDone(null);
  }

  async function commit() {
    if (!plan || plan.rows.length === 0 || plan.errors.length > 0) return;
    setBusy(true);
    try {
      const result = await api.importLookups(
        fieldKey,
        plan.rows.map((row) => ({
          code: row.code,
          label: row.label,
          description: row.description,
          code_prefix: row.code_prefix,
        })),
      );
      setDone(`Imported ${result.created} new option${result.created === 1 ? "" : "s"} and updated ${result.updated}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card preview-card" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="micro">Bulk import</p>
        <h2 id="import-title">Import CSV</h2>
        <p className="lede">Map columns, check the preview, then commit the whole file in one pass.</p>
        <label className="btn btn-secondary">
          Choose CSV
          <input
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
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
            <MapSelect label="Label" required headers={headers} value={map.label} onChange={(label) => setMap({ ...map, label })} />
            <MapSelect label="Code" headers={headers} value={map.code} onChange={(code) => setMap({ ...map, code })} />
            <MapSelect label="Hover description" headers={headers} value={map.description} onChange={(description) => setMap({ ...map, description })} />
            {fieldKey === "category" ? (
              <MapSelect label="Code prefix" headers={headers} value={map.code_prefix} onChange={(code_prefix) => setMap({ ...map, code_prefix })} />
            ) : null}
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
              {plan.totalRows} parsed rows · {plan.creates} new · {plan.updates} updated or reactivated · {plan.skippedBlank} skipped blank
            </p>
            <div className="table-wrap">
              <table className="catalog">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Label</th>
                    <th>Description</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {plan.preview.map((row) => (
                    <tr key={row.code}>
                      <td className="code">{row.code}</td>
                      <td>{row.label}</td>
                      <td>{row.description ?? "—"}</td>
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

function MapSelect({
  label,
  required,
  headers,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  headers: string[];
  value: number | null;
  onChange: (index: number | null) => void;
}) {
  return (
    <label>
      <span className="micro">
        {label}
        {required ? " (required)" : ""}
      </span>
      <select
        className="select"
        aria-label={label}
        value={value == null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      >
        <option value="">Not mapped</option>
        {headers.map((header, index) => (
          <option key={`${header}-${index}`} value={index}>
            {header || `Column ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
