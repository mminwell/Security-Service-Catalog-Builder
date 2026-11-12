import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type PDFRef } from "pdf-lib";
import type { CatalogDocument } from "@/lib/catalog/catalog-document";
import { visibilityLabel } from "@/lib/catalog/present";

export type PdfFonts = {
  sans: Uint8Array;
  sansBold: Uint8Array;
  serif: Uint8Array;
};

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 54;
const RIGHT = 558;
const MAX_W = RIGHT - LEFT;
const HEADER_BOTTOM = 700;
const CONTENT_TOP = 684;
const CONTENT_BOTTOM = 56;
const LEADING = 4;
const INDEX_TRAIL_W = 56;

const SLATE = rgb(20 / 255, 20 / 255, 19 / 255);
const CLAY = rgb(217 / 255, 119 / 255, 87 / 255);
const GRAY = rgb(135 / 255, 134 / 255, 127 / 255);

type Ink = ReturnType<typeof rgb>;

type PdfBlock = { text: string; kind: "title" | "workspace" | "meta" | "note" | "fields" | "empty" | "section" | "heading" | "label" | "value" };

type GlyphLine = {
  text: string;
  font: PDFFont;
  size: number;
  color: Ink;
  gapBefore: number;
  keepWithNext: boolean;
  linkId?: string;
  trail?: string;
};

type Block = { lines: GlyphLine[]; atomic?: boolean };
type PlacedLine = { line: GlyphLine; baseline: number };
type FaceName = "sans" | "bold" | "serif";
type Face = { font: PDFFont; clean: (value: string) => string };

const NO_LINKS = new Map<string, PDFPage>();

function countPhrase(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/** Facts that describe the file. Shown once, on the details page. */
export function catalogPdfDetailRows(document: CatalogDocument): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Workspace", value: document.workspaceName },
    { label: "Exported", value: document.generatedAt || document.generatedOn },
  ];
  if (document.exportedBy) rows.push({ label: "Exported by", value: document.exportedBy });
  if (document.profileName) rows.push({ label: "Profile", value: document.profileName });
  rows.push(
    { label: "Audience", value: visibilityLabel(document.audience) },
    { label: "Distribution", value: document.marking ?? "Not included" },
    { label: "Services", value: countPhrase(document.serviceCount, "service") },
    { label: "Fields included", value: document.fieldLabels.join(", ") || "None" },
    { label: "Sections", value: "Services, Supporting artifacts" },
    { label: "Artifacts", value: countPhrase(document.artifactCount, "artifact") },
    {
      label: "CSF mappings",
      value: document.csfMappingCount == null ? "Not included" : countPhrase(document.csfMappingCount, "mapping"),
    },
    { label: "Geography", value: document.geographySummary },
    { label: "Privacy", value: document.privacySummary },
  );
  return rows;
}

function supplementalNotes(document: CatalogDocument): string[] {
  return document.notes.filter((note) => !note.startsWith("Audience:") && !/^\d+ services? in the current search/.test(note));
}

/** Body text drawn in the PDF, in order. Header and footer chrome are separate. Page numbers are not included. */
export function catalogPdfBlocks(document: CatalogDocument): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { text: "Service Catalog", kind: "title" },
    { text: document.workspaceName, kind: "workspace" },
    { text: `Exported ${document.generatedOn}`, kind: "meta" },
  ];
  if (document.marking) blocks.push({ text: document.marking, kind: "note" });
  blocks.push({ text: "Export details", kind: "section" });
  for (const row of catalogPdfDetailRows(document)) {
    blocks.push({ text: row.label, kind: "label" }, { text: row.value, kind: "value" });
  }
  for (const note of supplementalNotes(document)) blocks.push({ text: note, kind: "note" });
  blocks.push({ text: "Index", kind: "section" });
  if (document.services.length === 0) blocks.push({ text: "No services are in this export.", kind: "empty" });
  for (const service of document.services) {
    blocks.push({ text: service.heading, kind: "heading" });
    for (const row of service.rows) {
      blocks.push({ text: row.label, kind: "label" }, { text: row.value, kind: "value" });
    }
  }
  blocks.push({ text: "Supporting artifacts", kind: "section" });
  if (document.artifactCount === 0) {
    blocks.push({ text: "No artifacts in this export.", kind: "empty" });
  } else {
    for (const artifact of document.artifacts) {
      blocks.push({ text: artifact.heading, kind: "heading" });
      for (const row of artifact.rows) {
        blocks.push({ text: row.label, kind: "label" }, { text: row.value, kind: "value" });
      }
    }
  }
  return blocks;
}

