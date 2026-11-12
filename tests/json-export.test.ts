import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distributionMarking } from "@/lib/catalog/csv";
import { exportFileName, fullPreset, publicPreset } from "@/lib/catalog/export-plan";
import { materializeFields } from "@/lib/catalog/fields";
import { CSF_ELEMENTS, CSF_FRAMEWORK, elementByCode } from "@/lib/catalog/framework";
import { catalogJsonFile, type CatalogJsonDocument, type CatalogJsonLookup } from "@/lib/catalog/json-catalog";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { buildService, writeField } from "@/lib/catalog/service";
import type { Artifact, ArtifactLink, LookupOption, OutcomeMapping, ServiceRecord } from "@/lib/catalog/types";

const TENANT = "tenant";
const EXPORTED_AT = "2026-11-12T19:40:00.000Z";
const TODAY = "2026-11-12";
const USER = "user-9f3c1a0e-hidden";
const EMAIL = "hidden-owner@example.com";
const SECRET = "Fictional holiday paging coverage is thin.";
const RATIONALE = "Fictional staffing rationale stays internal.";
const MAPPING_NOTES = "Fictional roster note stays internal.";
const ARCHIVED_RATIONALE = "Fictional archived assessment stays out of mappings.";
const PRIVACY = "Fictional privacy operations note that stays out.";
const INTERNAL_NAME = "Fictional Pager Runbook";
const INTERNAL_URL = "https://example.com/internal/fictional-pager";
const INTERNAL_NOTE = "Fictional paging path stays internal.";
const OUTSIDE_URL = "https://example.com/fictional/outside";
const SCRIPT_URL = "javascript:alert(1)";
const DATA_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
const HTTPS_LOGO = "https://cdn.example.com/logos/northwind.png";
const CREDENTIAL_LOGO = "https://user:secret-token@cdn.example.com/a.png";
const SUPPORT_EMAIL = "soc-desk@example.com";

const fields = materializeFields(TENANT, (key) => `field:${key}`);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: `lookup:${seed.field_key}:${seed.code}`,
  tenant_id: TENANT,
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

const outcome = elementByCode("GV.OC-01");
if (!outcome) throw new Error("missing GV.OC-01");

function stamp<T extends { created_by?: string | null; updated_by?: string | null }>(
  row: T,
): Omit<T, "created_by" | "updated_by"> & { created_by: string; updated_by: string } {
  return { ...row, created_by: USER, updated_by: EMAIL };
}

function watchService(): ServiceRecord {
  const built = buildService(TENANT, {
    id: "svc-watch",
    service_code: "SVC-4410",
    name: "Northwind Watch",
    category: "secops",
    status: "active",
    service_tier: "tier_0",
    summary: "Detect threats in São Paulo — café.",
    owner_team: "soc",
    internal_name: "Internal watch name",
    internal_notes: SECRET,
    current_tooling_notes: "=CMD()",
    support_contact: SUPPORT_EMAIL,
    approval_required: true,
    current_maturity_cmmi: 2,
    target_maturity_cmmi: 3,
    target_audience: ["customers", "executives"],
  });
  const withGeo = writeField(writeField(built, "data_residency_regions", ["us", "ca"]), "privacy_operations_notes", PRIVACY);
  return stamp(withGeo);
}

function advisoryService(): ServiceRecord {
  return stamp(
    buildService(TENANT, {
      id: "svc-advisory",
      service_code: "SVC-4411",
      name: "Advisory Reviews",
      category: "grc",
      status: "active",
      service_tier: "tier_3",
      summary: "Short public summary.",
      owner_team: "security_leadership",
    }),
  );
}

function archivedService(): ServiceRecord {
  return {
    ...stamp(
      buildService(TENANT, {
        id: "svc-retired",
        service_code: "SVC-4499",
        name: "Retired Watch",
        category: "secops",
        status: "retired",
        service_tier: "tier_2",
        summary: "No longer offered.",
        owner_team: "soc",
        internal_notes: "Fictional retired internal note.",
      }),
    ),
    archived_at: "2026-01-01T00:00:00.000Z",
  };
}

function artifact(partial: Pick<Artifact, "id" | "name" | "visibility"> & Partial<Artifact>): Artifact {
  return stamp({
    tenant_id: TENANT,
    artifact_type: "policy",
    owner_team: null,
    status: "active",
    version: null,
    review_cadence: null,
    last_reviewed_date: null,
    next_review_date: null,
    link_url: null,
    description: null,
    created_at: EXPORTED_AT,
    updated_at: EXPORTED_AT,
    ...partial,
  });
}

