import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildCatalogDocument } from "@/lib/catalog/catalog-document";
import { distributionMarking } from "@/lib/catalog/csv";
import { materializeFields } from "@/lib/catalog/fields";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { buildCatalogPdf, type PdfFonts } from "@/lib/catalog/pdf-catalog";
import { buildService, writeField } from "@/lib/catalog/service";
import { fullPreset, publicPreset } from "@/lib/catalog/export-plan";
import type { Artifact, ArtifactLink, FieldDefinition, LookupOption } from "@/lib/catalog/types";

const require = createRequire(import.meta.url);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;

const fonts: PdfFonts = {
  sans: readFileSync("public/fonts/LiberationSans-Regular.ttf"),
  sansBold: readFileSync("public/fonts/LiberationSans-Bold.ttf"),
  serif: readFileSync("public/fonts/LiberationSerif-Regular.ttf"),
};

const fields = materializeFields("tenant", (key) => `field:${key}`);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: seed.code + seed.field_key,
  tenant_id: "tenant",
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

const SECRET = "Locker combination 19-42-7 is taped inside the cabinet.";
const INTERNAL_ARTIFACT = "Locker Roster";
const INTERNAL_URL = "https://example.com/northwind/locker-roster";
const PUBLIC_ARTIFACT = "Harbor Overview Standard";
const PUBLIC_URL = "https://example.com/northwind/harbor-overview";
const EXPORTED_AT = "12 Nov 2026, 15:04";
const EXPORTED_ON = "2026-11-12";