export async function buildCatalogPdf(document: CatalogDocument, fonts: PdfFonts): Promise<Uint8Array> {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const sans = await pdf.embedFont(fonts.sans, { subset: true });
  const bold = await pdf.embedFont(fonts.sansBold, { subset: true });
  const serif = await pdf.embedFont(fonts.serif, { subset: true });
  const faces: Record<FaceName, Face> = {
    sans: { font: sans, clean: await supportedText(fonts.sans) },
    bold: { font: bold, clean: await supportedText(fonts.sansBold) },
    serif: { font: serif, clean: await supportedText(fonts.serif) },
  };
  let logo: PDFImage | null = null;
  if (document.logo) {
    try {
      logo = document.logo.kind === "png" ? await pdf.embedPng(document.logo.bytes) : await pdf.embedJpg(document.logo.bytes);
    } catch {
      logo = null;
    }
  }

  const paragraph = (text: string, faceName: FaceName, size: number, color: Ink, gapBefore: number, width = MAX_W, linkId?: string): GlyphLine[] => {
    const face = faces[faceName];
    const wrapped = wrapText(face.clean(text), (sample) => face.font.widthOfTextAtSize(sample, size), width);
    const lines = wrapped.length > 0 ? wrapped : [""];
    return lines.map((line, index) => ({
      text: line,
      font: face.font,
      size,
      color,
      gapBefore: index === 0 ? gapBefore : 0,
      keepWithNext: false,
      linkId,
    }));
  };

  const fieldBlock = (label: string, value: string, gap = 12): Block => {
    const labels = paragraph(label, "bold", 9, CLAY, gap);
    const values = paragraph(value, "sans", 11, SLATE, 2);
    if (labels.length > 0) labels[labels.length - 1].keepWithNext = true;
    return { lines: [...labels, ...values] };
  };

  const headingLines = (text: string, size: number, gapBefore: number): GlyphLine[] => {
    const lines = paragraph(text, "serif", size, SLATE, gapBefore);
    for (const line of lines) line.keepWithNext = true;
    return lines;
  };

  const serviceBlocks = (service: CatalogDocument["services"][number]): Block[] => {
    const head = headingLines(service.heading, 18, 0);
    if (service.rows.length === 0) {
      for (const line of head) line.keepWithNext = false;
      return [{ atomic: true, lines: head }];
    }
    const [first, ...rest] = service.rows;
    const blocks: Block[] = [{ lines: [...head, ...fieldBlock(first.label, first.value).lines] }];
    for (const row of rest) blocks.push(fieldBlock(row.label, row.value));
    return blocks;
  };

  const detailBlocks = (): Block[] => {
    const blocks: Block[] = [{ atomic: true, lines: paragraph("Export details", "serif", 22, SLATE, 0) }];
    for (const row of catalogPdfDetailRows(document)) blocks.push(fieldBlock(row.label, row.value, 8));
    const notes = supplementalNotes(document);
    if (notes.length > 0) {
      const label = paragraph("Notes", "bold", 9, CLAY, 12);
      if (label.length > 0) label[label.length - 1].keepWithNext = true;
      blocks.push({ lines: [...label, ...paragraph(notes[0], "sans", 10, SLATE, 3)] });
      for (const note of notes.slice(1)) blocks.push({ lines: paragraph(note, "sans", 10, SLATE, 4) });
    }
    return blocks;
  };

  const indexBlocks = (pageNumbers: number[]): Block[] => {
    const blocks: Block[] = [{ atomic: true, lines: paragraph("Index", "serif", 22, SLATE, 0) }];
    if (document.services.length === 0) {
      blocks.push({ lines: paragraph("No services are in this export.", "sans", 11, SLATE, 14) });
      return blocks;
    }
    document.services.forEach((service, index) => {
      const lines = paragraph(service.heading, "sans", 11, SLATE, 10, MAX_W - INDEX_TRAIL_W, serviceLinkId(index));
      const last = lines[lines.length - 1];
      if (last) last.trail = `p. ${pageNumbers[index] ?? 0}`;
      blocks.push({ atomic: true, lines });
    });
    return blocks;
  };

  const artifactBlocks = (): Block[] => {
    const blocks: Block[] = [{ atomic: true, lines: paragraph("Supporting artifacts", "serif", 18, SLATE, 0) }];
    if (document.artifactCount === 0) {
      blocks.push({ lines: paragraph("No artifacts in this export.", "sans", 11, SLATE, 14) });
      return blocks;
    }
    for (const artifact of document.artifacts) {
      const head = headingLines(artifact.heading, 14, 16);
      const [first, ...rest] = artifact.rows;
      if (!first) {
        for (const line of head) line.keepWithNext = false;
        blocks.push({ atomic: true, lines: head });
        continue;
      }
      blocks.push({ lines: [...head, ...fieldBlock(first.label, first.value).lines] });
      for (const row of rest) blocks.push(fieldBlock(row.label, row.value));
    }
    return blocks;
  };

  const detailPacked = packBlocks(detailBlocks());
  const servicePacked = document.services.map((service) => packBlocks(serviceBlocks(service)));
  const artifactPacked = packBlocks(artifactBlocks());
  const serviceCounts = servicePacked.map((pages) => pages.length);

  // The index prints the page each service starts on, and those page numbers
  // depend on how many pages the index itself takes. Measure again until the
  // index length matches the length used to assign the numbers.
  let indexCount = 1;
  let starts: number[] = [];
  let indexPacked: PlacedLine[][] = [];
  let settled = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    starts = serviceStartPages(detailPacked.length, indexCount, serviceCounts);
    indexPacked = packBlocks(indexBlocks(starts));
    if (indexPacked.length === indexCount) {
      settled = true;
      break;
    }
    indexCount = indexPacked.length;
  }
  if (!settled) throw new Error("PDF index page numbers did not settle.");

  const total = 1 + detailPacked.length + indexPacked.length + serviceCounts.reduce((sum, count) => sum + count, 0) + artifactPacked.length;
  const pages: PDFPage[] = [];
  for (let index = 0; index < total; index += 1) pages.push(pdf.addPage([PAGE_W, PAGE_H]));

  const linkTargets = new Map<string, PDFPage>();
  starts.forEach((pageNumber, index) => {
    const target = pages[pageNumber - 1];
    if (target) linkTargets.set(serviceLinkId(index), target);
  });

  drawTitle(pages[0], document, logo, faces);
  let cursor = 1;
  for (const placed of detailPacked) {
    drawPlaced(pdf, pages[cursor], placed, NO_LINKS);
    cursor += 1;
  }
  for (const placed of indexPacked) {
    drawPlaced(pdf, pages[cursor], placed, linkTargets);
    cursor += 1;
  }
  servicePacked.forEach((packed, serviceIndex) => {
    const expected = starts[serviceIndex];
    if (cursor + 1 !== expected) {
      throw new Error(`Service ${serviceIndex} was drawn on page ${cursor + 1}, index says ${expected}.`);
    }
    for (const placed of packed) {
      drawPlaced(pdf, pages[cursor], placed, NO_LINKS);
      cursor += 1;
    }
  });
  for (const placed of artifactPacked) {
    drawPlaced(pdf, pages[cursor], placed, NO_LINKS);
    cursor += 1;
  }
  if (cursor !== total) throw new Error(`PDF used ${cursor} pages, expected ${total}.`);

  pages.forEach((page, index) => {
    drawChrome(page, document, logo, faces.sans.font, faces.bold.font, index + 1, pages.length, faces.sans.clean, faces.bold.clean);
  });
  return pdf.save();
}

