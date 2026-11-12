"use client";

import { useMemo, useState } from "react";
import { artifactCsvSection, artifactExportRows } from "@/lib/catalog/artifacts";
import { buildCatalogDocument } from "@/lib/catalog/catalog-document";
import { buildCatalogWorkbook } from "@/lib/catalog/catalog-workbook";
import { distributionMarking, servicesToCsv, type CsvVisibility } from "@/lib/catalog/csv";
import { buildDocx } from "@/lib/catalog/docx";
import {
  exportFileName,
  fullPreset,
  INTERNAL_EXPORT_CONFIRMATION,
  publicPreset,
  resolveExportSelection,
  sanitizeExportLog,
  type ExportFormat,
  type ResolvedExport,
} from "@/lib/catalog/export-plan";
import {
  buildMappedCsv,
  JIRA_PRESET,
  mappingFromPreset,
  mappingTemplateCsv,
  previewMappedRows,
  resolveMappedColumns,
  SERVICENOW_PRESET,
  type TargetMapping,
} from "@/lib/catalog/import-presets";
import { catalogJsonFile } from "@/lib/catalog/json-catalog";
import { buildCatalogPdf, loadPdfFonts } from "@/lib/catalog/pdf-catalog";
import { localToday } from "@/lib/catalog/present";
import type { FrameworkElement, FrameworkRelease } from "@/lib/catalog/framework";
import type {
  Artifact,
  ArtifactLink,
  ExportProfile,
  FieldDefinition,
  LookupOption,
  OutcomeMapping,
  ServiceRecord,
  Visibility,
} from "@/lib/catalog/types";

function pinnedPublicName(field: FieldDefinition): boolean {
  return field.field_key === "name" && field.visibility === "public";
}

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string }> = [
  { id: "csv", label: "CSV", hint: "Selected service fields, then supporting artifact links." },
  { id: "xlsx", label: "Excel workbook", hint: "Services, fields, lookups, mappings, coverage, and an Artifacts sheet." },
  { id: "docx", label: "Word", hint: "Editable catalog with a header and footer." },
  { id: "pdf", label: "PDF", hint: "Paginated catalog for reading and sharing." },
  { id: "json", label: "JSON", hint: "Selected fields, linked artifacts, and CSF mappings. Built in the browser." },
  { id: "jira", label: "Jira CSV preset", hint: "Local file only. Not a Jira connection. Artifact links stay in the catalog files." },
  { id: "servicenow", label: "ServiceNow CSV preset", hint: "Local file only. Not an instance update. Artifact links stay in the catalog files." },
];

