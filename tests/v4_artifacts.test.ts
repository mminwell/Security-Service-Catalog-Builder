import { readFileSync } from "node:fs";
import { inflateSync, strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sampleArtifactRecords } from "@/lib/catalog/artifact-samples";
import {
  artifactCsvSection,
  artifactExportMatrix,
  artifactFlags,
  hintsForBlueprint,
  normalizeArtifact,
  planArtifactImport,
  safeHttpUrl,
} from "@/lib/catalog/artifacts";
import { buildCatalogDocument } from "@/lib/catalog/catalog-document";
import { catalogSheets } from "@/lib/catalog/catalog-workbook";
import { buildDocx } from "@/lib/catalog/docx";
import { fullPreset, publicPreset } from "@/lib/catalog/export-plan";
import { buildMappedCsv, mappingFromPreset, resolveMappedColumns, JIRA_PRESET } from "@/lib/catalog/import-presets";
import { buildCatalogPdf, catalogPdfBlocks, type PdfFonts } from "@/lib/catalog/pdf-catalog";
import { distributionMarking, servicesToCsv } from "@/lib/catalog/csv";
import type { Role } from "@/lib/catalog/types";
import {
  deleteArtifact,
  deleteArtifactLink,
  freshDemo,
  importArtifacts,
  saveArtifact,
  saveArtifactLink,
  signInDemo,
  switchTenant,
} from "@/lib/data/model";
import { migrateDemoState } from "@/lib/data/storage";

const TODAY = "2026-11-09";
const INTERNAL_NAME = "SOC Pager Runbook";
const INTERNAL_URL = "https://example.com/acme/internal/soc-pager";
const INTERNAL_NOTE = "Paging path for the monitoring service.";
const PUBLIC_NAME = "Customer Security Overview";
const PUBLIC_URL = "https://example.com/acme/security-overview";

const fonts: PdfFonts = {
  sans: readFileSync("public/fonts/LiberationSans-Regular.ttf"),
  sansBold: readFileSync("public/fonts/LiberationSans-Bold.ttf"),
  serif: readFileSync("public/fonts/LiberationSerif-Regular.ttf"),
};

function acmeDb() {
  const signed = signInDemo(freshDemo(), "owner@example.com");
  const tenant = signed.tenants.find((item) => item.slug === "acme-corp");
  if (!tenant) throw new Error("acme");
  return switchTenant(signed, tenant.id);
}

function asRole(db: ReturnType<typeof acmeDb>, role: Role) {
  return {
    ...db,
    members: db.members.map((member) => (member.tenant_id === db.activeTenantId ? { ...member, role } : member)),
  };
}

function workspace(db: ReturnType<typeof acmeDb>) {
  const tenantId = db.activeTenantId;
  return {
    services: db.services.filter((service) => service.tenant_id === tenantId && !service.archived_at),
    artifacts: db.artifacts.filter((artifact) => artifact.tenant_id === tenantId),
    links: db.artifactLinks.filter((link) => link.tenant_id === tenantId),
    lookups: db.lookups.filter((lookup) => lookup.tenant_id === tenantId),
    fields: db.fields.filter((field) => field.tenant_id === tenantId),
  };
}