function serviceLinkId(index: number): string {
  return `service-${index}`;
}

function serviceStartPages(detailCount: number, indexCount: number, serviceCounts: number[]): number[] {
  let page = 1 + detailCount + indexCount + 1;
  return serviceCounts.map((count) => {
    const start = page;
    page += Math.max(count, 1);
    return start;
  });
}

function packBlocks(blocks: Block[]): PlacedLine[][] {
  const packed = paginate(blocks);
  return packed.length > 0 ? packed : [[]];
}

function paginate(blocks: Block[]): PlacedLine[][] {
  const pages: PlacedLine[][] = [];
  let current: PlacedLine[] = [];
  let y = CONTENT_TOP;

  const breakPage = () => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    y = CONTENT_TOP;
  };

  for (const block of blocks) {
    if (block.lines.length === 0) continue;
    if (block.atomic && current.length > 0 && !measure(block.lines, y, false).fits) breakPage();
    let index = 0;
    while (index < block.lines.length) {
      const line = block.lines[index];
      const next = line.keepWithNext ? block.lines[index + 1] : undefined;
      const chunk = next ? [line, next] : [line];
      const room = measure(chunk, y, current.length === 0);
      if (!room.fits && current.length > 0) {
        breakPage();
        continue;
      }
      const one = measure([line], y, current.length === 0);
      const baseline = one.baselines[0] ?? CONTENT_TOP - line.size;
      current.push({ line, baseline });
      y = one.endY;
      index += 1;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function measure(lines: GlyphLine[], startY: number, pageEmpty: boolean): { fits: boolean; endY: number; baselines: number[] } {
  let y = startY;
  const baselines: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const gap = index === 0 && pageEmpty ? 0 : line.gapBefore;
    const baseline = y - gap - line.size;
    if (baseline < CONTENT_BOTTOM) return { fits: false, endY: y, baselines };
    baselines.push(baseline);
    y = baseline - LEADING;
  }
  return { fits: true, endY: y, baselines };
}

type TitleOp =
  | { kind: "gap"; height: number }
  | { kind: "logo"; width: number; height: number }
  | { kind: "text"; text: string; font: PDFFont; size: number; color: Ink }
  | { kind: "rule" };

function drawTitle(page: PDFPage, document: CatalogDocument, logo: PDFImage | null, faces: Record<FaceName, Face>): void {
  const ops: TitleOp[] = [];
  const centered = (text: string, face: Face, size: number, color: Ink) => {
    const wrapped = wrapText(face.clean(text), (sample) => face.font.widthOfTextAtSize(sample, size), MAX_W);
    for (const line of wrapped) ops.push({ kind: "text", text: line, font: face.font, size, color });
  };
  if (logo) {
    const fit = fitBox(logo, 72, 72);
    ops.push({ kind: "logo", width: fit.width, height: fit.height });
    ops.push({ kind: "gap", height: 18 });
  }
  centered(document.workspaceName, faces.bold, 14, SLATE);
  ops.push({ kind: "gap", height: 10 });
  centered("Service Catalog", faces.serif, 28, SLATE);
  ops.push({ kind: "gap", height: 14 });
  ops.push({ kind: "rule" });
  ops.push({ kind: "gap", height: 14 });
  if (document.marking) {
    centered(document.marking, faces.sans, 11, SLATE);
    ops.push({ kind: "gap", height: 10 });
  }
  centered(`Exported ${document.generatedOn}`, faces.sans, 11, GRAY);

  const height = ops.reduce((sum, op) => sum + titleOpHeight(op), 0);
  let y = (CONTENT_TOP + CONTENT_BOTTOM + height) / 2;
  if (y > CONTENT_TOP) y = CONTENT_TOP;
  for (const op of ops) {
    if (op.kind === "gap") {
      y -= op.height;
      continue;
    }
    if (op.kind === "logo" && logo) {
      y -= op.height;
      page.drawImage(logo, { x: (PAGE_W - op.width) / 2, y, width: op.width, height: op.height });
      continue;
    }
    if (op.kind === "rule") {
      y -= 1;
      const ruleW = 64;
      page.drawLine({
        start: { x: (PAGE_W - ruleW) / 2, y },
        end: { x: (PAGE_W + ruleW) / 2, y },
        thickness: 1,
        color: CLAY,
      });
      continue;
    }
    if (op.kind === "text") {
      y -= op.size;
      const width = op.font.widthOfTextAtSize(op.text, op.size);
      if (op.text) page.drawText(op.text, { x: (PAGE_W - width) / 2, y, size: op.size, font: op.font, color: op.color });
      y -= 3;
    }
  }
}

function titleOpHeight(op: TitleOp): number {
  if (op.kind === "text") return op.size + 3;
  if (op.kind === "logo") return op.height;
  if (op.kind === "rule") return 1;
  return op.height;
}

function drawPlaced(pdf: PDFDocument, page: PDFPage | undefined, placed: PlacedLine[], links: Map<string, PDFPage>): void {
  if (!page) return;
  let active: { id: string; top: number; bottom: number } | null = null;
  const flush = () => {
    if (!active) return;
    const target = links.get(active.id);
    if (target) addLink(pdf, page, LEFT - 2, active.bottom - 2, MAX_W + 4, active.top - active.bottom + 4, target);
    active = null;
  };
  for (const { line, baseline } of placed) {
    const top = baseline + line.size;
    if (line.linkId) {
      if (!active || active.id !== line.linkId) {
        flush();
        active = { id: line.linkId, top, bottom: baseline };
      } else {
        active.top = Math.max(active.top, top);
        active.bottom = Math.min(active.bottom, baseline);
      }
    } else {
      flush();
    }
    if (line.text) page.drawText(line.text, { x: LEFT, y: baseline, size: line.size, font: line.font, color: line.color });
    if (line.trail) {
      const width = line.font.widthOfTextAtSize(line.trail, line.size);
      page.drawText(line.trail, { x: RIGHT - width, y: baseline, size: line.size, font: line.font, color: GRAY });
    }
  }
  flush();
}

function addLink(pdf: PDFDocument, page: PDFPage, x: number, y: number, width: number, height: number, target: PDFPage): void {
  const annot = pdf.context.register(
    pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      Dest: [target.ref, "XYZ", null, PAGE_H, null],
    }),
  );
  page.node.addAnnot(annot as PDFRef);
}

