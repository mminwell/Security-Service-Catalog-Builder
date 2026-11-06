import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
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
const HEADER_BOTTOM = 700;
const CONTENT_TOP = 684;
const CONTENT_BOTTOM = 52;

const SLATE = rgb(20 / 255, 20 / 255, 19 / 255);
const CLAY = rgb(217 / 255, 119 / 255, 87 / 255);
const GRAY = rgb(135 / 255, 134 / 255, 127 / 255);

type Line = {
  text: string;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  gap: number;
};

export async function buildCatalogPdf(document: CatalogDocument, fonts: PdfFonts): Promise<Uint8Array> {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const sans = await pdf.embedFont(fonts.sans, { subset: true });
  const bold = await pdf.embedFont(fonts.sansBold, { subset: true });
  const serif = await pdf.embedFont(fonts.serif, { subset: true });
  const clean = {
    sans: await supportedText(fonts.sans),
    bold: await supportedText(fonts.sansBold),
    serif: await supportedText(fonts.serif),
  };
  let logo: PDFImage | null = null;
  if (document.logo) {
    try {
      logo = document.logo.kind === "png" ? await pdf.embedPng(document.logo.bytes) : await pdf.embedJpg(document.logo.bytes);
    } catch {
      logo = null;
    }
  }

  const maxWidth = RIGHT - LEFT;
  const lines: Line[] = [];
  const push = (text: string, font: PDFFont, size: number, color: Line["color"], gap: number, cleaner: (value: string) => string) => {
    const wrapped = wrapText(cleaner(text), (sample) => font.widthOfTextAtSize(sample, size), maxWidth);
    wrapped.forEach((line, index) => {
      lines.push({ text: line, font, size, color, gap: index === 0 ? gap : 0 });
    });
  };

  push("Service catalog", serif, 22, SLATE, 0, clean.serif);
  push(document.workspaceName, bold, 12, SLATE, 8, clean.bold);
  push(`Prepared ${document.generatedOn}.`, sans, 10, GRAY, 4, clean.sans);
  for (const note of document.notes) push(note, sans, 10, SLATE, 3, clean.sans);
  push(`Fields: ${document.fieldLabels.join(", ")}.`, sans, 10, SLATE, 8, clean.sans);

  if (document.services.length === 0) {
    push("No services are in this export.", sans, 11, SLATE, 16, clean.sans);
  }
  for (const service of document.services) {
    push(`${service.code} · ${service.name}`, serif, 14, SLATE, 16, clean.serif);
    for (const row of service.rows) {
      push(row.label, bold, 9, CLAY, 7, clean.bold);
      push(row.value, sans, 11, SLATE, 1, clean.sans);
    }
  }

  const pages = pack(lines);
  const drawn: PDFPage[] = [];
  for (const group of pages) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    drawn.push(page);
    let y = CONTENT_TOP;
    for (const line of group) {
      y -= line.gap;
      y -= line.size;
      if (line.text) page.drawText(line.text, { x: LEFT, y, size: line.size, font: line.font, color: line.color });
    }
  }
  if (drawn.length === 0) drawn.push(pdf.addPage([PAGE_W, PAGE_H]));
  drawn.forEach((page, index) => drawChrome(page, document, logo, sans, bold, index + 1, drawn.length, clean.sans, clean.bold));
  return pdf.save();
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

function pack(lines: Line[]): Line[][] {
  const pages: Line[][] = [];
  let current: Line[] = [];
  let y = CONTENT_TOP;
  for (const line of lines) {
    const height = line.gap + line.size + 3;
    if (current.length > 0 && y - height < CONTENT_BOTTOM) {
      pages.push(current);
      current = [];
      y = CONTENT_TOP;
    }
    current.push(line);
    y -= height;
  }
  if (current.length > 0) pages.push(current);
  return pages;
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
    page.drawImage(logo, { x: LEFT, y: PAGE_H - 48, width: 22, height: 22 });
    x += 28;
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
