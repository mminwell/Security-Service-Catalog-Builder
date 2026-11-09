import { withArtifactComputed } from "@/lib/catalog/artifacts";
import type { Artifact, ArtifactLink } from "@/lib/catalog/types";

const SEEDED_AT = "2026-11-01T15:00:00.000Z";

const ACME = "11111111-1111-4111-8111-111111111111";
const MERIDIAN = "22222222-2222-4222-8222-222222222222";

type Seed = {
  id: string;
  tenant_id: string;
  name: string;
  artifact_type: string;
  owner_team: string | null;
  status: string;
  version: string | null;
  review_cadence: string | null;
  last_reviewed_date: string | null;
  link_url: string | null;
  description: string | null;
  visibility: "public" | "internal";
};

type LinkSeed = {
  id: string;
  tenant_id: string;
  artifact_id: string;
  service_id: string;
  relationship_note: string | null;
};

const ARTIFACTS: Seed[] = [
  {
    id: "11111111-1111-4111-8111-11111111a001",
    tenant_id: ACME,
    name: "Customer Security Overview",
    artifact_type: "policy",
    owner_team: "corp_security_grc",
    status: "active",
    version: "2.1",
    review_cadence: "annual",
    last_reviewed_date: "2026-03-01",
    link_url: "https://example.com/acme/security-overview",
    description: "A short public description of how Acme Corp protects customer environments.",
    visibility: "public",
  },
  {
    id: "11111111-1111-4111-8111-11111111a002",
    tenant_id: ACME,
    name: "SOC Pager Runbook",
    artifact_type: "procedure",
    owner_team: "soc",
    status: "active",
    version: "4.0",
    review_cadence: "quarterly",
    last_reviewed_date: "2026-09-02",
    link_url: "https://example.com/acme/internal/soc-pager",
    description: "How the Acme watch escalates a paging event. Internal operating procedure.",
    visibility: "internal",
  },
  {
    id: "11111111-1111-4111-8111-11111111a003",
    tenant_id: ACME,
    name: "Detection Content Standard",
    artifact_type: "standard",
    owner_team: "soc",
    status: "under_review",
    version: "1.4",
    review_cadence: "annual",
    last_reviewed_date: "2025-06-01",
    link_url: "https://example.com/acme/internal/detection-standard",
    description: "Required log sources and detection content for production monitoring. Past its review date.",
    visibility: "internal",
  },
  {
    id: "11111111-1111-4111-8111-11111111a004",
    tenant_id: ACME,
    name: "Legacy VPN Standard",
    artifact_type: "standard",
    owner_team: "iam",
    status: "retired",
    version: "0.9",
    review_cadence: "annual",
    last_reviewed_date: "2024-11-01",
    link_url: "https://example.com/acme/internal/legacy-vpn",
    description: "Retired remote-access standard that is still linked to identity lifecycle.",
    visibility: "internal",
  },
  {
    id: "11111111-1111-4111-8111-11111111a005",
    tenant_id: ACME,
    name: "Vulnerability Scanner",
    artifact_type: "tool",
    owner_team: "sec_engineering",
    status: "active",
    version: null,
    review_cadence: "semi_annual",
    last_reviewed_date: "2026-08-15",
    link_url: "https://example.com/acme/tools/scanner",
    description: "The scanner Acme uses for the vulnerability desk. The catalog links out and does not store findings.",
    visibility: "internal",
  },
  {
    id: "22222222-2222-4222-8222-22222222a001",
    tenant_id: MERIDIAN,
    name: "Patient Privacy Notice Summary",
    artifact_type: "policy",
    owner_team: "privacy_ai_gov",
    status: "active",
    version: "3.0",
    review_cadence: "annual",
    last_reviewed_date: "2026-04-12",
    link_url: "https://example.com/meridian/privacy-notice",
    description: "Public summary of how Meridian Health describes privacy to patients.",
    visibility: "public",
  },
  {
    id: "22222222-2222-4222-8222-22222222a002",
    tenant_id: MERIDIAN,
    name: "Incident Response Plan",
    artifact_type: "policy",
    owner_team: "soc",
    status: "active",
    version: "5.2",
    review_cadence: "annual",
    last_reviewed_date: "2026-02-20",
    link_url: "https://example.com/meridian/internal/ir-plan",
    description: "Meridian's incident response plan. The security incident service executes this plan.",
    visibility: "internal",
  },
  {
    id: "22222222-2222-4222-8222-22222222a003",
    tenant_id: MERIDIAN,
    name: "Clinical Access Standard",
    artifact_type: "standard",
    owner_team: "iam",
    status: "active",
    version: "2.0",
    review_cadence: "annual",
    last_reviewed_date: "2026-01-09",
    link_url: "https://example.com/meridian/internal/clinical-access",
    description: "Who may receive clinical application access, and which approvals are required.",
    visibility: "internal",
  },
  {
    id: "22222222-2222-4222-8222-22222222a004",
    tenant_id: MERIDIAN,
    name: "After-Hours IR Runbook",
    artifact_type: "procedure",
    owner_team: "soc",
    status: "under_review",
    version: "1.1",
    review_cadence: "quarterly",
    last_reviewed_date: "2026-05-01",
    link_url: "https://example.com/meridian/internal/ir-runbook",
    description: "Steps for the on-call analyst. Review was due in August.",
    visibility: "internal",
  },
];