describe("artifact registry", () => {
  it("creates, updates, and links an artifact from either side", () => {
    let db = acmeDb();
    const tenantId = db.activeTenantId ?? "";
    const service = db.services.find((row) => row.tenant_id === tenantId && row.service_code === "SVC-005");
    if (!service) throw new Error("service");
    const created = normalizeArtifact({
      id: "33333333-3333-4333-8333-333333333333",
      tenant_id: tenantId,
      name: "AI Use Guideline",
      artifact_type: "guideline",
      owner_team: "privacy_ai_gov",
      status: "draft",
      version: "0.1",
      review_cadence: "annual",
      last_reviewed_date: "2026-01-15",
      next_review_date: null,
      link_url: "https://example.com/acme/ai-guideline",
      description: "How Acme reviews a new AI system before it is used.",
      visibility: "internal",
      created_by: null,
      updated_by: null,
      created_at: "2026-11-09T00:00:00.000Z",
      updated_at: "2026-11-09T00:00:00.000Z",
    });
    expect(created.next_review_date).toBe("2027-01-15");
    db = saveArtifact(db, created);
    db = saveArtifactLink(db, { artifactId: created.id, serviceId: service.id, relationshipNote: "Reviewed during AI intake." });
    const again = saveArtifactLink(db, { artifactId: created.id, serviceId: service.id, relationshipNote: "Updated from the service." });
    const links = again.artifactLinks.filter((link) => link.artifact_id === created.id && link.service_id === service.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.relationship_note).toBe("Updated from the service.");
    const unlinked = deleteArtifactLink(again, links[0].id);
    expect(unlinked.artifactLinks.some((link) => link.artifact_id === created.id)).toBe(false);
  });

  it("keeps viewers from writing, lets editors link, and limits delete to admins", () => {
    const base = acmeDb();
    const artifact = base.artifacts.find((row) => row.name === PUBLIC_NAME);
    if (!artifact) throw new Error("artifact");
    expect(() => saveArtifact(asRole(base, "viewer"), { ...artifact, version: "9" })).toThrow(/artifacts/i);
    const edited = saveArtifact(asRole(base, "editor"), { ...artifact, version: "9" });
    expect(edited.artifacts.find((row) => row.id === artifact.id)?.version).toBe("9");
    expect(() => deleteArtifact(asRole(edited, "editor"), artifact.id)).toThrow(/admin/i);
    const removed = deleteArtifact(asRole(edited, "tenant_admin"), artifact.id);
    expect(removed.artifacts.some((row) => row.id === artifact.id)).toBe(false);
    expect(removed.artifactLinks.some((link) => link.artifact_id === artifact.id)).toBe(false);
  });

  it("refuses an artifact or a link from another workspace", () => {
    const db = acmeDb();
    const meridian = db.tenants.find((tenant) => tenant.slug === "meridian-health");
    const acmeArtifact = db.artifacts.find((row) => row.tenant_id === db.activeTenantId);
    const meridianService = db.services.find((row) => row.tenant_id === meridian?.id);
    if (!meridian || !acmeArtifact || !meridianService) throw new Error("workspaces");
    expect(() => saveArtifact(db, { ...acmeArtifact, tenant_id: meridian.id })).toThrow(/another workspace/i);
    const there = switchTenant(db, meridian.id);
    expect(() => saveArtifactLink(there, { artifactId: acmeArtifact.id, serviceId: meridianService.id })).toThrow(/not in this workspace/i);
    const visible = there.artifacts.filter((row) => row.tenant_id === meridian.id);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((row) => row.tenant_id === meridian.id)).toBe(true);
    expect(there.artifacts.some((row) => row.id === acmeArtifact.id && row.name === acmeArtifact.name)).toBe(true);
  });

  it("flags overdue reviews and retired artifacts that are still linked", () => {
    const { artifacts, links } = sampleArtifactRecords();
    const counts = new Map<string, number>();
    for (const link of links) counts.set(link.artifact_id, (counts.get(link.artifact_id) ?? 0) + 1);
    const standard = artifacts.find((row) => row.name === "Detection Content Standard");
    const retired = artifacts.find((row) => row.name === "Legacy VPN Standard");
    const current = artifacts.find((row) => row.name === INTERNAL_NAME);
    if (!standard || !retired || !current) throw new Error("samples");
    expect(artifactFlags(standard, counts.get(standard.id) ?? 0, TODAY)).toEqual({ overdue: true, retiredLinked: false });
    expect(artifactFlags(retired, counts.get(retired.id) ?? 0, TODAY)).toEqual({ overdue: false, retiredLinked: true });
    expect(artifactFlags(current, counts.get(current.id) ?? 0, TODAY).overdue).toBe(false);
    expect(artifactFlags(retired, 0, TODAY).retiredLinked).toBe(false);
  });

  it("accepts only http and https links", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("https://example.com/acme/security-overview")).toBe("https://example.com/acme/security-overview");
    const db = acmeDb();
    const artifact = db.artifacts.find((row) => row.name === PUBLIC_NAME);
    if (!artifact) throw new Error("artifact");
    expect(() => saveArtifact(db, { ...artifact, link_url: "javascript:alert(1)" })).toThrow(/http or https/i);
  });
});

