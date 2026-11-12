import { Buffer } from "node:buffer";
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { buildCatalogDocument } from "@/lib/catalog/catalog-document";
import { distributionMarking } from "@/lib/catalog/csv";
import { buildDocx } from "@/lib/catalog/docx";
import { publicPreset } from "@/lib/catalog/export-plan";
import { materializeFields } from "@/lib/catalog/fields";
import { buildService } from "@/lib/catalog/service";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAgACAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AL+AD//Z";

const WORKSPACE = "Harbor & Pine";
const SERVICE = "Harbor Watch";
const SUMMARY_TAIL = "Alerts on <priority> & after hours.";
const SECRET = "The night roster is internal.";

const fields = publicPreset(materializeFields("tenant", (key) => `field:${key}`)).fields;

function parseXml(xml: string): Document {
  return new DOMParser({
    onError(level, message) {
      if (level !== "warning") throw new Error(`${level}: ${message}`);
    },
  }).parseFromString(xml, "application/xml");
}

function textOf(node: Document | Element): string {
  const root = node.nodeType === 9 ? (node as Document).documentElement : node;
  return root?.textContent ?? "";
}

function childElements(node: Node): Element[] {
  const children: Element[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) children.push(child as Element);
  }
  return children;
}

function tagged(root: Document | Element, name: string): Element[] {
  const nodes = root.getElementsByTagName(name);
  const found: Element[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes.item(index);
    if (node) found.push(node);
  }
  return found;
}

/** Earlier property must precede later when both are present. Word rejects the reverse order. */
function assertBefore(parent: Element, earlier: string, later: string): void {
  const names = childElements(parent).map((child) => child.localName);
  const left = names.indexOf(earlier);
  const right = names.indexOf(later);
  if (left === -1 || right === -1) return;
  expect(left).toBeLessThan(right);
}

function assertRuns(doc: Document): void {
  for (const run of tagged(doc, "w:r")) {
    expect(tagged(run, "w:r").length === 0 ? "ok" : run.toString()).toBe("ok");
    const children = childElements(run);
    const property = children.findIndex((child) => child.localName === "rPr");
    if (property !== -1) expect(property).toBe(0);
    const props = children.find((child) => child.localName === "rPr");
    if (props) assertBefore(props, "color", "sz");
  }
}

function assertTables(doc: Document): void {
  for (const table of tagged(doc, "w:tbl")) {
    const children = childElements(table);
    expect(children.map((child) => child.localName).slice(0, 2)).toEqual(["tblPr", "tblGrid"]);
    const grid = children[1];
    if (!grid) throw new Error("missing tblGrid");
    const columns = childElements(grid).filter((child) => child.localName === "gridCol");
    expect(columns).toHaveLength(2);
    expect(columns.map((column) => column.getAttribute("w:w"))).toEqual(["2400", "6960"]);
    const rowAt = children.findIndex((child) => child.localName === "tr");
    if (rowAt !== -1) expect(rowAt).toBeGreaterThan(1);
  }
}