let cachedFonts: Promise<PdfFonts> | null = null;

/** Same-origin font files only. This does not fetch a company logo or any external URL. */
export function loadPdfFonts(): Promise<PdfFonts> {
  if (typeof fetch !== "function") {
    return Promise.reject(new Error("PDF fonts are loaded in the browser from this app."));
  }
  if (!cachedFonts) {
    cachedFonts = Promise.all([
      readFont("/fonts/LiberationSans-Regular.ttf"),
      readFont("/fonts/LiberationSans-Bold.ttf"),
      readFont("/fonts/LiberationSerif-Regular.ttf"),
    ]).then(([sans, sansBold, serif]) => ({ sans, sansBold, serif }));
  }
  return cachedFonts;
}

async function readFont(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("PDF fonts could not be loaded from this app.");
  return new Uint8Array(await response.arrayBuffer());
}

async function supportedText(bytes: Uint8Array): Promise<(value: string) => string> {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const opened = fontkit.create(bytes);
  return (value: string) => {
    let out = "";
    for (const char of value) {
      if (char === "\n" || char === "\r" || char === "\t") {
        out += char;
        continue;
      }
      const point = char.codePointAt(0) ?? 0;
      const glyph = opened.glyphForCodePoint(point);
      out += glyph && glyph.id !== 0 ? char : "□";
    }
    return out;
  };
}