const LINKS: LinkSeed[] = [
  {
    id: "11111111-1111-4111-8111-11111111b001",
    tenant_id: ACME,
    artifact_id: "11111111-1111-4111-8111-11111111a001",
    service_id: "11111111-1111-4111-8111-111111111004",
    relationship_note: null,
  },
  {
    id: "11111111-1111-4111-8111-11111111b002",
    tenant_id: ACME,
    artifact_id: "11111111-1111-4111-8111-11111111a002",
    service_id: "11111111-1111-4111-8111-111111111001",
    relationship_note: "Paging path for the monitoring service.",
  },
  {
    id: "11111111-1111-4111-8111-11111111b003",
    tenant_id: ACME,
    artifact_id: "11111111-1111-4111-8111-11111111a003",
    service_id: "11111111-1111-4111-8111-111111111001",
    relationship_note: "Detection content this service is supposed to keep current.",
  },
  {
    id: "11111111-1111-4111-8111-11111111b004",
    tenant_id: ACME,
    artifact_id: "11111111-1111-4111-8111-11111111a004",
    service_id: "11111111-1111-4111-8111-111111111002",
    relationship_note: "Still referenced by identity lifecycle. Replace or unlink it.",
  },
  {
    id: "11111111-1111-4111-8111-11111111b005",
    tenant_id: ACME,
    artifact_id: "11111111-1111-4111-8111-11111111a005",
    service_id: "11111111-1111-4111-8111-111111111003",
    relationship_note: null,
  },
  {
    id: "22222222-2222-4222-8222-22222222b001",
    tenant_id: MERIDIAN,
    artifact_id: "22222222-2222-4222-8222-22222222a001",
    service_id: "22222222-2222-4222-8222-222222222004",
    relationship_note: null,
  },
  {
    id: "22222222-2222-4222-8222-22222222b002",
    tenant_id: MERIDIAN,
    artifact_id: "22222222-2222-4222-8222-22222222a002",
    service_id: "22222222-2222-4222-8222-222222222002",
    relationship_note: "The plan this response service executes.",
  },
  {
    id: "22222222-2222-4222-8222-22222222b003",
    tenant_id: MERIDIAN,
    artifact_id: "22222222-2222-4222-8222-22222222a003",
    service_id: "22222222-2222-4222-8222-222222222001",
    relationship_note: null,
  },
  {
    id: "22222222-2222-4222-8222-22222222b004",
    tenant_id: MERIDIAN,
    artifact_id: "22222222-2222-4222-8222-22222222a004",
    service_id: "22222222-2222-4222-8222-222222222002",
    relationship_note: "After-hours steps. Overdue for review.",
  },
];

export function sampleArtifactRecords(now = SEEDED_AT): { artifacts: Artifact[]; links: ArtifactLink[] } {
  const artifacts = ARTIFACTS.map((seed) =>
    withArtifactComputed({
      ...seed,
      next_review_date: null,
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now,
    }),
  );
  const links = LINKS.map((seed) => ({
    ...seed,
    created_by: null,
    created_at: now,
  }));
  return { artifacts, links };
}

/** Sample rows for tenants that already exist. Skips a link when that service is gone. */
export function sampleArtifactsForTenants(
  tenantIds: string[],
  serviceIds: string[],
  now = SEEDED_AT,
): { artifacts: Artifact[]; links: ArtifactLink[] } {
  const tenants = new Set(tenantIds);
  const services = new Set(serviceIds);
  const { artifacts, links } = sampleArtifactRecords(now);
  return {
    artifacts: artifacts.filter((artifact) => tenants.has(artifact.tenant_id)),
    links: links.filter((link) => tenants.has(link.tenant_id) && services.has(link.service_id)),
  };
}