export function ExportDialog({
  services,
  fields,
  lookups,
  companyName,
  slug,
  logoUrl,
  profiles,
  canAdmin,
  elements,
  frameworks,
  mappings,
  tenantId,
  artifacts = [],
  artifactLinks = [],
  onClose,
  onSaveProfile,
  onDeleteProfile,
  onRecordExport,
}: {
  services: ServiceRecord[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
  companyName: string;
  slug: string;
  logoUrl: string | null;
  profiles: ExportProfile[];
  canAdmin: boolean;
  elements: FrameworkElement[];
  frameworks: FrameworkRelease[];
  mappings: OutcomeMapping[];
  tenantId: string;
  artifacts?: Artifact[];
  artifactLinks?: ArtifactLink[];
  onClose: () => void;
  onSaveProfile: (input: {
    id?: string;
    name: string;
    audience: Visibility;
    fieldKeys: string[];
    isDefault: boolean;
  }) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onRecordExport: (meta: ReturnType<typeof sanitizeExportLog>) => Promise<void>;
}) {
  const initial = profiles.find((profile) => profile.is_default);
  const [choice, setChoice] = useState(initial ? `profile:${initial.id}` : "public");
  const [customKeys, setCustomKeys] = useState<string[]>(() => publicPreset(fields).fields.map((field) => field.field_key));
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [includeMarking, setIncludeMarking] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [jiraMap, setJiraMap] = useState<TargetMapping[]>(() => mappingFromPreset(JIRA_PRESET));
  const [snowMap, setSnowMap] = useState<TargetMapping[]>(() => mappingFromPreset(SERVICENOW_PRESET));
  const [profileName, setProfileName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeFields = useMemo(
    () => fields.filter((field) => field.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );
  const resolved = useMemo(() => resolveChoice(choice, fields, profiles, customKeys), [choice, fields, profiles, customKeys]);
  const preset = format === "jira" ? jiraMap : snowMap;
  const audience: Visibility = resolved.audience;
  const mapped =
    format === "jira" || format === "servicenow" ? resolveMappedColumns(fields, preset, audience) : null;
  const requiresConfirmation = audience === "internal";
  const marking = distributionMarking(companyName, audience === "public" ? "public" : "all");
  const previewRows =
    mapped != null ? previewMappedRows(services, lookups, mapped.columns) : [];
  const artifactPreview = useMemo(
    () =>
      artifactExportRows({
        audience,
        includeServiceCode: resolved.fields.some((field) => field.field_key === "service_code"),
        services,
        artifacts,
        links: artifactLinks,
        lookups,
        today: localToday(),
      }),
    [audience, resolved.fields, services, artifacts, artifactLinks, lookups],
  );

  function requestDownload() {
    if (services.length === 0) return;
    if (requiresConfirmation) {
      setConfirming(true);
      return;
    }
    void download();
  }

  async function download() {
    setBusy(true);
    setNotice(null);
    try {
      const included = mapped ? mapped.columns.map((column) => column.field) : resolved.fields;
      await onRecordExport(
        sanitizeExportLog({
          format,
          profile_id: format === "jira" || format === "servicenow" ? format : resolved.profileId,
          profile_name: format === "jira" ? JIRA_PRESET.title : format === "servicenow" ? SERVICENOW_PRESET.title : resolved.profileName,
          audience,
          field_count: included.length,
          row_count: services.length,
          marking: includeMarking,
          framework_codes: frameworks.map((framework) => framework.code),
        }),
      );
      const fileMarking = includeMarking ? marking : null;
      if (format === "csv") {
        const csvVisibility: CsvVisibility = audience === "public" ? "public" : "all";
        const servicesCsv = servicesToCsv(services, fields, lookups, csvVisibility, { marking: fileMarking, columns: resolved.fields });
        const artifactsCsv = artifactCsvSection({
          audience,
          includeServiceCode: resolved.fields.some((field) => field.field_key === "service_code"),
          services,
          artifacts,
          links: artifactLinks,
          lookups,
          today: localToday(),
          marking: fileMarking,
        });
        saveText(`${servicesCsv}\r\n\r\n${artifactsCsv}`, exportFileName(slug, audience, "csv"), "text/csv;charset=utf-8");
      } else if (format === "jira" || format === "servicenow") {
        const columns = mapped?.columns ?? [];
        saveText(
          buildMappedCsv({ services, lookups, columns, marking: fileMarking }),
          exportFileName(slug, audience, format),
          "text/csv;charset=utf-8",
        );
      } else if (format === "xlsx") {
        const bytes = buildCatalogWorkbook({
          services,
          fields: resolved.fields,
          lookups,
          mappings,
          elements,
          frameworks,
          tenantId,
          audience,
          marking: fileMarking,
          artifacts,
          artifactLinks,
          today: localToday(),
        });
        saveBytes(bytes, exportFileName(slug, audience, "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else if (format === "docx") {
        const doc = buildCatalogDocument({
          workspaceName: companyName,
          logoUrl,
          audience,
          marking: fileMarking,
          generatedOn: localToday(),
          services,
          fields: resolved.fields,
          lookups,
          artifacts,
          artifactLinks,
          today: localToday(),
        });
        saveBytes(buildDocx(doc), exportFileName(slug, audience, "docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      } else if (format === "json") {
        const file = catalogJsonFile({
          workspaceName: companyName,
          slug,
          logoUrl,
          audience,
          profileName: resolved.profileName,
          profileId: resolved.profileId,
          marking: fileMarking,
          exportedAt: new Date().toISOString(),
          services,
          fields: resolved.fields,
          lookups,
          artifacts,
          artifactLinks,
          mappings,
          elements,
          frameworks,
          tenantId,
          today: localToday(),
        });
        saveText(file.body, file.filename, file.mime);
      } else {
        const doc = buildCatalogDocument({
          workspaceName: companyName,
          logoUrl,
          audience,
          marking: fileMarking,
          generatedOn: localToday(),
          services,
          fields: resolved.fields,
          lookups,
          artifacts,
          artifactLinks,
          today: localToday(),
        });
        const bytes = await buildCatalogPdf(doc, await loadPdfFonts());
        saveBytes(bytes, exportFileName(slug, audience, "pdf"), "application/pdf");
      }
      onClose();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The export could not be prepared.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    if (!mapped) return;
    const notes = new Map((format === "jira" ? jiraMap : snowMap).map((column) => [column.sourceKey, column.note]));
    saveText(
      mappingTemplateCsv(mapped.columns, notes),
      `${slug || "catalog"}-${format}-mapping-template.csv`,
      "text/csv;charset=utf-8",
    );
  }

  async function saveProfile() {
    setNotice(null);
    try {
      const audienceForSave = resolved.audience;
      await onSaveProfile({
        name: profileName,
        audience: audienceForSave,
        fieldKeys: resolved.fields.map((field) => field.field_key),
        isDefault: makeDefault,
      });
      setNotice(`Saved “${profileName.trim()}” as ${audienceForSave === "internal" ? "internal" : "public"}.`);
      setProfileName("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The profile could not be saved.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="micro">Export</p>
        <h2 id="export-title">Export catalog</h2>
        <p className="lede">
          {services.length} {services.length === 1 ? "service" : "services"} in the current search and filters. Retired
          fields stay out. A public file includes the service name and other public fields. Service code is included when that field is public, or in a full export.
        </p>

        <fieldset className="export-set">
          <legend className="micro">Audience profile</legend>
          <ProfileChoice
            name="Public catalog"
            hint="Active public fields, in catalog order."
            checked={choice === "public"}
            onChange={() => setChoice("public")}
          />
          <ProfileChoice
            name="Full catalog"
            hint="Active public and internal fields. Asks before download."
            checked={choice === "full"}
            onChange={() => setChoice("full")}
          />
          {profiles.map((profile) => (
            <ProfileChoice
              key={profile.id}
              name={profile.name}
              hint={`${profile.audience === "internal" ? "Internal" : "Public"} · ${profile.field_keys.length} fields${profile.is_default ? " · workspace default" : ""}`}
              checked={choice === `profile:${profile.id}`}
              onChange={() => setChoice(`profile:${profile.id}`)}
              onDelete={
                canAdmin
                  ? () => {
                      void onDeleteProfile(profile.id).catch((error: unknown) => {
                        setNotice(error instanceof Error ? error.message : "The profile could not be deleted.");
                      });
                      if (choice === `profile:${profile.id}`) setChoice("public");
                    }
                  : undefined
              }
            />
          ))}
          <ProfileChoice
            name="Custom fields"
            hint="Choose fields for this download. Saving a profile is limited to workspace admins."
            checked={choice === "custom"}
            onChange={() => setChoice("custom")}
          />
        </fieldset>

        {choice === "custom" ? (
          <FieldPicker fields={activeFields} keys={customKeys} onChange={setCustomKeys} />
        ) : null}

        <div className="export-preview" aria-live="polite">
          <p className="micro">Included in this file</p>
          <p>
            <strong>{audience === "internal" ? "Internal" : "Public"}</strong>
            {" · "}
            {(mapped ? mapped.columns.map((column) => column.field.label) : resolved.fields.map((field) => field.label)).join(", ")}
          </p>
          {format === "jira" || format === "servicenow" ? (
            <p className="hint">Artifact links stay out of the Jira and ServiceNow presets. They are in the catalog CSV, Excel, Word, PDF, and JSON files.</p>
          ) : (
            <p className="hint">
              Supporting artifacts: {artifactPreview.rows.length}{" "}
              {artifactPreview.rows.length === 1 ? "row" : "rows"}
              {audience === "public" ? ". Internal artifact names and links are omitted." : "."}
            </p>
          )}
          {resolved.excludedInternal.length > 0 && format !== "jira" && format !== "servicenow" ? (
            <p className="hint">
              Left out of this public file: {resolved.excludedInternal.map((field) => field.label).join(", ")}.
            </p>
          ) : null}
          {mapped && mapped.excludedInternal.length > 0 ? (
            <p className="hint">
              Left out of this public file: {mapped.excludedInternal.map((field) => field.label).join(", ")}.
            </p>
          ) : null}
          {resolved.excludedRetired.length > 0 ? (
            <p className="hint">Retired fields left out: {resolved.excludedRetired.join(", ")}.</p>
          ) : null}
        </div>

        <fieldset className="export-set">
          <legend className="micro">Format</legend>
          <div className="format-grid">
            {FORMATS.map((item) => (
              <label key={item.id} className="export-choice">
                <input type="radio" name="export-format" checked={format === item.id} onChange={() => setFormat(item.id)} />
                <span>
                  <strong>{item.label}</strong>
                  <span className="hint">{item.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {format === "jira" || format === "servicenow" ? (
          <PresetEditor
            title={format === "jira" ? JIRA_PRESET.title : SERVICENOW_PRESET.title}
            disclaimer={format === "jira" ? JIRA_PRESET.disclaimer : SERVICENOW_PRESET.disclaimer}
            mappings={preset}
            fields={activeFields}
            headers={mapped?.columns.map((column) => column.target) ?? []}
            preview={previewRows}
            onChange={format === "jira" ? setJiraMap : setSnowMap}
            onTemplate={downloadTemplate}
          />
        ) : null}

        <p className="micro" style={{ marginTop: 12 }}>
          Distribution marking
        </p>
        <p className="marking-preview">{marking}</p>
        <label className="check">
          <input type="checkbox" checked={includeMarking} onChange={(event) => setIncludeMarking(event.target.checked)} />
          Include distribution marking
        </label>
        {includeMarking ? null : <p className="hint">The marking stays off this file.</p>}

        {canAdmin ? (
          <div className="profile-save">
            <p className="micro">Save workspace profile</p>
            <div className="row-actions">
              <input
                className="input"
                aria-label="Profile name"
                placeholder="Profile name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
              />
              <button type="button" className="btn btn-secondary" onClick={() => void saveProfile()} disabled={profileName.trim().length < 2}>
                Save profile
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />
              Use as the workspace default
            </label>
            <p className="hint">
              Saved as {resolved.audience === "internal" ? "internal" : "public"}. A public profile cannot keep internal fields.
            </p>
          </div>
        ) : (
          <p className="hint">Admins save profiles. You can use a saved profile or a one-time custom field list.</p>
        )}
        {notice ? <p className="hint">{notice}</p> : null}

        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={requestDownload} disabled={services.length === 0 || busy}>
            {busy ? "Preparing…" : downloadLabel(format)}
          </button>
        </div>
      </div>
      {confirming ? (
        <div
          className="modal-backdrop confirm-layer"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation();
            setConfirming(false);
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Internal use only"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>Internal use only</h2>
            <p className="lede">{INTERNAL_EXPORT_CONFIRMATION}</p>
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={busy}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function resolveChoice(choice: string, fields: FieldDefinition[], profiles: ExportProfile[], customKeys: string[]): ResolvedExport {
  if (choice === "full") return fullPreset(fields);
  if (choice === "custom") {
    const audience = customKeys.some((key) => fields.some((field) => field.field_key === key && field.is_active && field.visibility === "internal"))
      ? "internal"
      : "public";
    return resolveExportSelection({
      fields,
      declaredAudience: audience,
      requestedKeys: customKeys,
      profileName: "Custom fields",
      profileId: null,
    });
  }
  if (choice.startsWith("profile:")) {
    const profile = profiles.find((item) => item.id === choice.slice("profile:".length));
    if (profile) {
      return resolveExportSelection({
        fields,
        declaredAudience: profile.audience,
        requestedKeys: profile.field_keys,
        profileName: profile.name,
        profileId: profile.id,
      });
    }
  }
  return publicPreset(fields);
}

function ProfileChoice({
  name,
  hint,
  checked,
  onChange,
  onDelete,
}: {
  name: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="export-choice">
      <label>
        <input type="radio" name="export-profile" checked={checked} onChange={onChange} />
        <span>
          <strong>{name}</strong>
          <span className="hint">{hint}</span>
        </span>
      </label>
      {onDelete ? (
        <button type="button" className="btn btn-ghost" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

function FieldPicker({
  fields,
  keys,
  onChange,
}: {
  fields: FieldDefinition[];
  keys: string[];
  onChange: (keys: string[]) => void;
}) {
  function toggle(field: FieldDefinition) {
    if (pinnedPublicName(field)) return;
    if (keys.includes(field.field_key)) onChange(keys.filter((key) => key !== field.field_key));
    else onChange([...keys, field.field_key]);
  }
  function move(key: string, direction: -1 | 1) {
    const index = keys.indexOf(key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= keys.length) return;
    const copy = keys.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    onChange(copy);
  }
  return (
    <div className="field-picker">
      <p className="micro">Fields for this download</p>
      <ul>
        {fields.map((field) => {
          const checked = pinnedPublicName(field) || keys.includes(field.field_key);
          return (
            <li key={field.field_key}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pinnedPublicName(field)}
                  onChange={() => toggle(field)}
                />
                <span>
                  {field.label}
                  {field.visibility === "internal" ? " · Internal" : ""}
                  {field.field_group ? ` · ${field.field_group}` : ""}
                </span>
              </label>
              {checked && !pinnedPublicName(field) ? (
                <span className="row-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => move(field.field_key, -1)} aria-label={`Move ${field.label} up`}>
                    Up
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => move(field.field_key, 1)} aria-label={`Move ${field.label} down`}>
                    Down
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PresetEditor({
  title,
  disclaimer,
  mappings,
  fields,
  headers,
  preview,
  onChange,
  onTemplate,
}: {
  title: string;
  disclaimer: string;
  mappings: TargetMapping[];
  fields: FieldDefinition[];
  headers: string[];
  preview: string[][];
  onChange: (mappings: TargetMapping[]) => void;
  onTemplate: () => void;
}) {
  return (
    <div className="preset-editor">
      <p className="micro">{title}</p>
      <p className="hint">{disclaimer}</p>
      {mappings.map((mapping) => (
        <div className="preset-row" key={mapping.id}>
          <input
            className="input"
            aria-label={`Target column for ${mapping.sourceKey}`}
            value={mapping.target}
            onChange={(event) =>
              onChange(mappings.map((item) => (item.id === mapping.id ? { ...item, target: event.target.value } : item)))
            }
          />
          <select
            className="select"
            aria-label={`Catalog field for ${mapping.target}`}
            value={mapping.sourceKey}
            onChange={(event) =>
              onChange(mappings.map((item) => (item.id === mapping.id ? { ...item, sourceKey: event.target.value } : item)))
            }
          >
            {fields.map((field) => (
              <option key={field.field_key} value={field.field_key}>
                {field.label}
                {field.visibility === "internal" ? " (internal)" : ""}
              </option>
            ))}
          </select>
        </div>
      ))}
      <p className="hint">Columns: {headers.join(", ") || "Service code and name"}.</p>
      {preview.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${index}-${cellIndex}`}>{cell || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <button type="button" className="btn btn-secondary" onClick={onTemplate}>
        Download mapping template
      </button>
    </div>
  );
}

function downloadLabel(format: ExportFormat): string {
  switch (format) {
    case "csv":
      return "Download CSV";
    case "xlsx":
      return "Download Excel";
    case "docx":
      return "Download Word";
    case "pdf":
      return "Download PDF";
    case "json":
      return "Download JSON";
    case "jira":
      return "Download Jira CSV";
    case "servicenow":
      return "Download ServiceNow CSV";
  }
}

function saveText(contents: string, name: string, type: string) {
  saveBytes(new TextEncoder().encode(contents), name, type);
}

function saveBytes(bytes: Uint8Array, name: string, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