function drawChrome(
  page: PDFPage,
  document: CatalogDocument,
  logo: PDFImage | null,
  sans: PDFFont,
  bold: PDFFont,
  pageNumber: number,
  pageCount: number,
  cleanSans: (value: string) => string,
  cleanBold: (value: string) => string,
): void {
  let x = LEFT;
  if (logo) {
    const fit = fitBox(logo, 22, 22);
    const top = PAGE_H - 26;
    page.drawImage(logo, { x: LEFT, y: top - fit.height, width: fit.width, height: fit.height });
    x += fit.width + 6;
  } else {
    page.drawText(cleanBold(document.monogram), { x, y: PAGE_H - 42, size: 11, font: bold, color: CLAY });
    x += bold.widthOfTextAtSize(cleanBold(document.monogram), 11) + 8;
  }
  page.drawText(cleanSans(document.workspaceName), { x, y: PAGE_H - 42, size: 11, font: sans, color: SLATE });
  if (document.marking) {
    const marking = cleanBold(document.marking);
    const size = 8;
    const lines = wrapText(marking, (sample) => bold.widthOfTextAtSize(sample, size), RIGHT - LEFT);
    let y = PAGE_H - 58;
    for (const line of lines.slice(0, 2)) {
      page.drawText(line, { x: LEFT, y, size, font: bold, color: SLATE });
      y -= 10;
    }
  }
  page.drawLine({ start: { x: LEFT, y: HEADER_BOTTOM }, end: { x: RIGHT, y: HEADER_BOTTOM }, thickness: 1, color: CLAY });
  const audience = document.audience === "internal" ? "Internal" : "Public";
  const footer = cleanSans(`Service catalog · ${audience} · Page ${pageNumber} of ${pageCount}`);
  page.drawText(footer, { x: LEFT, y: 28, size: 8, font: sans, color: GRAY });
}

function fitBox(image: PDFImage, maxW: number, maxH: number): { width: number; height: number } {
  const width = image.width || 1;
  const height = image.height || 1;
  const scale = Math.min(maxW / width, maxH / height);
  return { width: width * scale, height: height * scale };
}

function wrapText(text: string, widthOf: (sample: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const pieces = splitLong(word, widthOf, maxWidth);
      for (const piece of pieces) {
        const trial = current ? `${current} ${piece}` : piece;
        if (widthOf(trial) <= maxWidth) current = trial;
        else {
          if (current) lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function splitLong(word: string, widthOf: (sample: string) => number, maxWidth: number): string[] {
  if (widthOf(word) <= maxWidth) return [word];
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const trial = current + char;
    if (current && widthOf(trial) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = trial;
    }
  }
  if (current) parts.push(current);
  return parts;
}