const artifacts: Artifact[] = [
  artifact({
    id: "art-public",
    name: "Fictional Customer Overview",
    visibility: "public",
    artifact_type: "policy",
    status: "active",
    version: "1.2",
    description: "Public overview.",
    link_url: "https://example.com/fictional/overview",
  }),
  artifact({
    id: "art-pager",
    name: INTERNAL_NAME,
    visibility: "internal",
    artifact_type: "procedure",
    status: "retired",
    owner_team: "soc",
    link_url: INTERNAL_URL,
    description: "Internal pager steps.",
  }),
  artifact({
    id: "art-notice",
    name: "Fictional Privacy Notice",
    visibility: "public",
    link_url: "https://example.com/fictional/notice",
  }),
  artifact({
    id: "art-memo",
    name: "Fictional Board Memo",
    visibility: "internal",
    status: "active",
    next_review_date: "2020-01-01",
    link_url: "https://example.com/internal/board-memo",
  }),
  artifact({
    id: "art-outside",
    name: "Fictional Outside Artifact",
    visibility: "public",
    link_url: OUTSIDE_URL,
  }),
  artifact({
    id: "art-script",
    name: "Fictional Click Target",
    visibility: "public",
    link_url: SCRIPT_URL,
  }),
];

function link(id: string, artifactId: string, serviceId: string, note: string | null): ArtifactLink {
  return {
    id,
    tenant_id: TENANT,
    artifact_id: artifactId,
    service_id: serviceId,
    relationship_note: note,
    created_by: USER,
    created_at: EXPORTED_AT,
  };
}

const links: ArtifactLink[] = [
  link("link-public-watch", "art-public", "svc-watch", null),
  link("link-public-advisory", "art-public", "svc-advisory", null),
  link("link-pager", "art-pager", "svc-watch", INTERNAL_NOTE),
  link("link-script", "art-script", "svc-watch", null),
  link("link-outside", "art-outside", "svc-not-exported", "Outside note."),
];

const mappings: OutcomeMapping[] = [
  {
    id: "map-watch",
    tenant_id: TENANT,
    service_id: "svc-watch",
    element_id: outcome.id,
    coverage: "partial",
    rationale: RATIONALE,
    notes: MAPPING_NOTES,
    created_by: USER,
    updated_by: EMAIL,
    created_at: EXPORTED_AT,
    updated_at: EXPORTED_AT,
  },
  {
    id: "map-retired",
    tenant_id: TENANT,
    service_id: "svc-retired",
    element_id: outcome.id,
    coverage: "none",
    rationale: ARCHIVED_RATIONALE,
    notes: "Archived mapping note.",
    created_by: USER,
    updated_by: EMAIL,
    created_at: EXPORTED_AT,
    updated_at: EXPORTED_AT,
  },
  {
    id: "map-missing-service",
    tenant_id: TENANT,
    service_id: "svc-not-exported",
    element_id: outcome.id,
    coverage: "full",
    rationale: "Mapping for a service that is not in this file.",
    notes: null,
    created_by: USER,
    updated_by: null,
    created_at: EXPORTED_AT,
    updated_at: EXPORTED_AT,
  },
  {
    id: "map-unknown-element",
    tenant_id: TENANT,
    service_id: "svc-watch",
    element_id: "not-a-real-element",
    coverage: "full",
    rationale: "Unknown element rationale.",
    notes: null,
    created_by: USER,
    updated_by: null,
    created_at: EXPORTED_AT,
    updated_at: EXPORTED_AT,
  },
];

const services = [advisoryService(), watchService(), archivedService()];

function argsFor(audience: "public" | "internal", fieldList = audience === "public" ? publicPreset(fields).fields : fullPreset(fields).fields) {
  const preset = audience === "public" ? publicPreset(fields) : fullPreset(fields);
  return {
    workspaceName: "Northwind Security",
    slug: "northwind",
    logoUrl: audience === "public" ? DATA_LOGO : HTTPS_LOGO,
    audience,
    profileName: preset.profileName,
    profileId: preset.profileId,
    marking: distributionMarking("Northwind Security", audience === "public" ? "public" : "all"),
    exportedAt: EXPORTED_AT,
    services,
    fields: fieldList,
    lookups,
    artifacts,
    artifactLinks: links,
    mappings,
    elements: CSF_ELEMENTS,
    frameworks: [CSF_FRAMEWORK],
    tenantId: TENANT,
    today: TODAY,
  };
}

