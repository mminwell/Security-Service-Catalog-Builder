"use client";

import Link from "next/link";
import { useState } from "react";
import { ARTIFACT_STATUS_KEY, ARTIFACT_TYPE_KEY, artifactFlags, linksForArtifact, linksForService } from "@/lib/catalog/artifacts";
import { optionLabel } from "@/lib/catalog/lookups";
import { localToday } from "@/lib/catalog/present";
import { useCatalog } from "@/components/catalog-provider";
import { ExternalUrl } from "@/components/external-url";
import { Badge } from "@/components/widgets";

export function ServiceArtifacts({ serviceId }: { serviceId: string }) {
  const api = useCatalog();
  const today = localToday();
  const links = linksForService(api.artifactLinks, serviceId);
  const linkedIds = new Set(links.map((link) => link.artifact_id));
  const available = api.artifacts.filter((artifact) => !linkedIds.has(artifact.id));
  const [artifactId, setArtifactId] = useState(available[0]?.id ?? "");
  const [note, setNote] = useState("");

  return (
    <section className="form-section" id="supporting-artifacts">
      <h2>Supporting Artifacts</h2>
      <p className="lede">
        Policies, standards, procedures, and tools this service uses. Add a link here or from the artifact. The catalog
        opens the URL. It does not host the file.
      </p>
      {links.length === 0 ? <p>No artifacts are linked yet.</p> : null}
      <div className="stack">
        {links.map((link) => {
          const artifact = api.artifacts.find((row) => row.id === link.artifact_id);
          if (!artifact) return null;
          const flags = artifactFlags(artifact, linksForArtifact(api.artifactLinks, artifact.id).length, today);
          return (
            <div className="panel" key={link.id} style={{ padding: 12 }}>
              <div className="row-actions">
                <Link href={`/artifacts/${artifact.id}`}>{artifact.name}</Link>
                <span className="micro">{optionLabel(api.lookups, ARTIFACT_TYPE_KEY, artifact.artifact_type)}</span>
                <span className="micro">{optionLabel(api.lookups, ARTIFACT_STATUS_KEY, artifact.status) || "No status"}</span>
                {flags.overdue ? <Badge tone="warning">Overdue for review</Badge> : null}
                {flags.retiredLinked ? <Badge tone="danger">Retired but still linked</Badge> : null}
                <ExternalUrl url={artifact.link_url}>Open</ExternalUrl>
                {api.canWrite ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void api.deleteArtifactLink(link.id)}>
                    Unlink
                  </button>
                ) : null}
              </div>
              {link.relationship_note ? <p>{link.relationship_note}</p> : null}
            </div>
          );
        })}
      </div>
      {api.canWrite ? (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div>
            <div className="field-label">
              <label htmlFor="service-artifact">Artifact</label>
            </div>
            <select id="service-artifact" className="select" value={artifactId} onChange={(event) => setArtifactId(event.target.value)}>
              {available.length === 0 ? <option value="">No other artifacts</option> : null}
              {available.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">
              <label htmlFor="service-artifact-note">Relationship note</label>
            </div>
            <input id="service-artifact-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!artifactId}
              onClick={() => {
                void api.saveArtifactLink({ artifactId, serviceId, relationshipNote: note });
                setNote("");
              }}
            >
              Link artifact
            </button>
            <Link className="btn btn-ghost" href={`/artifacts/new?service=${serviceId}`}>
              Add artifact
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