function resolvePart(relsPath: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const base = relsPath === "_rels/.rels" ? "" : relsPath.replace(/\/_rels\/[^/]+$/, "");
  const stack: string[] = [];
  for (const segment of `${base}/${target}`.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

function assertPackage(parts: Record<string, Uint8Array>, logo: "png" | "jpg" | null): void {
  const types = parseXml(strFromU8(parts["[Content_Types].xml"]));
  const defaults = new Map(tagged(types, "Default").map((item) => [item.getAttribute("Extension"), item.getAttribute("ContentType")]));
  const overrides = new Map(tagged(types, "Override").map((item) => [item.getAttribute("PartName"), item.getAttribute("ContentType")]));
  expect(defaults.get("rels")).toContain("relationships");
  expect(defaults.get("xml")).toBe("application/xml");
  expect(overrides.get("/word/document.xml")).toContain("wordprocessingml.document.main+xml");
  expect(overrides.get("/word/header1.xml")).toContain("wordprocessingml.header+xml");
  expect(overrides.get("/word/footer1.xml")).toContain("wordprocessingml.footer+xml");
  expect(overrides.get("/word/styles.xml")).toContain("wordprocessingml.styles+xml");
  expect(overrides.get("/word/settings.xml")).toContain("wordprocessingml.settings+xml");
  for (const partName of overrides.keys()) {
    expect(parts[partName?.replace(/^\//, "") ?? ""], partName ?? "").toBeDefined();
  }
  if (logo === "png") {
    expect(defaults.get("png")).toBe("image/png");
    expect(defaults.has("jpeg")).toBe(false);
  } else if (logo === "jpg") {
    expect(defaults.get("jpeg")).toBe("image/jpeg");
    expect(defaults.has("png")).toBe(false);
  } else {
    expect(defaults.has("png")).toBe(false);
    expect(defaults.has("jpeg")).toBe(false);
    expect(parts["word/_rels/header1.xml.rels"]).toBeUndefined();
  }

  for (const [path, bytes] of Object.entries(parts)) {
    if (!path.endsWith(".xml") && !path.endsWith(".rels")) continue;
    const xml = parseXml(strFromU8(bytes));
    if (!path.endsWith(".xml") || path.startsWith("_rels/") || path.includes("/_rels/")) continue;
    assertRuns(xml);
    for (const props of tagged(xml, "w:pPr")) assertBefore(props, "keepNext", "spacing");
    assertTables(xml);
  }

  for (const path of Object.keys(parts)) {
    if (!path.endsWith(".rels")) continue;
    for (const rel of tagged(parseXml(strFromU8(parts[path])), "Relationship")) {
      if (rel.getAttribute("TargetMode") === "External") continue;
      const target = rel.getAttribute("Target") ?? "";
      expect(parts[resolvePart(path, target)], `${path} -> ${target}`).toBeDefined();
    }
  }
}

function assertHeader(header: Document, logo: "png" | "jpg" | null): void {
  const paragraph = tagged(header, "w:p")[0];
  expect(paragraph).toBeTruthy();
  const runs = childElements(paragraph).filter((child) => child.localName === "r");
  expect(textOf(header)).toContain(WORKSPACE);
  if (!logo) {
    expect(tagged(header, "w:drawing")).toHaveLength(0);
    expect(tagged(header, "pic:cNvPr")).toHaveLength(0);
    return;
  }
  expect(runs.length).toBeGreaterThanOrEqual(2);
  expect(childElements(runs[0]).map((child) => child.localName)).toEqual(["drawing"]);
  expect(tagged(runs[0], "w:t")).toHaveLength(0);
  expect(runs[1].textContent ?? "").toContain(WORKSPACE);
  expect(childElements(runs[1])[0]?.localName).toBe("rPr");
  expect(tagged(header, "a:blip")[0]?.getAttribute("r:embed")).toBe("rIdLogo");
  const pictureId = Number(tagged(header, "pic:cNvPr")[0]?.getAttribute("id"));
  expect(Number.isInteger(pictureId)).toBe(true);
  expect(pictureId).toBeGreaterThan(0);
  expect(Number(tagged(header, "wp:docPr")[0]?.getAttribute("id"))).toBeGreaterThan(0);
}

function catalog(logoUrl: string | null): Uint8Array {
  const doc = buildCatalogDocument({
    workspaceName: WORKSPACE,
    logoUrl,
    audience: "public",
    marking: distributionMarking(WORKSPACE, "public"),
    generatedOn: "2026-11-12",
    services: [
      buildService("tenant", {
        service_code: "SVC-001",
        name: SERVICE,
        category: "secops",
        status: "active",
        service_tier: "tier_0",
        summary: `Watches the gate.\n${SUMMARY_TAIL}`,
        owner_team: "soc",
        internal_notes: SECRET,
      }),
    ],
    fields,
    lookups: [],
  });
  if (logoUrl?.startsWith("data:image/png")) expect(doc.logo?.kind).toBe("png");
  else if (logoUrl?.startsWith("data:image/jpeg")) expect(doc.logo?.kind).toBe("jpg");
  else expect(doc.logo).toBeNull();
  return buildDocx(doc);
}

function expectWord(docx: Uint8Array, logo: "png" | "jpg" | null): void {
  expect(String.fromCharCode(docx[0] ?? 0, docx[1] ?? 0)).toBe("PK");
  const parts = unzipSync(docx);
  assertPackage(parts, logo);
  const document = parseXml(strFromU8(parts["word/document.xml"]));
  expect(tagged(document, "w:tbl").length).toBeGreaterThan(0);
  const text = textOf(document);
  expect(text).toContain(WORKSPACE);
  expect(text).toContain(SERVICE);
  expect(text).toContain("Watches the gate.");
  expect(text).toContain(SUMMARY_TAIL);
  expect(text).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
  expect(text).not.toContain(SECRET);
  const header = parseXml(strFromU8(parts["word/header1.xml"]));
  assertHeader(header, logo);
  expect(textOf(header)).toContain("APPROVED FOR CLIENT/LIMITED DISTRIBUTION");
  expect(strFromU8(parts["word/footer1.xml"])).toContain("PAGE");
  if (logo === "png") {
    const media = parts["word/media/logo.png"];
    expect(Buffer.from(media.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
    const rels = parseXml(strFromU8(parts["word/_rels/header1.xml.rels"]));
    expect(tagged(rels, "Relationship")[0]?.getAttribute("Target")).toBe("media/logo.png");
  }
  if (logo === "jpg") {
    const media = parts["word/media/logo.jpeg"];
    expect(Buffer.from(media.subarray(0, 2)).toString("hex")).toBe("ffd8");
    expect(Buffer.from(media.subarray(media.length - 2)).toString("hex")).toBe("ffd9");
    const rels = parseXml(strFromU8(parts["word/_rels/header1.xml.rels"]));
    expect(tagged(rels, "Relationship")[0]?.getAttribute("Target")).toBe("media/logo.jpeg");
  }
}

describe("Word catalog package", () => {
  it("builds a document without a logo that keeps table grids and run order", () => {
    expectWord(catalog(null), null);
  });

  it("builds a PNG data-URL logo in its own header run", () => {
    const png = Buffer.from(PNG_BASE64, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expectWord(catalog(`data:image/png;base64,${PNG_BASE64}`), "png");
  });

  it("builds a JPEG data-URL logo with a jpeg content type", () => {
    const jpeg = Buffer.from(JPEG_BASE64, "base64");
    expect(jpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(jpeg.subarray(jpeg.length - 2).toString("hex")).toBe("ffd9");
    expectWord(catalog(`data:image/jpeg;base64,${JPEG_BASE64}`), "jpg");
  });
});
