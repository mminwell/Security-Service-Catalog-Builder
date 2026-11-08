"use client";

import { useState } from "react";
import { elementsInScope } from "@/lib/catalog/framework-catalog";
import { frameworkImportTemplate, planFrameworkImport } from "@/lib/catalog/framework-import";
import type { FrameworkRelease } from "@/lib/catalog/framework";
import { useCatalog } from "@/components/catalog-provider";

export function FrameworkImportPanel({ framework }: { framework: FrameworkRelease }) {
  const api = useCatalog();
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(
    elementsInScope(api.elements, framework, api.activeTenant?.id ?? "").map((element) => element.code),
  );
  const plan = csv.trim() ? planFrameworkImport({ framework, csv, existingCodes: existing }) : null;

  function downloadTemplate() {
    const text = frameworkImportTemplate(framework.version);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${framework.code}-import-template.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function commit() {
    if (!plan || plan.errors.length > 0 || plan.rows.length === 0) return;
    setError(null);
    try {
      await api.importFramework(framework.id, plan.rows);
      setMessage(`Imported ${plan.creates} new and updated ${plan.updates}. Importing the same file again updates those rows.`);
      setCsv("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import did not save.");
    }
  }

  return (
    <div className="import-panel">
      <p className="micro">Authorized import</p>
      <p className="hint">
        CSV columns: id, parent, title, outcome, version. Version must be {framework.version}. The file stays in this
        workspace. It is not sent to the standards body, and it does not create a crosswalk.
      </p>
      <div className="row-actions">
        <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
          Download CSV template
        </button>
      </div>
      <textarea
        className="textarea"
        aria-label={`Authorized ${framework.code} CSV`}
        placeholder="Paste the authorized CSV here, or choose a file."
        value={csv}
        onChange={(event) => {
          setCsv(event.target.value);
          setMessage(null);
          setError(null);
        }}
      />
      <label className="btn btn-secondary">
        Choose CSV
        <input
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then((text) => {
              setCsv(text);
              setMessage(null);
              setError(null);
            });
          }}
        />
      </label>
      {plan && plan.errors.length > 0 ? (
        <ul className="field-error">
          {plan.errors.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {plan && plan.errors.length === 0 ? (
        <>
          <p>
            {plan.creates} to add, {plan.updates} to update. Preview:
          </p>
          <ul>
            {plan.preview.map((row) => (
              <li key={row.code}>
                <span className="code">{row.code}</span> {row.title} · {row.elementType} · {row.action}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => void commit()}>
            Import into this workspace
          </button>
        </>
      ) : null}
      {message ? <p className="saved-banner">{message}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
