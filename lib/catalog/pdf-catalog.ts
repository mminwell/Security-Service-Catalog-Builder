import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type PDFRef } from "pdf-lib";
import type { CatalogDocument } from "@/lib/catalog/catalog-document";

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
const LABEL_W = (MAX_W * 2400) / 9360;
const VALUE_W = MAX_W - LABEL_W;
const CELL = 10;
const CELL_LINE = 14;
const PAD_X = 6;
const PAD_Y = 5;
const PAGE_ROOM = CONTENT_TOP - CONTENT_BOTTOM;
const BEIGE = rgb(240 / 255, 238 / 255, 230 / 255);
const RULE = rgb(209 / 255, 207 / 255, 197 / 255);

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
type CellLine = { text: string; font: PDFFont; size: number; color: Ink };
type TableChunk = { label: CellLine[]; value: CellLine[]; height: number };
type BodyPage = { lines: PlacedLine[]; tables: Array<{ top: number; chunks: TableChunk[] }> };
type Piece =
  | { kind: "lines"; lines: GlyphLine[] }
  | { kind: "rows"; rows: Array<{ label: string; value: string }>; gapBefore: number };

function textHeight(lineCount: number): number {
  const lines = Math.max(lineCount, 1);
  return PAD_Y * 2 + CELL + (lines - 1) * CELL_LINE;
}
type FaceName = "sans" | "bold" | "serif";
type Face = { font: PDFFont; clean: (value: string) => string };

const NO_LINKS = new Map<string, PDFPage>();

/** Same rows as the Word export-details table. */
export function catalogPdfDetailRows(document: CatalogDocument): Array<{ label: string; value: string }> {
  const geography = document.notes.some((note) => /geography and privacy/i.test(note));
  return [
    { label: "Workspace", value: document.workspaceName },
    { label: "Export date", value: document.generatedOn },
    { label: "Distribution", value: document.marking ?? "None" },
    { label: "Audience", value: document.audience === "internal" ? "Internal use only" : "Approved for client distribution" },
    { label: "Services", value: String(document.serviceCount) },
    { label: "Fields", value: document.fieldLabels.length > 0 ? document.fieldLabels.join(", ") : "None" },
    { label: "Sections", value: "Services, Supporting artifacts" },
    { label: "Artifacts", value: String(document.artifactCount) },
    {
      label: "Geography and privacy",
      value: geography
        ? "Included. Geography and privacy fields are workspace records. They are not legal conclusions."
        : "Not included.",
    },
  ];
}

