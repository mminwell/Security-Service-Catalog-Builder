"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ARTIFACT_STATUS_KEY, ARTIFACT_TYPE_KEY, emptyArtifact, linksForArtifact, withArtifactComputed } from "@/lib/catalog/artifacts";
import { activeOptions } from "@/lib/catalog/lookups";
import type { Artifact } from "@/lib/catalog/types";
import { useCatalog } from "@/components/catalog-provider";
import { ExternalUrl } from "@/components/external-url";
import { ConfirmDialog } from "@/components/widgets";

export function ArtifactEditor({ artifactId }: { artifactId: string }) {
  const api = useCatalog();
  const router = useRouter();
  const params = useSearchParams();
  const serviceHint = params.get("service");
  const isNew = artifactId === "new";
  const existing = api.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
  const [draft, setDraft] = useState<Artifact | null>(() => {
    if (isNew && api.activeTenant) return emptyArtifact(api.activeTenant.id, crypto.randomUUID(), new Date().toISOString());
    return existing;
  });
  const [note, setNote] = useState("");
  const [serviceId, setServiceId] = useState(serviceHint ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = !api.canWrite;

  const linked = useMemo(
    () => (draft ? linksForArtifact(api.artifactLinks, draft.id) : []),
    [api.artifactLinks, draft],
  );
  const linkedServiceIds = new Set(linked.map((link) => link.service_id));
  const availableServices = api.services.filter((service) => !linkedServiceIds.has(service.id));

  if (!isNew && !existing) {
    return (
      <section className="empty">
        <h2>That artifact is not in this workspace.</h2>
        <Link href="/artifacts">Back to artifacts</Link>
      </section>
    );
  }
  if (!draft) return null;
  const computed = withArtifactComputed(draft);

  function update<K extends keyof Artifact>(key: K, value: Artifact[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const id = await api.saveArtifact(draft);
      if (isNew && serviceId) {
        await api.saveArtifactLink({ artifactId: id, serviceId, relationshipNote: note });
      }
      router.replace(`/artifacts/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the artifact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">
            <Link href="/artifacts">Artifacts</Link>
            {" · "}
            {isNew ? "New artifact" : draft.visibility === "public" ? "Public" : "Internal"}
          </p>
          <h1>{draft.name.trim() || (isNew ? "New artifact" : "Artifact")}</h1>
          <p className="lede">
            Record where the document or tool lives. Visibility defaults to Internal. A public export includes a public
            artifact and leaves an internal one out entirely.
          </p>
        </div>
        <div className="row-actions">
          {api.canAdmin && !isNew ? (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ) : null}
          {api.canWrite ? (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
      </div>

      {readOnly ? <div className="callout">You have view access in this workspace. This artifact is read only.</div> : null}
      {error ? (
        <div className="callout" role="alert">
          {error}
        </div>
      ) : null}

      <section className="form-section">
        <h2>Details</h2>
        <div className="form-grid">
          <div className="span-2">
            <div className="field-label">
              <label htmlFor="artifact-name">Name</label>
              <span className="req">Required</span>
            </div>
            <input id="artifact-name" className="input" value={draft.name} disabled={readOnly} onChange={(event) => update("name", event.target.value)} />
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-type">Type</label>
              <span className="req">Required</span>
            </div>
            <select id="artifact-type" className="select" value={draft.artifact_type} disabled={readOnly} onChange={(event) => update("artifact_type", event.target.value)}>
              <option value="">Choose a type</option>
              {activeOptions(api.lookups, ARTIFACT_TYPE_KEY).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-status">Status</label>
            </div>
            <select id="artifact-status" className="select" value={draft.status ?? ""} disabled={readOnly} onChange={(event) => update("status", event.target.value || null)}>
              <option value="">Not set</option>
              {activeOptions(api.lookups, ARTIFACT_STATUS_KEY).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-owner">Owner team</label>
            </div>
            <select id="artifact-owner" className="select" value={draft.owner_team ?? ""} disabled={readOnly} onChange={(event) => update("owner_team", event.target.value || null)}>
              <option value="">Not set</option>
              {activeOptions(api.lookups, "team").map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-visibility">Visibility</label>
            </div>
            <select
              id="artifact-visibility"
              className="select"
              value={draft.visibility}
              disabled={readOnly}
              onChange={(event) => update("visibility", event.target.value === "public" ? "public" : "internal")}
            >
              <option value="internal">Internal</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-version">Version</label>
            </div>
            <input id="artifact-version" className="input" value={draft.version ?? ""} disabled={readOnly} onChange={(event) => update("version", event.target.value)} />
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-cadence">Review cadence</label>
            </div>
            <select id="artifact-cadence" className="select" value={draft.review_cadence ?? ""} disabled={readOnly} onChange={(event) => update("review_cadence", event.target.value || null)}>
              <option value="">Not set</option>
              {activeOptions(api.lookups, "review_cadence").map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-reviewed">Last reviewed</label>
            </div>
            <input id="artifact-reviewed" className="input" type="date" value={draft.last_reviewed_date ?? ""} disabled={readOnly} onChange={(event) => update("last_reviewed_date", event.target.value)} />
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="artifact-next">Next review</label>
            </div>
            <input id="artifact-next" className="input" value={computed.next_review_date ?? "No automatic date"} disabled />
          </div>
          <div className="span-2">
            <div className="field-label">
              <label htmlFor="artifact-link">Link</label>
            </div>
            <input
              id="artifact-link"
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={draft.link_url ?? ""}
              disabled={readOnly}
              onChange={(event) => update("link_url", event.target.value)}
            />
            <p className="hint">
              http or https only. <ExternalUrl url={draft.link_url}>Open the current link</ExternalUrl>
            </p>
          </div>
          <div className="span-2">
            <div className="field-label">
              <label htmlFor="artifact-description">Description</label>
            </div>
            <textarea id="artifact-description" className="textarea" rows={3} value={draft.description ?? ""} disabled={readOnly} onChange={(event) => update("description", event.target.value)} />
          </div>
        </div>
      </section>

      <section className="form-section" id="linked-services">
        <h2>Linked services</h2>
        <p className="lede">The same link can be added from a service. A note is optional and stays out of public exports.</p>
        {!isNew ? (
          <>
            {linked.length === 0 ? <p>No services are linked yet.</p> : null}
            <div className="stack">
              {linked.map((link) => {
                const service = api.services.find((row) => row.id === link.service_id);
                return (
                  <LinkedRow
                    key={link.id}
                    title={service ? `${service.service_code} · ${service.name}` : "Service"}
                    href={service ? `/services/${service.id}` : "/catalog"}
                    note={link.relationship_note}
                    readOnly={readOnly}
                    onNote={(value) => void api.saveArtifactLink({ id: link.id, artifactId: link.artifact_id, serviceId: link.service_id, relationshipNote: value })}
                    onUnlink={() => void api.deleteArtifactLink(link.id)}
                  />
                );
              })}
            </div>
            {api.canWrite && availableServices.length > 0 ? (
              <LinkComposer
                services={availableServices.map((service) => ({ id: service.id, label: `${service.service_code} · ${service.name}` }))}
                onAdd={(chosen, relationshipNote) => void api.saveArtifactLink({ artifactId: draft.id, serviceId: chosen, relationshipNote })}
              />
            ) : null}
          </>
        ) : api.canWrite ? (
          <div className="form-grid">
            <div>
              <div className="field-label">
                <label htmlFor="new-artifact-service">Link to a service on save</label>
              </div>
              <select id="new-artifact-service" className="select" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                <option value="">Do not link yet</option>
                {api.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.service_code} · {service.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">
                <label htmlFor="new-artifact-note">Relationship note</label>
              </div>
              <input id="new-artifact-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
        ) : null}
      </section>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete artifact?"
          message={`Delete ${draft.name}? Links to services are removed. The document itself is not deleted, because this catalog only stored the link.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => {
            void api.deleteArtifact(draft.id).then(() => router.push("/artifacts"));
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}

function LinkedRow({
  title,
  href,
  note,
  readOnly,
  onNote,
  onUnlink,
}: {
  title: string;
  href: string;
  note: string | null;
  readOnly: boolean;
  onNote: (value: string) => void;
  onUnlink: () => void;
}) {
  const [value, setValue] = useState(note ?? "");
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="row-actions">
        <Link href={href}>{title}</Link>
        {readOnly ? null : (
          <button type="button" className="btn btn-ghost" onClick={onUnlink}>
            Unlink
          </button>
        )}
      </div>
      <label>
        <span className="micro">Relationship note</span>
        <input
          className="input"
          value={value}
          disabled={readOnly}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            if (value.trim() !== (note ?? "")) onNote(value);
          }}
        />
      </label>
    </div>
  );
}

function LinkComposer({
  services,
  onAdd,
}: {
  services: Array<{ id: string; label: string }>;
  onAdd: (serviceId: string, note: string) => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [note, setNote] = useState("");
  return (
    <div className="form-grid" style={{ marginTop: 12 }}>
      <div>
        <div className="field-label">
          <label htmlFor="link-service">Service</label>
        </div>
        <select id="link-service" className="select" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="field-label">
          <label htmlFor="link-note">Relationship note</label>
        </div>
        <input id="link-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!serviceId}
          onClick={() => {
            onAdd(serviceId, note);
            setNote("");
          }}
        >
          Link service
        </button>
      </div>
    </div>
  );
}
