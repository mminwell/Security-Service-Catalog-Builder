import { zipParts } from "@/lib/catalog/zip-pack";
import { clampCell, xmlEscape } from "@/lib/catalog/spreadsheet-text";

export type WorkbookSheet = {
  name: string;
  rows: string[][];
  /** When set, this row uses the bold style. Header is usually 0, or 1 when a marking occupies row 0. */
  headerRow: number;
};

const SHEET_NAME = /[\\/?*[\]:]/g;

export function buildXlsx(sheets: WorkbookSheet[]): Uint8Array {
  const used = new Set<string>();
  const named = sheets.map((sheet, index) => {
    const base = sheet.name.replace(SHEET_NAME, " ").trim().slice(0, 31) || `Sheet${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const tail = ` ${suffix}`;
      name = `${base.slice(0, 31 - tail.length)}${tail}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return { ...sheet, name };
  });

  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypes(named.length),
    "_rels/.rels": rootRels(),
    "xl/workbook.xml": workbookXml(named),
    "xl/_rels/workbook.xml.rels": workbookRels(named.length),
    "xl/styles.xml": stylesXml(),
  };
  named.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet);
  });
  return zipParts(files);
}

function contentTypes(count: number): string {
  const overrides = Array.from({ length: count }, (_, index) => {
    return `  <Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides}
</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheets: WorkbookSheet[]): string {
  const list = sheets
    .map((sheet, index) => `    <sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${list}
  </sheets>
</workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) => {
    return `  <Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><color rgb="FF141413"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF141413"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
</styleSheet>`;
}

function sheetXml(sheet: WorkbookSheet): string {
  const width = Math.max(1, ...sheet.rows.map((row) => row.length));
  const cols = Array.from({ length: width }, (_, index) => {
    const header = sheet.rows[sheet.headerRow]?.[index] ?? "";
    const size = Math.min(48, Math.max(14, header.length + 2));
    return `    <col min="${index + 1}" max="${index + 1}" width="${size}" customWidth="1"/>`;
  }).join("\n");
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const style = rowIndex === sheet.headerRow ? 1 : 0;
          const text = xmlEscape(clampCell(value ?? ""));
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${text}</t></is></c>`;
        })
        .join("");
      const lines = Math.max(1, ...row.map((value) => String(value ?? "").split(/\n/).length));
      const height = Math.min(120, 16 * lines);
      return `    <row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
${cols}
  </cols>
  <sheetData>
${rows}
  </sheetData>
</worksheet>`;
}

function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}