describe("PDF catalog page structure", () => {
  it("builds a title page, details page, accurate index, and a fresh page for each service", async () => {
    const services = [
      service("NW-01", "Harbor Watch", "A short fictional watch over the harbor desk."),
      service("NW-02", "Packet Relay", longText("Packet Relay", "END-PACKET-RELAY")),
      service("NW-03", "Campus Badge Desk for the Fictional Northwind Riverside Annex", "Badges for the riverside annex."),
      service("NW-04", "Vendor Gate", longText("Vendor Gate", "END-VENDOR-GATE")),
      service("NW-05", "Key Ceremony", "A short fictional key ceremony for the vault."),
      service("NW-06", "Night Atlas", "A short fictional map of the night routes."),
    ];
    const doc = documentFor(services, {
      audience: "internal",
      marking: distributionMarking("Northwind Security", "all"),
      profileName: "Full catalog",
      fields: selected(["service_code", "name", "summary", "data_residency_regions"]),
      artifacts: [publicArtifact(), internalArtifact()],
      links: [link("art-public", "NW-01"), link("art-internal", "NW-01")],
    });
    const pdf = await buildCatalogPdf(doc, fonts);
    const pages = await readPages(pdf);
    const flat = pages.map((page) => page.flat);

    expect(flat[0]).toContain("Northwind Security");
    expect(flat[0]).toContain("Service Catalog");
    expect(flat[0]).toContain("DO NOT DISTRIBUTE EXTERNALLY");
    expect(flat[0]).toContain(`Exported ${EXPORTED_ON}`);
    expect(flat[0]).not.toContain("Export details");
    expect(flat[0]).not.toContain("Harbor Watch");
    expect(flat[0]).not.toContain("internal-facing");
    expect(flat[0]).not.toContain("not a certification");
    expect(titleOrder(pages[0])).toBe(true);
    expectRunningChrome(pages, "DO NOT DISTRIBUTE EXTERNALLY");

    expect(flat[1]).toContain("Export details");
    expect(flat[1]).toContain("Northwind Security");
    expect(flat[1]).toContain(EXPORTED_AT);
    expect(flat[1]).toContain("owner@northwind.example");
    expect(flat[1]).toContain("Full catalog");
    expect(flat[1]).toContain("Internal");
    expect(flat[1]).toContain("DO NOT DISTRIBUTE EXTERNALLY");
    expect(flat[1]).toContain("6 services");
    expect(flat[1]).toContain("Service Name");
    expect(flat[1]).toContain("Service Description");
    expect(flat[1]).toContain("Data residency regions");
    expect(flat[1]).toContain("Included: Data residency regions");
    expect(flat[1]).toContain("Privacy");
    expect(flat[1]).toContain("Not included");
    expect(flat[1]).toContain("CSF mappings");
    expect(flat[1]).toContain("2 artifacts");
    expect(flat[1]).toContain("Services, Supporting artifacts");
    expect(flat[1]).toContain("not a certification");
    expect(flat[1]).not.toContain("internal-facing");

    expect(flat[2]).toContain("Index");
    expect(indexPages(pages).length).toBe(1);

    const loaded = await PDFDocument.load(copyBytes(pdf));
    expect(linkCount(loaded)).toBe(services.length);
    expect(await imagePaints(pdf, 1)).toBe(2);
    expect(await imagePaints(pdf, 4)).toBe(1);

    let previous = 0;
    let previousHeading = "";
    for (const entry of doc.services) {
      const listed = listedPage(pages, entry.heading);
      const actual = headingPage(pages, entry.heading);
      expect(listed, entry.heading).toBe(actual);
      expect(actual).toBeGreaterThan(previous);
      expect(flat[actual - 1]).not.toContain("Export details");
      expect(flat[actual - 1]).not.toContain("not a certification");
      if (previousHeading) expect(flat[actual - 1]).not.toContain(previousHeading);
      const headingY = textY(pages[actual - 1], entry.code);
      expect(headingY).toBeGreaterThan(620);
      expect(headingY).toBeLessThan(700);
      previous = actual;
      previousHeading = entry.heading;
    }

    const packet = doc.services[1];
    const vendor = doc.services[3];
    const packetStart = headingPage(pages, packet.heading);
    const vendorStart = headingPage(pages, vendor.heading);
    const packetEnd = pageContaining(pages, "END-PACKET-RELAY");
    const vendorEnd = pageContaining(pages, "END-VENDOR-GATE");
    expect(packetEnd).toBeGreaterThan(packetStart);
    expect(vendorEnd).toBeGreaterThan(vendorStart);
    expect(packetEnd).toBeLessThan(headingPage(pages, doc.services[2].heading));
    expect(vendorEnd).toBeLessThan(headingPage(pages, doc.services[4].heading));
    expect(flat[packetStart - 1]).not.toContain(doc.services[0].heading);
    expect(flat[vendorStart - 1]).not.toContain(doc.services[2].heading);
    expect(flat[packetEnd - 1]).not.toContain(doc.services[2].name);

    expect(flat.join("\n")).toContain(PUBLIC_ARTIFACT);
    expect(flat.join("\n")).toContain(PUBLIC_URL);
    expect(flat.join("\n")).not.toContain(SECRET);
  });

  it("keeps index page numbers correct when the index and some services span pages", async () => {
    const services = Array.from({ length: 48 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      const name = index === 6 ? "Fable 07 Riverside Annex Overnight Desk for the Fictional Campus" : `Fable ${number}`;
      const summary =
        index === 2 || index === 15
          ? longText(name, `END-FABLE-${number}`)
          : `A short fictional note for ${name}.`;
      return service(`FB-${number}`, name, summary);
    });
    const doc = documentFor(services, {
      audience: "internal",
      marking: distributionMarking("Northwind Security", "all"),
      profileName: "Operations readout",
      fields: selected(["name", "summary"]),
    });
    const pdf = await buildCatalogPdf(doc, fonts);
    const pages = await readPages(pdf);
    expectRunningChrome(pages, "DO NOT DISTRIBUTE EXTERNALLY");
    expect(indexPages(pages).length).toBeGreaterThan(1);
    expect(await imagePaints(pdf, 1)).toBe(0);

    let previous = 0;
    for (const entry of doc.services) {
      const listed = listedPage(pages, entry.heading);
      const actual = headingPage(pages, entry.heading);
      expect(listed, entry.heading).toBe(actual);
      expect(actual).toBeGreaterThan(previous);
      const prior = doc.services[doc.services.indexOf(entry) - 1];
      if (prior) expect(pages[actual - 1].flat).not.toContain(prior.heading);
      previous = actual;
    }

    for (const marker of ["END-FABLE-03", "END-FABLE-16"]) {
      const owner = doc.services.find((entry) => entry.rows.some((row) => row.value.includes(marker)));
      if (!owner) throw new Error(marker);
      const start = headingPage(pages, owner.heading);
      const end = pageContaining(pages, marker);
      const next = doc.services[doc.services.indexOf(owner) + 1];
      expect(end).toBeGreaterThan(start);
      if (next) expect(end).toBeLessThan(headingPage(pages, next.heading));
    }

    const loaded = await PDFDocument.load(copyBytes(pdf));
    expect(linkCount(loaded)).toBe(services.length);
  }, 30000);

  it("keeps internal fields and artifacts out of a public PDF", async () => {
    const services = [service("NW-01", "Harbor Watch", "A public description of the fictional harbor watch.")];
    services[0] = writeField(services[0], "internal_notes", SECRET);
    const shared = {
      fields: publicPreset(fields).fields,
      artifacts: [publicArtifact(), internalArtifact()],
      links: [link("art-public", "NW-01"), link("art-internal", "NW-01")],
    };
    const pub = documentFor(services, {
      ...shared,
      audience: "public",
      marking: distributionMarking("Northwind Security", "public"),
      profileName: "Public catalog",
    });
    const full = documentFor(services, {
      ...shared,
      audience: "internal",
      marking: distributionMarking("Northwind Security", "all"),
      profileName: "Full catalog",
      fields: fullPreset(fields).fields,
    });
    const publicPages = await readPages(await buildCatalogPdf(pub, fonts));
    const fullPages = await readPages(await buildCatalogPdf(full, fonts));
    const publicText = publicPages.map((page) => page.flat).join("\n");
    const fullText = fullPages.map((page) => page.flat).join("\n");
    expectRunningChrome(publicPages, "APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expectRunningChrome(fullPages, "DO NOT DISTRIBUTE EXTERNALLY");

    expect(publicText).toContain("Service Catalog");
    expect(publicText).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
    expect(publicText).toContain("Harbor Watch");
    expect(publicText).toContain(PUBLIC_ARTIFACT);
    expect(publicText).toContain(PUBLIC_URL);
    expect(publicText).not.toContain(SECRET);
    expect(publicText).not.toContain(INTERNAL_ARTIFACT);
    expect(publicText).not.toContain(INTERNAL_URL);
    expect(publicText).not.toContain("DO NOT DISTRIBUTE EXTERNALLY");
    expect(publicText).not.toContain("internal-facing");
    expect(publicText).not.toContain("NW-01");

    expect(fullText).toContain(SECRET);
    expect(fullText).toContain(INTERNAL_ARTIFACT);
    expect(fullText).toContain("DO NOT DISTRIBUTE EXTERNALLY");
  });

  it("leaves the distribution line off the title when the marking is off", async () => {
    const doc = documentFor([service("NW-01", "Harbor Watch", "A short fictional watch.")], {
      audience: "public",
      marking: null,
      profileName: "Public catalog",
      fields: selected(["name", "summary"]),
    });
    const pages = await readPages(await buildCatalogPdf(doc, fonts));
    expectRunningChrome(pages, null);
    expect(pages[0].flat).toContain("Service Catalog");
    expect(pages[0].flat).toContain(`Exported ${EXPORTED_ON}`);
    expect(pages[0].flat).not.toContain("DO NOT DISTRIBUTE");
    expect(pages[0].flat).not.toContain("APPROVED FOR CLIENT");
    expect(pages[0].flat).not.toContain("internal-facing");
    expect(pages[1].flat).toContain("Distribution");
    expect(pages[1].flat).toContain("Not included");
  });
});

function documentFor(
  services: ReturnType<typeof service>[],
  options: {
    audience: "public" | "internal";
    marking: string | null;
    profileName: string;
    fields: FieldDefinition[];
    artifacts?: Artifact[];
    links?: ArtifactLink[];
  },
) {
  return buildCatalogDocument({
    workspaceName: "Northwind Security",
    logoUrl: options.audience === "internal" && options.profileName === "Full catalog" ? logoUrl() : null,
    audience: options.audience,
    marking: options.marking,
    generatedOn: EXPORTED_ON,
    generatedAt: EXPORTED_AT,
    profileName: options.profileName,
    exportedBy: "owner@northwind.example",
    csfMappingCount: null,
    services,
    fields: options.fields,
    lookups,
    artifacts: options.artifacts,
    artifactLinks: options.links,
    today: EXPORTED_ON,
  });
}

function selected(keys: string[]): FieldDefinition[] {
  return keys.map((key) => {
    const field = fields.find((item) => item.field_key === key);
    if (!field) throw new Error(key);
    return field;
  });
}

function service(code: string, name: string, summary: string) {
  return writeField(
    buildService("tenant", {
      id: code,
      service_code: code,
      name,
      category: "secops",
      status: "active",
      service_tier: "tier_0",
      summary,
      owner_team: "soc",
    }),
    "data_residency_regions",
    ["us"],
  );
}

function longText(name: string, marker: string): string {
  return `${`Fictional operational detail for ${name} across the quiet night shift. `.repeat(170)}${marker}`;
}

function publicArtifact(): Artifact {
  return artifact("art-public", PUBLIC_ARTIFACT, "public", PUBLIC_URL);
}

function internalArtifact(): Artifact {
  return artifact("art-internal", INTERNAL_ARTIFACT, "internal", INTERNAL_URL);
}

function artifact(id: string, name: string, visibility: "public" | "internal", url: string): Artifact {
  return {
    id,
    tenant_id: "tenant",
    name,
    artifact_type: "standard",
    owner_team: null,
    status: "active",
    version: "1",
    review_cadence: null,
    last_reviewed_date: null,
    next_review_date: null,
    link_url: url,
    description: `${name} for the fictional catalog.`,
    visibility,
    created_by: null,
    updated_by: null,
    created_at: "2026-11-01T15:00:00.000Z",
    updated_at: "2026-11-01T15:00:00.000Z",
  };
}

function link(artifactId: string, serviceId: string): ArtifactLink {
  return {
    id: `${artifactId}:${serviceId}`,
    tenant_id: "tenant",
    artifact_id: artifactId,
    service_id: serviceId,
    relationship_note: null,
    created_by: null,
    created_at: "2026-11-01T15:00:00.000Z",
  };
}

function logoUrl(): string {
  return `data:image/png;base64,${Buffer.from(fictionalLogo()).toString("base64")}`;
}

function fictionalLogo(): Uint8Array {
  const size = 96;
  return rgbaPng(size, size, (x, y) => {
    const dx = x - size / 2 + 0.5;
    const dy = y - size / 2 + 0.5;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 40) return [0, 0, 0, 0];
    if (distance > 30) return [217, 119, 87, 255];
    return [20, 20, 19, 255];
  });
}

