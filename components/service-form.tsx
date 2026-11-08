"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fieldUsesLookup } from "@/lib/catalog/lookup-toggle";
import { activeOptions, optionByCode } from "@/lib/catalog/lookups";
import { completenessTone, formatDate, gapText } from "@/lib/catalog/present";
import { suggestServiceCode } from "@/lib/catalog/service-code";
import {
  blankService,
  completenessPercent,
  normalizeService,
  readField,
  validateService,
  withComputed,
  writeField,
} from "@/lib/catalog/service";
import { DEPTH_META, type DepthLevel, type FieldDefinition, type ServiceRecord } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { ServiceMappingSection } from "@/components/outcome-mapping";
import { AuditDrawer, Badge, ConfirmDialog, DepthToggle, FieldHelp, InfoTip, LookupSelect } from "@/components/widgets";

export function ServiceForm({ serviceId }: { serviceId: string }) {
  const api = useCatalog();
  const router = useRouter();
  const existing = serviceId === "new" ? null : api.services.find((service) => service.id === serviceId) ?? null;
  const [depth, setDepth] = useState<DepthLevel>(existing ? 3 : 1);
  const [draft, setDraft] = useState<ServiceRecord | null>(() => {
    if (!api.activeTenant) return null;
    if (serviceId === "new") return blankService(api.activeTenant.id, crypto.randomUUID(), "");
    return existing;
  });
  const [codeTouched, setCodeTouched] = useState(serviceId !== "new");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [prompt, setPrompt] = useState<null | "discard" | "archive" | "restore" | "delete">(null);

  const suggestion = useMemo(() => {
    if (!draft || !api.activeTenant) return "";
    const prefix = optionByCode(api.lookups, "category", draft.category)?.code_prefix ?? null;
    return suggestServiceCode({
      existingCodes: api.services.filter((service) => service.id !== draft.id).map((service) => service.service_code),
      mode: api.activeTenant.service_code_mode,
      categoryPrefix: prefix,
    });
  }, [draft, api.activeTenant, api.lookups, api.services]);

  if (!api.activeTenant) return null;
  if (serviceId !== "new" && !existing && !draft) {
    return (
      <section className="empty">
        <h2>Service not found</h2>
        <Link className="btn btn-secondary" href="/catalog" style={{ marginTop: 12 }}>
          Back to catalog
        </Link>
      </section>
    );
  }
  if (!draft) return null;

  const shown = withComputed({
    ...draft,
    service_code: codeTouched ? draft.service_code : suggestion || draft.service_code,
  });
  const percent = completenessPercent(shown, api.fields);
  const readOnly = !api.canWrite;
  const isNew = serviceId === "new";
  const historyEntries = api.audit.filter((entry) => entry.row_id === draft.id);

  function requestCancel() {
    if (dirty) {
      setPrompt("discard");
      return;
    }
    router.push("/catalog");
  }

  async function commitArchive(archived: boolean) {
    if (!existing) return;
    setSaving(true);
    try {
      const savedRecord = await api.archiveService(existing.id, archived);
      setDraft(savedRecord);
      setDirty(false);
      setSaved(false);
      setPrompt(null);
    } catch {
      setPrompt(null);
    } finally {
      setSaving(false);
    }
  }

  async function commitDelete() {
    if (!existing) return;
    setSaving(true);
    try {
      await api.deleteService(existing.id);
      router.push("/catalog");
    } catch {
      setPrompt(null);
      setSaving(false);
    }
  }

  function actionBar(placement: "top" | "bottom") {
    return (
      <div className="row-actions" style={placement === "bottom" ? { marginTop: 24 } : undefined}>
        {placement === "top" ? <Badge tone={completenessTone(percent)}>{percent}% complete</Badge> : null}
        {isNew ? null : (
          <button type="button" className="btn btn-secondary" onClick={() => setHistory(true)}>
            Change history
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={requestCancel}>
          Cancel
        </button>
        {!isNew && api.canWrite ? (
          shown.archived_at ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => (dirty ? setPrompt("restore") : void commitArchive(false))}
            >
              Restore
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setPrompt("archive")}>
              Archive
            </button>
          )
        ) : null}
        {!isNew && api.canAdmin ? (
          <button type="button" className="btn btn-danger" onClick={() => setPrompt("delete")}>
            Delete
          </button>
        ) : null}
        {readOnly ? null : (
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save service"}
          </button>
        )}
      </div>
    );
  }

  function update(field: FieldDefinition, value: unknown) {
    setSaved(false);
    setDirty(true);
    setDraft((current) => (current ? writeField(current, field.field_key, value) : current));
    if (field.field_key === "service_code") setCodeTouched(true);
  }

  async function save() {
    if (!draft) return;
    const normalized = normalizeService(shown);
    const nextErrors = validateService(normalized, api.fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      await api.saveService(normalized);
      setSaved(true);
      setDirty(false);
      setDraft(normalized);
      if (serviceId === "new") router.replace(`/services/${normalized.id}`);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  const groups = ([1, 2, 3] as const)
    .filter((level) => level <= depth)
    .map((level) => ({
      level,
      meta: DEPTH_META[level],
      fields: api.fields
        .filter((field) => field.is_active && field.depth_level === level)
        .sort((a, b) => a.sort_order - b.sort_order),
    }));

  return (
    <>
      {isNew ? (
        <p className="scratch-banner">
          Don&apos;t start from scratch — <Link href="/blueprints">browse pre-built security service blueprints →</Link>
        </p>
      ) : null}
      <div className="page-head">
        <div>
          <p className="micro">
            <Link href="/catalog">Catalog</Link>
            {" · "}
            {isNew ? "New service" : shown.service_code}
          </p>
          <h1>{shown.name.trim() || (isNew ? "New service" : "Service")}</h1>
          <p className="lede">
            Switching depth only hides fields. Values you already entered stay saved, including fields that are not on
            screen. Level 2 and Level 3 fields are never required.
          </p>
        </div>
        {actionBar("top")}
      </div>

      {readOnly ? <div className="callout">You have view access in this workspace. The form is read only.</div> : null}
      {shown.archived_at ? (
        <div className="callout" role="status">
          <strong>Archived.</strong> This service is hidden from the active catalog.
          {api.canWrite ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: 12 }}
              onClick={() => (dirty ? setPrompt("restore") : void commitArchive(false))}
            >
              Restore
            </button>
          ) : null}
        </div>
      ) : null}
      {saved ? <div className="saved-banner">Saved. Deeper fields you cannot see right now were kept.</div> : null}

      <DepthToggle value={depth} onChange={setDepth} />

      {groups.map((group) => (
        <section className="form-section" key={group.level}>
          <h2>{group.meta.title}</h2>
          <p className="lede">{group.meta.lede}</p>
          <div className="form-grid">
            {group.fields.map((field) => (
              <FieldControl
                key={field.field_key}
                field={field}
                draft={shown}
                suggestion={suggestion}
                error={errors[field.field_key]}
                disabled={readOnly || field.input_type === "computed"}
                onChange={(value) => update(field, value)}
                showSuggestion={!codeTouched}
                onUseSuggestion={() => {
                  setDirty(true);
                  setCodeTouched(false);
                  setDraft((current) => (current ? { ...current, service_code: suggestion } : current));
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {actionBar("bottom")}

      {isNew ? (
        <section className="form-section" id="mapping">
          <h2>Mapping</h2>
          <p className="lede">
            Save the service before recording an outcome assessment. A blueprint hint is not coverage, and a primary
            CSF function is not an assessment.
          </p>
        </section>
      ) : (
        <ServiceMappingSection serviceId={draft.id} />
      )}

      {history && !isNew ? (
        <AuditDrawer
          title={shown.service_code || "Service history"}
          entries={historyEntries}
          fields={api.fields}
          onClose={() => setHistory(false)}
        />
      ) : null}

      {prompt === "discard" ? (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="You will return to the catalog."
          confirmLabel="Discard"
          onConfirm={() => router.push("/catalog")}
          onCancel={() => setPrompt(null)}
        />
      ) : null}
      {prompt === "archive" ? (
        <ConfirmDialog
          title="Archive service?"
          message={
            dirty
              ? `Archive ${shown.service_code} — ${shown.name}? Unsaved edits will be discarded. It leaves the active catalog until you restore it.`
              : `Archive ${shown.service_code} — ${shown.name}? It leaves the active catalog until you restore it.`
          }
          confirmLabel="Archive"
          onConfirm={() => void commitArchive(true)}
          onCancel={() => setPrompt(null)}
        />
      ) : null}
      {prompt === "restore" ? (
        <ConfirmDialog
          title="Restore service?"
          message="Unsaved edits will be discarded, and the service returns to the active catalog."
          confirmLabel="Restore"
          onConfirm={() => void commitArchive(false)}
          onCancel={() => setPrompt(null)}
        />
      ) : null}
      {prompt === "delete" ? (
        <ConfirmDialog
          title="Delete service?"
          message={`Permanently delete ${shown.service_code} — ${shown.name}? This cannot be undone.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => void commitDelete()}
          onCancel={() => setPrompt(null)}
        />
      ) : null}
    </>
  );
}

function FieldControl({
  field,
  draft,
  suggestion,
  error,
  disabled,
  showSuggestion,
  onChange,
  onUseSuggestion,
}: {
  field: FieldDefinition;
  draft: ServiceRecord;
  suggestion: string;
  error?: string;
  disabled: boolean;
  showSuggestion: boolean;
  onChange: (value: unknown) => void;
  onUseSuggestion: () => void;
}) {
  const api = useCatalog();
  const value = readField(draft, field.field_key);
  const wide = field.input_type === "textarea" || field.input_type === "multi_select" || field.input_type === "computed";
  const inputId = `field-${field.field_key}`;
  const selectedCode = typeof value === "string" ? value : value == null ? null : String(value);

  return (
    <div className={wide ? "span-2" : undefined}>
      <div className="field-label">
        <label htmlFor={inputId}>{field.label}</label>
        {field.is_required ? <span className="req">Required</span> : null}
        <InfoTip label={field.label}>
          <FieldHelp field={field} lookups={api.lookups} selectedCode={selectedCode} />
        </InfoTip>
      </div>
      {field.input_type === "computed" ? (
        <div className="computed" id={inputId}>
          <span>
            {field.field_key === "maturity_gap"
              ? gapText(draft.maturity_gap)
              : formatDate(draft.next_review_date)}
          </span>
          <span className="micro">Computed</span>
        </div>
      ) : null}
      {fieldUsesLookup(field) && field.lookup_field_key ? (
        <LookupSelect
          id={inputId}
          value={typeof value === "number" ? String(value) : typeof value === "string" ? value : null}
          options={activeOptions(api.lookups, field.lookup_field_key)}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}
      {(field.input_type === "text" || field.input_type === "url") && !fieldUsesLookup(field) ? (
        <input
          id={inputId}
          className="input"
          type={field.field_key === "support_contact" ? "email" : field.input_type === "url" ? "url" : "text"}
          inputMode={field.field_key === "support_contact" ? "email" : undefined}
          autoComplete={field.field_key === "support_contact" ? "email" : undefined}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      {field.input_type === "textarea" && !fieldUsesLookup(field) ? (
        <textarea
          id={inputId}
          className="textarea"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      {field.input_type === "date" ? (
        <input
          id={inputId}
          className="input"
          type="date"
          disabled={disabled}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(event) => onChange(event.target.value || null)}
        />
      ) : null}
      {field.input_type === "boolean" ? (
        <label className="check" htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            disabled={disabled}
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          Yes, approval is required
        </label>
      ) : null}
      {field.input_type === "multi_select" && field.lookup_field_key ? (
        <div className="choices" role="group" aria-labelledby={inputId}>
          <span id={inputId} className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
            {field.label}
          </span>
          {api.lookups
            .filter((option) => option.field_key === field.lookup_field_key && option.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((option) => {
              const selected = Array.isArray(value) && value.includes(option.code);
              return (
                <label className="choice" key={option.id}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selected}
                    onChange={() => {
                      const current = Array.isArray(value) ? value.map(String) : [];
                      onChange(selected ? current.filter((code) => code !== option.code) : [...current, option.code]);
                    }}
                  />
                  {option.label}
                </label>
              );
            })}
        </div>
      ) : null}
      {field.field_key === "service_code" ? (
        <p className="hint">
          {showSuggestion ? `Suggested ${suggestion}. ` : null}
          The code stays editable.
          {showSuggestion && draft.service_code !== suggestion ? (
            <>
              {" "}
              <button type="button" className="btn btn-ghost" onClick={onUseSuggestion} disabled={disabled}>
                Use suggestion
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