describe("public exports omit internal artifacts", () => {
  it("keeps internal names, urls, and notes out of CSV, Excel, Word, and PDF", async () => {
    const db = acmeDb();
    const data = workspace(db);
    const pub = publicPreset(data.fields);
    const full = fullPreset(data.fields);
    const shared = {
      services: data.services,
      artifacts: data.artifacts,
      links: data.links,
      lookups: data.lookups,
      today: TODAY,
    };
    const publicTable = artifactExportMatrix({ ...shared, audience: "public", includeServiceCode: pub.fields.some((field) => field.field_key === "service_code") });
    const fullTable = artifactExportMatrix({ ...shared, audience: "internal", includeServiceCode: true });
    const publicText = JSON.stringify(publicTable);
    const fullText = JSON.stringify(fullTable);
    expect(publicText).toContain(PUBLIC_NAME);
    expect(publicText).toContain(PUBLIC_URL);
    expect(publicText).not.toContain(INTERNAL_NAME);
    expect(publicText).not.toContain(INTERNAL_URL);
    expect(publicText).not.toContain(INTERNAL_NOTE);
    expect(publicText).not.toContain("Legacy VPN Standard");
    expect(publicTable.header).not.toContain("Relationship note");
    expect(publicTable.header).not.toContain("Owner team");
    expect(fullText).toContain(INTERNAL_NAME);
    expect(fullText).toContain(INTERNAL_URL);
    expect(fullText).toContain(INTERNAL_NOTE);
    expect(fullText).toContain("Overdue for review");
    expect(fullText).toContain("Retired but still linked");

    const marking = distributionMarking("Acme Corp", "public");
    const csv = `${servicesToCsv(data.services, data.fields, data.lookups, "public", { columns: pub.fields, marking })}\r\n\r\n${artifactCsvSection({ ...shared, audience: "public", includeServiceCode: false, marking })}`;
    expect(csv).toContain("ACME CORP");
    expect(csv).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(csv).toContain(PUBLIC_NAME);
    expect(csv).not.toContain(INTERNAL_NAME);
    expect(csv).not.toContain(INTERNAL_URL);
    expect(csv).not.toContain(INTERNAL_NOTE);

    const sheets = catalogSheets({
      services: data.services,
      fields: pub.fields,
      lookups: data.lookups,
      mappings: [],
      elements: [],
      frameworks: [],
      tenantId: db.activeTenantId ?? "",
      audience: "public",
      marking,
      artifacts: data.artifacts,
      artifactLinks: data.links,
      today: TODAY,
    });
    expect(sheets.map((sheet) => sheet.name)).toContain("Artifacts");
    const artifactSheet = sheets.find((sheet) => sheet.name === "Artifacts");
    const sheetText = JSON.stringify(artifactSheet);
    expect(sheetText).toContain(PUBLIC_NAME);
    expect(sheetText).not.toContain(INTERNAL_URL);
    expect(sheetText).not.toContain(INTERNAL_NAME);

    const doc = buildCatalogDocument({
      workspaceName: "Acme Corp",
      logoUrl: null,
      audience: "public",
      marking,
      generatedOn: TODAY,
      services: data.services,
      fields: pub.fields,
      lookups: data.lookups,
      artifacts: data.artifacts,
      artifactLinks: data.links,
      today: TODAY,
    });
    const docText = JSON.stringify(doc.artifacts);
    expect(docText).toContain(PUBLIC_NAME);
    expect(docText).not.toContain(INTERNAL_NAME);
    expect(docText).not.toContain(INTERNAL_URL);
    expect(docText).not.toContain(INTERNAL_NOTE);

    const docx = zipText(buildDocx(doc), "word/document.xml");
    expect(docx).toContain(PUBLIC_NAME);
    expect(docx).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(docx).not.toContain(INTERNAL_NAME);
    expect(docx).not.toContain(INTERNAL_URL);

    const pdfText = catalogPdfBlocks(doc).map((block) => block.text).join("\n");
    expect(pdfText).toContain(PUBLIC_NAME);
    expect(pdfText).toContain(PUBLIC_URL);
    expect(pdfText).not.toContain(INTERNAL_NAME);
    expect(pdfText).not.toContain(INTERNAL_URL);
    expect(pdfText).not.toContain(INTERNAL_NOTE);
    const pdf = await buildCatalogPdf(doc, fonts);
    expect(Buffer.from(pdf.slice(0, 5)).toString("utf8")).toBe("%PDF-");
    const packed = pdfPlainText(pdf);
    expect(packed).not.toContain(INTERNAL_URL);
    expect(packed).not.toContain(INTERNAL_NOTE);

    const fullDoc = buildCatalogDocument({
      workspaceName: "Acme Corp",
      logoUrl: null,
      audience: "internal",
      marking: distributionMarking("Acme Corp", "all"),
      generatedOn: TODAY,
      services: data.services,
      fields: full.fields,
      lookups: data.lookups,
      artifacts: data.artifacts,
      artifactLinks: data.links,
      today: TODAY,
    });
    expect(JSON.stringify(fullDoc.artifacts)).toContain(INTERNAL_URL);
    expect(fullDoc.marking).toContain("DO NOT DISTRIBUTE EXTERNALLY");

    const jira = buildMappedCsv({
      services: data.services,
      lookups: data.lookups,
      columns: resolveMappedColumns(data.fields, mappingFromPreset(JIRA_PRESET), "public").columns,
      marking,
    });
    expect(jira).not.toContain(INTERNAL_URL);
    expect(jira).not.toContain(INTERNAL_NAME);
  });
});

