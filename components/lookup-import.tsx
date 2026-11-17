"use client";

import { useMemo, useState } from "react";
import { importOwnersAction, saveOwnerAction } from "@/app/actions/workspace";
import {
  isServiceOwnerLookup,
  lookupTemplateCsv,
  parseCsv,
  planLookupImport,
  planOwnerDirectoryWrites,
  planOwnerLookupImport,
  suggestColumnMap,
  suggestOwnerColumnMap,
  templateFileName,
  type ColumnMap,
  type OwnerColumnMap,
} from "@/lib/catalog/lookup-csv";
import type { PlannedOwnerImport } from "@/lib/catalog/owner-names";
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
  const ownerList = isServiceOwnerLookup(fieldKey);
  const [table, setTable] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ColumnMap>({ label: null, code: null, description: null, code_prefix: null });
  const [ownerMap, setOwnerMap] = useState<OwnerColumnMap>({
    firstName: null,
    lastName: null,
    fullName: null,
    employeeId: null,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const headers = table[0] ?? [];
  const existing = api.lookups.filter((option) => option.field_key === fieldKey).map((option) => option.code);
  const plan = useMemo(
    () => (table.length === 0 || ownerList ? null : planLookupImport({ table, map, existingCodes: existing, fieldKey })),
    [table, map, existing, fieldKey, ownerList],
  );
  const ownerPlan = useMemo(
    () => (table.length === 0 || !ownerList ? null : planOwnerLookupImport({ table, map: ownerMap, existingCodes: existing })),
    [table, ownerMap, existing, ownerList],
  );
  const activePlan = ownerList ? ownerPlan : plan;

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setTable(parsed);
    setFileName(file.name);
    const header = parsed[0] ?? [];
    if (ownerList) setOwnerMap(suggestOwnerColumnMap(header));
    else setMap(suggestColumnMap(header));
    setDone(null);
  }

  async function commit() {
    if (ownerList) {
      if (!ownerPlan || ownerPlan.rows.length === 0 || ownerPlan.errors.length > 0) return;
      setBusy(true);
      try {
        const result = await api.importLookups(
          fieldKey,
          ownerPlan.rows.map((row) => ({
            code: row.code,
            label: row.displayName,
            description: null,
            code_prefix: null,
          })),
        );
        try {
          await saveOwnerDirectory(ownerPlan.rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : "The owner directory could not be updated.";
          setDone(`The dropdown list was saved. ${message}`);
          return;
        }
        setDone(
          `Imported ${result.created} new owner${result.created === 1 ? "" : "s"} and updated ${result.updated}. Names are shown as Last, First.`,
        );
      } finally {
        setBusy(false);
      }
      return;
    }
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

  async function saveOwnerDirectory(rows: NonNullable<typeof ownerPlan>["rows"]) {
    const writes = planOwnerDirectoryWrites({
      rows,
      owners: api.owners.map((owner) => ({ id: owner.id, firstName: owner.first_name, lastName: owner.last_name })),
      previousLabels: api.lookups
        .filter((option) => option.field_key === fieldKey)
        .map((option) => ({ code: option.code, label: option.label })),
    });
    const creates: PlannedOwnerImport[] = writes
      .filter((write) => write.id == null)
      .map((write, index) => ({
        line: index + 2,
        status: "ready",
        firstName: write.firstName,
        lastName: write.lastName,
        email: null,
        title: null,
        teamCode: null,
        sourceName: `${write.lastName}, ${write.firstName}`,
        reason: null,
      }));
    const updates = writes.filter((write): write is { id: string; firstName: string; lastName: string } => write.id != null);
    if (api.demo) {
      for (const update of updates) {
        const current = api.owners.find((owner) => owner.id === update.id);
        const result = api.demoDispatch({
          type: "save-owner",
          id: update.id,
          firstName: update.firstName,
          lastName: update.lastName,
          email: current?.email ?? "",
          title: current?.title ?? "",
          teamCode: current?.team_code ?? "",
          userId: current?.user_id ?? "",
        });
        if (!result.ok) throw new Error(result.error);
      }
      if (creates.length > 0) {
        const result = api.demoDispatch({ type: "import-owners", rows: creates });
        if (!result.ok) throw new Error(result.error);
      }
      return;
    }
    if (!api.activeTenant) throw new Error("Choose a workspace.");
    for (const update of updates) {
      const current = api.owners.find((owner) => owner.id === update.id);
      const saved = await saveOwnerAction({
        tenantId: api.activeTenant.id,
        id: update.id,
        firstName: update.firstName,
        lastName: update.lastName,
        email: current?.email ?? "",
        title: current?.title ?? "",
        teamCode: current?.team_code ?? "",
        userId: current?.user_id ?? "",
      });
      if (!saved.ok) throw new Error(saved.error);
    }
    if (creates.length > 0) {
      const saved = await importOwnersAction(api.activeTenant.id, creates);
      if (!saved.ok) throw new Error(saved.error);
    }
    await api.refresh();
  }

  const firstRequired = ownerMap.fullName == null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card preview-card" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="micro">Bulk import</p>
        <h2 id="import-title">Import CSV</h2>
        <p className="lede">
          {ownerList
            ? "Map a first name and a last name, or one full-name column. The name people pick is Last, First. The same employee id updates that person instead of adding a second row."
            : "Map columns, check the preview, then commit the whole file in one pass."}
        </p>
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
        {headers.length > 0 && ownerList ? (
          <div className="map-grid">
            <MapSelect
              label="First name"
              hint="Given name. Required unless you map Full name instead."
              required={firstRequired}
              headers={headers}
              value={ownerMap.firstName}
              onChange={(firstName) => setOwnerMap({ ...ownerMap, firstName })}
            />
            <MapSelect
              label="Last name"
              hint="Family name. Combined with the first name as Last, First."
              headers={headers}
              value={ownerMap.lastName}
              onChange={(lastName) => setOwnerMap({ ...ownerMap, lastName })}
            />
            <MapSelect
              label="Full name (single column)"
              hint="Use this when the file has one name column instead of first and last."
              headers={headers}
              value={ownerMap.fullName}
              onChange={(fullName) => setOwnerMap({ ...ownerMap, fullName })}
            />
            <MapSelect
              label="Employee ID"
              hint="Optional. Stored as the unique id so a later import updates the same person."
              headers={headers}
              value={ownerMap.employeeId}
              onChange={(employeeId) => setOwnerMap({ ...ownerMap, employeeId })}
            />
          </div>
        ) : null}
        {headers.length > 0 && !ownerList ? (
          <div className="map-grid">
            <MapSelect
              label="Display name (what users pick in the dropdown)"
              hint="The words people see when they choose this option."
              required
              headers={headers}
              value={map.label}
              onChange={(label) => setMap({ ...map, label })}
            />
            <MapSelect
              label="Unique ID (optional, used to match rows on re-import)"
              hint="Leave unmapped and a new id is made from the display name. The same id updates that row."
              headers={headers}
              value={map.code}
              onChange={(code) => setMap({ ...map, code })}
            />
            <MapSelect
              label="Tooltip text (optional, shown when hovering an option)"
              hint="Extra explanation. It is not the name in the dropdown."
              headers={headers}
              value={map.description}
              onChange={(description) => setMap({ ...map, description })}
            />
            {fieldKey === "category" ? (
              <MapSelect
                label="Code prefix"
                hint="Optional short prefix used when service ids include the category."
                headers={headers}
                value={map.code_prefix}
                onChange={(code_prefix) => setMap({ ...map, code_prefix })}
              />
            ) : null}
          </div>
        ) : null}
        {ownerPlan ? (
          <>
            {ownerPlan.errors.map((error) => (
              <p className="hint" key={error} role="alert">
                {error}
              </p>
            ))}
            <p>
              {ownerPlan.totalRows} parsed rows · {ownerPlan.creates} new · {ownerPlan.updates} updated or reactivated · {ownerPlan.skippedBlank} skipped blank
            </p>
            <div className="table-wrap">
              <table className="catalog">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>First name</th>
                    <th>Last name</th>
                    <th>Display name</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ownerPlan.preview.map((row) => (
                    <tr key={row.code}>
                      <td className="code">{row.code}</td>
                      <td>{row.firstName || "—"}</td>
                      <td>{row.lastName || "—"}</td>
                      <td>{row.displayName}</td>
                      <td>{row.action === "create" ? "New" : "Update"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ownerPlan.rows.length > ownerPlan.preview.length ? <p className="hint">Showing the first {ownerPlan.preview.length} rows.</p> : null}
          </>
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
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !activePlan || activePlan.rows.length === 0 || activePlan.errors.length > 0}
            onClick={() => void commit()}
          >
            {busy ? "Importing…" : "Import rows"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MapSelect({
  label,
  hint,
  required,
  headers,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
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
      {hint ? (
        <span className="hint" style={{ display: "block" }}>
          {hint}
        </span>
      ) : null}
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