function open(audience: "public" | "internal", fieldList?: Parameters<typeof argsFor>[1]) {
  const file = catalogJsonFile(argsFor(audience, fieldList));
  const doc = JSON.parse(file.body) as CatalogJsonDocument;
  return { file, doc };
}

function fieldValue(doc: CatalogJsonDocument, serviceId: string, key: string) {
  const service = doc.services.find((item) => item.id === serviceId);
  return service?.fields.find((field) => field.key === key)?.value;
}

function artifactField(doc: CatalogJsonDocument, artifactId: string, key: string) {
  const found = [
    ...doc.services.flatMap((service) => service.artifacts),
    ...doc.unlinkedArtifacts,
  ].find((item) => item.id === artifactId);
  return found?.fields.find((field) => field.key === key)?.value;
}

function asLookup(value: unknown): CatalogJsonLookup {
  expect(value).toEqual(expect.objectContaining({ code: expect.any(String), label: expect.any(String) }));
  return value as CatalogJsonLookup;
}

describe("JSON catalog export", () => {
  it("names the file and sets the JSON mime", () => {
    expect(exportFileName("northwind", "public", "json")).toBe("northwind-catalog-public.json");
    expect(exportFileName("northwind", "internal", "json")).toBe("northwind-catalog-full.json");
    expect(exportFileName("Acme Corp!", "public", "json")).toBe("Acme-Corp-catalog-public.json");
    const file = catalogJsonFile(argsFor("public"));
    expect(file.filename).toBe("northwind-catalog-public.json");
    expect(file.mime).toBe("application/json");
    expect(catalogJsonFile(argsFor("internal")).filename).toBe("northwind-catalog-full.json");
    const dialog = readFileSync("components/export-dialog.tsx", "utf8");
    expect(dialog).toContain('id: "json"');
    expect(dialog).toContain("catalogJsonFile");
    expect(dialog).toContain("file.mime");
  });

  it("pretty-prints valid UTF-8 JSON and leaves secrets and the logo data URL out", () => {
    const { file, doc } = open("public");
    expect(file.body).toBe(`${JSON.stringify(JSON.parse(file.body), null, 2)}\n`);
    expect(Buffer.from(file.body, "utf8").toString("utf8")).toBe(file.body);
    expect(file.body.startsWith("{\n  \"schemaVersion\": \"1.0\"")).toBe(true);
    expect(doc.schemaVersion).toBe("1.0");
    expect(doc.exportedAt).toBe(EXPORTED_AT);
    expect(doc.workspace).toEqual({ name: "Northwind Security", slug: "northwind" });
    expect(file.body).not.toContain("data:image");
    expect(file.body).not.toContain("iVBORw0KGgo");
    expect(file.body).toContain("São Paulo");
    expect(file.body).not.toContain(USER);
    expect(file.body).not.toContain(EMAIL);
    expect(file.body).not.toContain(SECRET);
    expect(file.body).not.toContain(SCRIPT_URL);
    const blocked = catalogJsonFile({ ...argsFor("internal"), logoUrl: CREDENTIAL_LOGO });
    expect(blocked.body).not.toContain("secret-token");
    expect(blocked.body).not.toContain(CREDENTIAL_LOGO);
    const httpLogo = catalogJsonFile({ ...argsFor("internal"), logoUrl: "http://cdn.example.com/logo.png" });
    expect(httpLogo.body).not.toContain("http://cdn.example.com/logo.png");
    expect((JSON.parse(httpLogo.body) as CatalogJsonDocument).workspace.logoUrl).toBeUndefined();
  });

  it("keeps a public file to public fields, public artifacts, and mapping labels", () => {
    const { file, doc } = open("public");
    expect(doc.export.audience).toBe("public");
    expect(doc.export.profile).toEqual({ id: null, name: "Public catalog" });
    expect(doc.export.distributionStatement).toBe("NORTHWIND SECURITY \u2014 APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(doc.export.includedSections).toEqual(["services", "artifacts", "mappings"]);
    expect(doc.export.fieldList.map((field) => field.key)).toEqual(["name", "summary"]);
    expect(doc.export.options.geography).toBe(false);
    expect(doc.export.options.privacy).toBe(false);
    expect(doc.export.options.note).toBeNull();
    expect(doc.services.map((service) => service.id)).toEqual(["svc-advisory", "svc-watch", "svc-retired"]);
    expect(doc.services.every((service) => service.fields.map((field) => field.key).join() === "name,summary")).toBe(true);
    expect(fieldValue(doc, "svc-watch", "name")).toBe("Northwind Watch");
    expect(fieldValue(doc, "svc-watch", "summary")).toBe("Detect threats in São Paulo — café.");
    expect(file.body).not.toContain("SVC-4410");
    expect(file.body).not.toContain("SVC-4411");
    expect(file.body).not.toContain("Internal Notes");
    expect(file.body).not.toContain("internal_notes");
    expect(file.body).not.toContain(SUPPORT_EMAIL);
    expect(file.body).not.toContain("=CMD()");
    expect(file.body).not.toContain(PRIVACY);
    expect(file.body).not.toContain("United States");
    expect(file.body).not.toContain(INTERNAL_NAME);
    expect(file.body).not.toContain(INTERNAL_URL);
    expect(file.body).not.toContain(INTERNAL_NOTE);
    expect(file.body).not.toContain("Fictional Board Memo");
    expect(file.body).not.toContain(OUTSIDE_URL);
    expect(file.body).not.toContain("Overdue for review");
    expect(file.body).not.toContain("Retired but still linked");
    expect(file.body).not.toContain(RATIONALE);
    expect(file.body).not.toContain(MAPPING_NOTES);
    expect(file.body).not.toContain(ARCHIVED_RATIONALE);

    const watch = doc.services.find((service) => service.id === "svc-watch");
    expect(watch?.artifacts.map((item) => item.id)).toEqual(["art-script", "art-public"]);
    expect(watch?.mappings).toEqual([
      {
        framework: { code: CSF_FRAMEWORK.code, version: CSF_FRAMEWORK.version, name: CSF_FRAMEWORK.name },
        element: { id: outcome.id, code: outcome.code, title: outcome.title, statement: outcome.statement },
        coverage: { code: "partial", label: "Partial" },
      },
    ]);
    expect(watch?.mappings[0]).not.toHaveProperty("rationale");
    expect(doc.services.find((service) => service.id === "svc-retired")?.mappings).toEqual([]);
    expect(artifactField(doc, "art-public", "artifact_type")).toEqual({
      id: "lookup:artifact_type:policy",
      code: "policy",
      label: "Policy",
    });
    expect(artifactField(doc, "art-public", "link_url")).toBe("https://example.com/fictional/overview");
    expect(artifactField(doc, "art-script", "link_url")).toBeNull();
    const publicArtifact = doc.services.flatMap((service) => service.artifacts).find((item) => item.id === "art-public");
    expect(publicArtifact?.fields.map((field) => field.key)).not.toContain("owner_team");
    expect(publicArtifact?.fields.map((field) => field.key)).not.toContain("relationship_note");
    expect(doc.unlinkedArtifacts.map((item) => item.id)).toEqual(["art-notice"]);
    expect(doc.counts).toEqual({ services: 3, artifacts: 3, mappings: 1 });
    expect(doc.counts.services).toBe(doc.services.length);
    expect(doc.counts.mappings).toBe(doc.services.reduce((total, service) => total + service.mappings.length, 0));
  });

  it("includes internal fields, artifacts, and mapping notes in a full file", () => {
    const { file, doc } = open("internal");
    expect(doc.export.audience).toBe("internal");
    expect(doc.export.profile.name).toBe("Full catalog");
    expect(doc.export.distributionStatement).toContain("DO NOT DISTRIBUTE EXTERNALLY");
    expect(doc.workspace.logoUrl).toBe(HTTPS_LOGO);
    expect(doc.export.fieldList.some((field) => field.key === "internal_notes")).toBe(true);
    expect(doc.export.fieldList.some((field) => field.key === "service_code")).toBe(true);
    expect(doc.export.fieldList.some((field) => field.key === "data_residency_regions")).toBe(false);
    expect(fieldValue(doc, "svc-watch", "service_code")).toBe("SVC-4410");
    expect(fieldValue(doc, "svc-watch", "internal_notes")).toBe(SECRET);
    expect(fieldValue(doc, "svc-watch", "current_tooling_notes")).toBe("=CMD()");
    expect(fieldValue(doc, "svc-watch", "support_contact")).toBe(SUPPORT_EMAIL);
    expect(fieldValue(doc, "svc-watch", "approval_required")).toBe(true);
    expect(fieldValue(doc, "svc-watch", "maturity_gap")).toBe(1);
    expect(asLookup(fieldValue(doc, "svc-watch", "category"))).toEqual({
      id: "lookup:category:secops",
      code: "secops",
      label: "Security Operations & Monitoring",
    });
    expect(fieldValue(doc, "svc-watch", "current_maturity_cmmi")).toEqual({
      id: "lookup:maturity_cmmi:2",
      code: "2",
      label: lookups.find((item) => item.field_key === "maturity_cmmi" && item.code === "2")?.label,
    });
    expect(fieldValue(doc, "svc-watch", "target_audience")).toEqual([
      { id: "lookup:target_audience:customers", code: "customers", label: "Customers" },
      { id: "lookup:target_audience:executives", code: "executives", label: "Executives & Board" },
    ]);
    expect(file.body).toContain(INTERNAL_NAME);
    expect(file.body).toContain(INTERNAL_URL);
    expect(file.body).toContain(INTERNAL_NOTE);
    expect(file.body).toContain(RATIONALE);
    expect(file.body).toContain(MAPPING_NOTES);
    expect(file.body).not.toContain(ARCHIVED_RATIONALE);
    expect(file.body).not.toContain(OUTSIDE_URL);
    expect(file.body).not.toContain(USER);
    expect(file.body).not.toContain(EMAIL);
    expect(file.body).not.toContain(PRIVACY);
    expect(file.body).not.toContain("United States");
    expect(artifactField(doc, "art-pager", "owner_team")).toEqual({
      id: "lookup:team:soc",
      code: "soc",
      label: "SOC / SecOps",
    });
    expect(artifactField(doc, "art-pager", "status")).toEqual({
      id: "lookup:artifact_status:retired",
      code: "retired",
      label: "Retired",
    });
    expect(artifactField(doc, "art-pager", "flags")).toEqual(["Retired but still linked"]);
    expect(artifactField(doc, "art-memo", "flags")).toEqual(["Overdue for review"]);
    expect(doc.services.find((service) => service.id === "svc-watch")?.mappings[0]?.rationale).toBe(RATIONALE);
    expect(doc.services.find((service) => service.id === "svc-watch")?.mappings[0]?.notes).toBe(MAPPING_NOTES);
    expect(doc.unlinkedArtifacts.map((item) => item.id)).toEqual(["art-memo", "art-notice"]);
    expect(doc.counts).toEqual({ services: 3, artifacts: 5, mappings: 1 });
  });

  it("follows geography and privacy group options and resolves those lookup labels", () => {
    const enabled = fields.map((field) => (field.field_group === "geography" ? { ...field, is_active: true } : field));
    const full = fullPreset(enabled);
    const { doc } = open("internal", full.fields);
    expect(doc.export.options.geography).toBe(true);
    expect(doc.export.options.privacy).toBe(false);
    expect(doc.export.options.note).toBe("Geography and privacy fields are workspace records. They are not legal conclusions.");
    expect(doc.export.fieldList.some((field) => field.key === "data_residency_regions" && field.group === "geography")).toBe(true);
    expect(doc.export.fieldList.some((field) => field.key === "privacy_operations_notes")).toBe(false);
    expect(fieldValue(doc, "svc-watch", "data_residency_regions")).toEqual([
      { id: "lookup:data_residency_region:us", code: "us", label: "United States" },
      { id: "lookup:data_residency_region:ca", code: "ca", label: "Canada" },
    ]);
    expect(JSON.stringify(doc)).not.toContain(PRIVACY);

    const pub = publicPreset(enabled);
    const publicDoc = open("public", pub.fields).doc;
    expect(publicDoc.export.options.geography).toBe(false);
    expect(publicDoc.export.fieldList.some((field) => field.group === "geography" || field.group === "privacy")).toBe(false);
    expect(JSON.stringify(publicDoc)).not.toContain("United States");
    expect(JSON.stringify(publicDoc)).not.toContain(PRIVACY);
  });

  it("resolves a lookup on a public file when that field is public", () => {
    const opened = fields.map((field) => (field.field_key === "category" ? { ...field, visibility: "public" as const } : field));
    const pub = publicPreset(opened);
    const { file, doc } = open("public", pub.fields);
    expect(doc.export.fieldList.map((field) => field.key)).toEqual(["name", "category", "summary"]);
    expect(asLookup(fieldValue(doc, "svc-watch", "category"))).toEqual({
      id: "lookup:category:secops",
      code: "secops",
      label: "Security Operations & Monitoring",
    });
    expect(file.body).not.toContain(SECRET);
    expect(file.body).not.toContain("SVC-4410");
  });
});