function rgbaPng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = pixel(x, y);
      const index = row + 1 + x * 4;
      raw[index] = red;
      raw[index + 1] = green;
      raw[index + 2] = blue;
      raw[index + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Uint8Array(Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]));
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([length, name, data, crc]);
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}

type PageText = {
  flat: string;
  items: Array<{ str: string; x: number; y: number }>;
};

async function readPages(bytes: Uint8Array): Promise<PageText[]> {
  const task = pdfjs.getDocument({
    data: copyBytes(bytes),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await task.promise;
  const pages: PageText[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const items: PageText["items"] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      items.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 });
    }
    const rows: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = [];
    for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - item.y) < 2) last.parts.push(item);
      else rows.push({ y: item.y, parts: [item] });
    }
    const lines = rows.map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    pages.push({ flat: lines.join(" ").replace(/\s+/g, " ").trim(), items });
  }
  await pdf.destroy();
  return pages;
}

function indexPages(pages: PageText[]): PageText[] {
  return pages.filter((page) => /\sp\.\s+\d+/.test(` ${page.flat}`));
}

function listedPage(pages: PageText[], heading: string): number {
  const indexText = indexPages(pages)
    .map((page) => page.flat)
    .join(" ");
  const match = new RegExp(`${escapeRegExp(heading)}\\s+p\\.\\s+(\\d+)`).exec(indexText);
  if (!match) throw new Error(`Index is missing ${heading}`);
  return Number(match[1]);
}