function detailNotes(): string[] {
  return [
    "Fields follow the selected order. Empty values are shown as an em dash.",
    "This is a service catalog. It is not a certification, an audit report, or a compliance determination.",
    "Supporting artifacts are links. This file does not contain the documents themselves.",
  ];
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
  for (const note of detailNotes()) blocks.push({ text: note, kind: "note" });
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

  const cellLines = (text: string, faceName: FaceName, width: number): CellLine[] => {
    const face = faces[faceName];
    const wrapped = wrapText(face.clean(text), (sample) => face.font.widthOfTextAtSize(sample, CELL), Math.max(12, width - PAD_X * 2));
    const lines = wrapped.length > 0 ? wrapped : [""];
    return lines.map((line) => ({ text: line, font: face.font, size: CELL, color: SLATE }));
  };

  const chunkRow = (label: string, value: string): TableChunk[] => {
    const labelLines = cellLines(label, "bold", LABEL_W);
    const valueLines = cellLines(value, "sans", VALUE_W);
    const capacity = Math.max(1, Math.floor((PAGE_ROOM - PAD_Y * 2 - CELL) / CELL_LINE) + 1);
    const slices: CellLine[][] = [];
    if (valueLines.length <= capacity && textHeight(Math.max(labelLines.length, valueLines.length)) <= PAGE_ROOM) {
      slices.push(valueLines);
    } else {
      for (let index = 0; index < valueLines.length; index += capacity) slices.push(valueLines.slice(index, index + capacity));
    }
    return (slices.length > 0 ? slices : [[]]).map((slice) => ({
      label: labelLines,
      value: slice,
      height: textHeight(Math.max(labelLines.length, slice.length, 1)),
    }));
  };

  const layoutPieces = (pieces: Piece[]): BodyPage[] => {
    const pages: BodyPage[] = [];
    let lines: PlacedLine[] = [];
    let tables: BodyPage["tables"] = [];
    let open: { top: number; chunks: TableChunk[] } | null = null;
    let y = CONTENT_TOP;

    const occupied = () => lines.length > 0 || tables.length > 0 || (open !== null && open.chunks.length > 0);
    const pushPage = () => {
      if (open && open.chunks.length > 0) tables.push(open);
      open = null;
      pages.push({ lines, tables });
      lines = [];
      tables = [];
      y = CONTENT_TOP;
    };
    const ensure = (height: number) => {
      if (occupied() && y - height < CONTENT_BOTTOM) pushPage();
    };

    for (const piece of pieces) {
      if (piece.kind === "lines") {
        if (open && open.chunks.length > 0) {
          tables.push(open);
          open = null;
        }
        for (const line of piece.lines) {
          const gap = lines.length === 0 && tables.length === 0 ? 0 : line.gapBefore;
          ensure(gap + line.size + LEADING);
          const usedGap = lines.length === 0 && tables.length === 0 ? 0 : line.gapBefore;
          const baseline = y - usedGap - line.size;
          lines.push({ line, baseline });
          y = baseline - LEADING;
        }
        continue;
      }
      const gap = occupied() ? piece.gapBefore : 0;
      ensure(gap);
      y -= occupied() ? gap : 0;
      for (const row of piece.rows) {
        for (const chunk of chunkRow(row.label, row.value)) {
          ensure(chunk.height);
          if (!open) open = { top: y, chunks: [] };
          open.chunks.push(chunk);
          y -= chunk.height;
        }
      }
    }
    if (occupied()) {
      if (open && open.chunks.length > 0) tables.push(open);
      pages.push({ lines, tables });
    }
    return pages.length > 0 ? pages : [{ lines: [], tables: [] }];
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

  const detailPacked = layoutPieces([
    { kind: "lines", lines: paragraph("Export details", "serif", 22, SLATE, 0) },
    { kind: "rows", rows: catalogPdfDetailRows(document), gapBefore: 10 },
    {
      kind: "lines",
      lines: detailNotes().flatMap((note, index) => paragraph(note, "sans", 10, SLATE, index === 0 ? 14 : 4)),
    },
  ]);
  const servicePacked = document.services.map((service) =>
    layoutPieces([
      { kind: "lines", lines: paragraph(service.heading, "serif", 18, SLATE, 0) },
      { kind: "rows", rows: service.rows, gapBefore: 8 },
    ]),
  );
  const artifactPieces: Piece[] = [{ kind: "lines", lines: paragraph("Supporting artifacts", "serif", 18, SLATE, 0) }];
  if (document.artifactCount === 0) {
    artifactPieces.push({
      kind: "rows",
      rows: [{ label: "Artifacts", value: "No artifacts in this export." }],
      gapBefore: 8,
    });
  } else {
    for (const artifact of document.artifacts) {
      if (artifact.heading !== "Supporting artifacts") {
        artifactPieces.push({ kind: "lines", lines: paragraph(artifact.heading, "serif", 14, SLATE, 12) });
      }
      artifactPieces.push({ kind: "rows", rows: artifact.rows, gapBefore: 6 });
    }
  }
  const artifactPacked = layoutPieces(artifactPieces);
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
  const paint = (body: BodyPage, links: Map<string, PDFPage>) => {
    const page = pages[cursor];
    drawPlaced(pdf, page, body.lines, links);
    for (const table of body.tables) drawTable(page, table);
    cursor += 1;
  };
  for (const body of detailPacked) paint(body, NO_LINKS);
  for (const placed of indexPacked) paint({ lines: placed, tables: [] }, linkTargets);
  servicePacked.forEach((packed, serviceIndex) => {
    const expected = starts[serviceIndex];
    if (cursor + 1 !== expected) {
      throw new Error(`Service ${serviceIndex} was drawn on page ${cursor + 1}, index says ${expected}.`);
    }
    for (const body of packed) paint(body, NO_LINKS);
  });
  for (const body of artifactPacked) paint(body, NO_LINKS);
  if (cursor !== total) throw new Error(`PDF used ${cursor} pages, expected ${total}.`);

  pages.forEach((page, index) => {
    if (index === 0) return;
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
  const titleTop = PAGE_H - 64;
  const titleBottom = 64;
  let y = (titleTop + titleBottom + height) / 2;
  if (y > titleTop) y = titleTop;
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

function drawTable(page: PDFPage | undefined, table: { top: number; chunks: TableChunk[] }): void {
  if (!page || table.chunks.length === 0) return;
  let y = table.top;
  const boundaries = [y];
  for (const chunk of table.chunks) {
    const bottom = y - chunk.height;
    page.drawRectangle({ x: LEFT, y: bottom, width: LABEL_W, height: chunk.height, color: BEIGE });
    drawCell(page, chunk.label, LEFT, y);
    drawCell(page, chunk.value, LEFT + LABEL_W, y);
    y = bottom;
    boundaries.push(y);
  }
  const top = boundaries[0] ?? table.top;
  const bottom = boundaries[boundaries.length - 1] ?? table.top;
  for (const x of [LEFT, LEFT + LABEL_W, LEFT + MAX_W]) {
    page.drawLine({ start: { x, y: bottom }, end: { x, y: top }, thickness: 0.6, color: RULE });
  }
  for (const line of boundaries) {
    page.drawLine({ start: { x: LEFT, y: line }, end: { x: LEFT + MAX_W, y: line }, thickness: 0.6, color: RULE });
  }
}

function drawCell(page: PDFPage, lines: CellLine[], x: number, top: number): void {
  let baseline = top - PAD_Y - CELL;
  for (const line of lines) {
    if (line.text) page.drawText(line.text, { x: x + PAD_X, y: baseline, size: line.size, font: line.font, color: line.color });
    baseline -= CELL_LINE;
  }
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
  const name = cleanSans(document.workspaceName).trim();
  const showHeader = Boolean(logo) || name.length > 0;
  if (showHeader) {
    let x = LEFT;
    if (logo) {
      const fit = fitBox(logo, 22, 22);
      const top = PAGE_H - 26;
      page.drawImage(logo, { x: LEFT, y: top - fit.height, width: fit.width, height: fit.height });
      x += fit.width + 6;
    } else {
      const mark = cleanBold(document.monogram);
      page.drawText(mark, { x, y: PAGE_H - 42, size: 11, font: bold, color: CLAY });
      x += bold.widthOfTextAtSize(mark, 11) + 8;
    }
    if (name) page.drawText(name, { x, y: PAGE_H - 42, size: 11, font: sans, color: SLATE });
    page.drawLine({ start: { x: LEFT, y: HEADER_BOTTOM }, end: { x: RIGHT, y: HEADER_BOTTOM }, thickness: 1, color: CLAY });
  }
  const pageLabel = `Page ${pageNumber} of ${pageCount}`;
  const footer = cleanSans(document.marking ? `${document.marking} · ${pageLabel}` : pageLabel);
  const lines = wrapText(footer, (sample) => sans.widthOfTextAtSize(sample, 8), MAX_W);
  let y = 28 + (lines.length - 1) * 10;
  for (const line of lines) {
    if (line) page.drawText(line, { x: LEFT, y, size: 8, font: sans, color: GRAY });
    y -= 10;
  }
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