describe("artifact CSV import and demo migration", () => {
  it("creates and updates artifacts from a mapped CSV", () => {
    const db = acmeDb();
    const table = [
      ["Name", "Type", "Owner team", "Status", "Version", "Review cadence", "Last reviewed", "Link", "Description", "Visibility"],
      [PUBLIC_NAME, "Policy", "Corporate Security / GRC", "Active", "9.9", "Annual", "2026-03-01", PUBLIC_URL, "Updated overview.", "Public"],
      ["Workstation Build Procedure", "Procedure / Runbook", "IT Infrastructure", "Draft", "1", "Annual", "2026-02-01", "https://example.com/acme/build", "How a workstation is built.", "Internal"],
      ["Broken link", "Tool", "", "Active", "", "", "", "javascript:alert(1)", "", "Internal"],
    ];
    const plan = planArtifactImport({
      table,
      map: { name: 0, artifact_type: 1, owner_team: 2, status: 3, version: 4, review_cadence: 5, last_reviewed_date: 6, link_url: 7, description: 8, visibility: 9 },
      lookups: db.lookups.filter((row) => row.tenant_id === db.activeTenantId),
      existing: db.artifacts.filter((row) => row.tenant_id === db.activeTenantId),
    });
    expect(plan.errors.some((error) => /http or https/i.test(error))).toBe(true);
    expect(plan.creates).toBe(1);
    expect(plan.updates).toBe(1);
    expect(plan.rows).toHaveLength(2);
    const imported = importArtifacts(db, plan.rows);
    expect(imported.created).toBe(1);
    expect(imported.updated).toBe(1);
    expect(imported.db.artifacts.find((row) => row.name === PUBLIC_NAME)?.version).toBe("9.9");
    expect(imported.db.artifacts.find((row) => row.name === "Workstation Build Procedure")?.artifact_type).toBe("procedure");
    expect(imported.db.artifacts.some((row) => row.link_url?.startsWith("javascript:"))).toBe(false);
  });

  it("adds sample artifacts to an older demo cache without dropping edits", () => {
    const db = acmeDb();
    const tenantId = db.activeTenantId ?? "";
    const edited = {
      ...db,
      services: db.services.map((service) => (service.tenant_id === tenantId && service.service_code === "SVC-001" ? { ...service, name: "Edited watch" } : service)),
    };
    const legacy = { ...edited } as Record<string, unknown>;
    delete legacy.artifacts;
    delete legacy.artifactLinks;
    const migrated = migrateDemoState(legacy);
    if (!migrated) throw new Error("migrate");
    expect(migrated.services.find((service) => service.service_code === "SVC-001" && service.tenant_id === tenantId)?.name).toBe("Edited watch");
    expect(migrated.artifacts.some((artifact) => artifact.name === INTERNAL_NAME)).toBe(true);
    expect(migrated.lookups.some((row) => row.tenant_id === tenantId && row.field_key === "artifact_type" && row.code === "guideline")).toBe(true);
    const custom = migrateDemoState({
      ...migrated,
      artifacts: migrated.artifacts.map((artifact) => (artifact.name === INTERNAL_NAME ? { ...artifact, version: "kept" } : artifact)),
    });
    expect(custom?.artifacts.find((artifact) => artifact.name === INTERNAL_NAME)?.version).toBe("kept");
    const cleared = migrateDemoState({ ...migrated, artifacts: [], artifactLinks: [] });
    expect(cleared?.artifacts).toEqual([]);
    expect(cleared?.services.find((service) => service.service_code === "SVC-001" && service.tenant_id === tenantId)?.name).toBe("Edited watch");
  });

  it("suggests artifact types on a blueprint without creating documents", () => {
    const hints = hintsForBlueprint("ir-retainer");
    expect(hints.map((hint) => hint.artifact_type)).toEqual(["policy", "procedure"]);
    expect(hints.some((hint) => /does not create/i.test(hint.note))).toBe(true);
    const db = freshDemo();
    expect(db.artifacts.some((artifact) => artifact.name === "Incident response plan")).toBe(false);
  });
});

function zipText(bytes: Uint8Array, path: string): string {
  const files = unzipSync(bytes);
  const file = files[path];
  if (!file) throw new Error(path);
  return strFromU8(file);
}

function pdfPlainText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts = [raw];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = match[1].replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    try {
      parts.push(Buffer.from(inflateSync(Buffer.from(body, "latin1"))).toString("latin1"));
    } catch {
      parts.push(body);
    }
  }
  return parts.join("\n");
}