function headingPage(pages: PageText[], heading: string): number {
  const lastIndex = pages.reduce((last, page, index) => (indexPages([page]).length > 0 ? index : last), -1);
  const found = pages.findIndex((page, index) => index > lastIndex && page.flat.includes(heading));
  if (found < 0) throw new Error(`Heading not on a service page: ${heading}`);
  return found + 1;
}

function pageContaining(pages: PageText[], text: string): number {
  const found = pages.findIndex((page) => page.flat.includes(text));
  if (found < 0) throw new Error(`Missing ${text}`);
  return found + 1;
}

function textY(page: PageText | undefined, text: string): number {
  const hits = page?.items.filter((item) => item.str.includes(text)).map((item) => item.y) ?? [];
  if (hits.length === 0) return -1;
  return Math.max(...hits);
}

function band(page: PageText, keep: (y: number) => boolean): string {
  return page.items
    .filter((item) => keep(item.y))
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Header text sits above the rule. Footer text sits with the page number. */
function expectRunningChrome(pages: PageText[], statement: string | null): void {
  pages.forEach((page, index) => {
    const header = band(page, (y) => y > 700);
    const footer = band(page, (y) => y < 48);
    expect(header).not.toContain("DO NOT DISTRIBUTE");
    expect(header).not.toContain("APPROVED FOR CLIENT");
    if (statement) expect(footer).toContain(statement);
    else {
      expect(footer).not.toContain("DO NOT DISTRIBUTE");
      expect(footer).not.toContain("APPROVED FOR CLIENT");
    }
    expect(footer).toContain(`Page ${index + 1} of ${pages.length}`);
  });
  if (!statement || !pages[0]) return;
  const titleBody = band(pages[0], (y) => y >= 48 && y <= 700);
  expect(titleBody).toContain("Service Catalog");
  expect(titleBody).toContain(statement);
}

function titleOrder(page: PageText | undefined): boolean {
  if (!page) return false;
  const title = textY(page, "Service Catalog");
  const names = page.items.filter((item) => item.str.includes("Northwind Security")).map((item) => item.y);
  const dates = page.items.filter((item) => item.str.includes(EXPORTED_ON)).map((item) => item.y);
  const statements = page.items.filter((item) => item.str.includes("DO NOT DISTRIBUTE")).map((item) => item.y);
  if (title < 250 || title > 560) return false;
  const bodyName = Math.min(...names);
  const bodyDate = Math.min(...dates);
  const bodyStatement = statements.filter((y) => y < title).sort((a, b) => b - a)[0];
  return bodyName > title && title > (bodyStatement ?? 0) && (bodyStatement ?? 0) > bodyDate && Math.max(...names) > 720;
}

function linkCount(pdf: PDFDocument): number {
  let count = 0;
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (annots) count += annots.size();
  }
  return count;
}

async function imagePaints(bytes: Uint8Array, pageNumber: number): Promise<number> {
  const task = pdfjs.getDocument({ data: copyBytes(bytes), disableFontFace: true, isEvalSupported: false });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageNumber);
  const ops = await page.getOperatorList();
  const paints = ops.fnArray.filter((fn: number) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length;
  await pdf.destroy();
  return paints;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
