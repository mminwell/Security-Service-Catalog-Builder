import type { CatalogDocument } from "@/lib/catalog/catalog-document";
import { xmlEscape } from "@/lib/catalog/spreadsheet-text";
import { zipParts } from "@/lib/catalog/zip-pack";

export function buildDocx(document: CatalogDocument): Uint8Array {
  const logo = document.logo;
  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": contentTypes(logo?.kind ?? null),
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": documentXml(document),
    "word/styles.xml": stylesXml(),
    "word/header1.xml": headerXml(document, Boolean(logo)),
    "word/footer1.xml": footerXml(document),
    "word/settings.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:displayBackgroundShape/>
</w:settings>`,
    "word/_rels/document.xml.rels": documentRels(),
  };
  if (logo) {
    files[`word/media/logo.${logo.kind === "png" ? "png" : "jpeg"}`] = logo.bytes;
    files["word/_rels/header1.xml.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.kind === "png" ? "png" : "jpeg"}"/>
</Relationships>`;
  }
  return zipParts(files);
}

function contentTypes(kind: "png" | "jpg" | null): string {
  const image =
    kind === "png"
      ? `  <Default Extension="png" ContentType="image/png"/>\n`
      : kind === "jpg"
        ? `  <Default Extension="jpeg" ContentType="image/jpeg"/>\n`
        : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${image}  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;
}

function documentRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
      <w:color w:val="141413"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:pPr><w:spacing w:before="280" w:after="80"/><w:keepNext/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
      <w:sz w:val="32"/><w:szCs w:val="32"/>
      <w:color w:val="141413"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
      <w:sz w:val="48"/><w:szCs w:val="48"/>
      <w:color w:val="141413"/>
    </w:rPr>
  </w:style>
</w:styles>`;
}

function documentXml(document: CatalogDocument): string {
  const intro = document.notes.map((note) => paragraph(note)).join("");
  const fields = paragraph(`Fields: ${document.fieldLabels.join(", ")}.`, true);
  const services = document.services
    .map((service) => {
      const rows = service.rows
        .map(
          (row) => `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F0EEE6"/></w:tcPr>${paragraph(row.label, true)}</w:tc>
        <w:tc><w:tcPr><w:tcW w:w="6960" w:type="dxa"/></w:tcPr>${paragraphs(row.value)}</w:tc>
      </w:tr>`,
        )
        .join("");
      return `${heading(`${service.code} · ${service.name}`)}<w:tbl>
        <w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
        </w:tblBorders></w:tblPr>
        ${rows}
      </w:tbl>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphStyled("Service catalog", "Title")}
    ${paragraph(document.workspaceName, true)}
    ${document.marking ? paragraph(document.marking, true) : ""}
    ${paragraph(`Prepared ${document.generatedOn}.`)}
    ${intro}
    ${fields}
    ${services || paragraph("No services are in this export.")}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader"/>
      <w:footerReference w:type="default" r:id="rIdFooter"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1296" w:right="1080" w:bottom="1152" w:left="1080" w:header="576" w:footer="576" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function headerXml(document: CatalogDocument, hasLogo: boolean): string {
  const mark = document.marking ? paragraph(document.marking, true) : "";
  const logo = hasLogo
    ? `<w:r><w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="365760" cy="365760"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="Workspace logo"/>
          <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr><pic:cNvPr id="0" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="365760" cy="365760"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing></w:r>`
    : "";
  const name = `<w:p><w:r>${logo}<w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="28"/><w:color w:val="141413"/></w:rPr><w:t xml:space="preserve">${xmlEscape(hasLogo ? `  ${document.workspaceName}` : `${document.monogram}  ${document.workspaceName}`)}</w:t></w:r></w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  ${name}
  ${mark}
</w:hdr>`;
}

function footerXml(document: CatalogDocument): string {
  const audience = document.audience === "internal" ? "Internal" : "Public";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="87867F"/></w:rPr><w:t xml:space="preserve">${xmlEscape(`Service catalog · ${audience} · Page `)}</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="87867F"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="87867F"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="87867F"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;
}

function paragraph(text: string, strong = false): string {
  return paragraphs(text, strong);
}

function paragraphs(text: string, strong = false): string {
  const parts = text.split(/\n/);
  return parts
    .map((part) => {
      const run = strong
        ? `<w:r><w:rPr><w:b/><w:color w:val="141413"/></w:rPr><w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`
        : `<w:r><w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`;
      return `<w:p>${run}</w:p>`;
    })
    .join("");
}

function paragraphStyled(text: string, style: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function heading(text: string): string {
  return paragraphStyled(text, "Heading1");
}
