/**
 * Rebuild data/templates/extended-blueprints.json from the Templates sheet.
 *
 * Keeps rows whose Origin is not "Template store" or "Starter" (including "Starter pack").
 * Labels are stored as workbook text. lib/catalog/blueprint-workbook.ts maps them and
 * throws on an unknown label. `--check` fails the build when the JSON is stale or a label
 * does not map. There is no database write.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { AISLES } from "../lib/catalog/aisles";
import {
  EXPECTED_EXTENDED_TEMPLATE_COUNT,
  PACK_COLUMNS,
  WORKBOOK_COLUMNS,
  importWorkbookBlueprints,
  isExcludedTemplateOrigin,
} from "../lib/catalog/blueprint-workbook";

const XLSX_PATH = resolve("data/templates/Security_Service_Templates_v3_revised.xlsx");
const JSON_PATH = resolve("data/templates/extended-blueprints.json");

const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;

const files = unzip(readFileSync(XLSX_PATH));
const sheetPath = templatesSheetPath(files);
const table = parseSheetRows(files.get(sheetPath)?.toString("utf8") ?? "");
const headers = table[0];
if (!headers) throw new Error("Templates sheet is empty.");
for (const column of WORKBOOK_COLUMNS) {
  if (!headers.includes(column)) throw new Error(`Templates sheet is missing column ${column}.`);
}
const packColumns = PACK_COLUMNS.filter((column) => headers.includes(column));
const originIndex = headers.indexOf("Origin");
if (originIndex < 0) throw new Error("Templates sheet is missing column Origin.");

const rows = table.slice(1).flatMap((cells) => {
  const origin = cells[originIndex] ?? "";
  if (isExcludedTemplateOrigin(origin)) return [];
  if (cells.every((cell) => cell.trim() === "")) return [];
  const row: Record<string, string> = {};
  for (const column of WORKBOOK_COLUMNS) row[column] = cell(cells, headers, column).trim();
  for (const column of packColumns) row[column] = cell(cells, headers, column).trim();
  return [row];
});

if (rows.length !== EXPECTED_EXTENDED_TEMPLATE_COUNT) {
  throw new Error(`Expected ${EXPECTED_EXTENDED_TEMPLATE_COUNT} extended templates, found ${rows.length}.`);
}

const imported = importWorkbookBlueprints(rows, AISLES);
if (imported.blueprints.length !== EXPECTED_EXTENDED_TEMPLATE_COUNT) {
  throw new Error(`Mapped ${imported.blueprints.length} templates, expected ${EXPECTED_EXTENDED_TEMPLATE_COUNT}.`);
}

const json = `${JSON.stringify(rows, null, 2)}\n`;
const packNote =
  packColumns.length === 0
    ? "No Size Packs or Industry Packs column; new templates stay out of the bundles."
    : `Pack columns: ${packColumns.join(", ")}.`;

if (write) {
  writeFileSync(JSON_PATH, json);
  console.log(`Wrote ${rows.length} templates to ${JSON_PATH}. ${packNote}`);
}

if (check) {
  let current = "";
  try {
    current = readFileSync(JSON_PATH, "utf8");
  } catch {
    throw new Error(`Missing ${JSON_PATH}. Run npm run templates:import.`);
  }
  if (current !== json) {
    throw new Error(`Extended templates are stale. Run npm run templates:import. ${packNote}`);
  }
  console.log(`Extended templates match the workbook (${rows.length}). ${packNote}`);
}

function cell(cells: string[], headers: string[], column: string): string {
  const index = headers.indexOf(column);
  if (index < 0) throw new Error(`Templates sheet is missing column ${column}.`);
  return cells[index] ?? "";
}

function templatesSheetPath(zip: Map<string, Buffer>): string {
  const workbook = zip.get("xl/workbook.xml")?.toString("utf8");
  const rels = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new Error("Workbook is missing xl/workbook.xml.");
  const sheet = /<sheet\b[^>]*name="Templates"[^>]*>/.exec(workbook)?.[0];
  if (!sheet) throw new Error("Workbook has no Templates sheet.");
  const relationId = /r:id="([^"]+)"/.exec(sheet)?.[1];
  if (!relationId) throw new Error("Templates sheet has no relationship id.");
  const rel = new RegExp(`<Relationship\\b[^>]*Id="${relationId}"[^>]*>`).exec(rels)?.[0];
  const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : undefined;
  if (!target) throw new Error(`Missing relationship ${relationId} for the Templates sheet.`);
  const path = target.replace(/^\/+/, "").replace(/^xl\//, "");
  return `xl/${path}`;
}

function parseSheetRows(xml: string): string[][] {
  if (!xml) throw new Error("Templates sheet is empty.");
  if (xml.includes("<![CDATA[")) throw new Error("CDATA cells are not supported.");
  const cells = new Map<number, Map<number, string>>();
  const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(xml))) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!ref) throw new Error("Worksheet cell is missing a reference.");
    const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? "";
    let text = "";
    if (inner) {
      if (type !== "inlineStr") throw new Error(`Unsupported cell type ${type || "number"} at ${ref}.`);
      const parts: string[] = [];
      const textRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let textMatch: RegExpExecArray | null;
      while ((textMatch = textRe.exec(inner))) parts.push(decodeXml(textMatch[1] ?? ""));
      if (parts.length === 0) throw new Error(`Inline string at ${ref} has no text.`);
      text = parts.join("");
    } else if (type && type !== "inlineStr") {
      throw new Error(`Unsupported cell type ${type} at ${ref}.`);
    }
    const column = columnIndex(ref);
    const rowNumber = Number(ref.replace(/^[A-Z]+/, ""));
    let row = cells.get(rowNumber);
    if (!row) {
      row = new Map();
      cells.set(rowNumber, row);
    }
    row.set(column, text);
  }
  const rowNumbers = [...cells.keys()].sort((left, right) => left - right);
  if (rowNumbers.length === 0) throw new Error("Templates sheet has no cells.");
  let maxColumn = 0;
  for (const row of cells.values()) {
    for (const column of row.keys()) maxColumn = Math.max(maxColumn, column);
  }
  return rowNumbers.map((rowNumber) => {
    const row = cells.get(rowNumber);
    return Array.from({ length: maxColumn }, (_, index) => row?.get(index + 1) ?? "");
  });
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index;
}

function decodeXml(value: string): string {
  const named = value
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return named.replace(/&amp;/g, "&");
}

function unzip(data: Buffer): Map<string, Buffer> {
  const eocd = findEocd(data);
  const total = data.readUInt16LE(eocd + 10);
  const offset = data.readUInt32LE(eocd + 16);
  if (total === 0xffff || offset === 0xffffffff) throw new Error("ZIP64 workbooks are not supported.");
  const files = new Map<string, Buffer>();
  let pointer = offset;
  for (let index = 0; index < total; index += 1) {
    if (data.readUInt32LE(pointer) !== 0x02014b50) throw new Error("Invalid workbook zip.");
    const method = data.readUInt16LE(pointer + 10);
    const compressedSize = data.readUInt32LE(pointer + 20);
    const nameLength = data.readUInt16LE(pointer + 28);
    const extraLength = data.readUInt16LE(pointer + 30);
    const commentLength = data.readUInt16LE(pointer + 32);
    const localOffset = data.readUInt32LE(pointer + 42);
    const name = data.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    pointer += 46 + nameLength + extraLength + commentLength;
    if (data.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local header for ${name}.`);
    const localNameLength = data.readUInt16LE(localOffset + 26);
    const localExtraLength = data.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = data.subarray(start, start + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
    if (!content) throw new Error(`Unsupported compression method ${method} for ${name}.`);
    files.set(name.replace(/^\/+/, ""), content);
  }
  return files;
}

function findEocd(data: Buffer): number {
  const start = Math.max(0, data.length - 22 - 65535);
  for (let index = data.length - 22; index >= start; index -= 1) {
    if (data.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("Workbook is not a zip file.");
}
