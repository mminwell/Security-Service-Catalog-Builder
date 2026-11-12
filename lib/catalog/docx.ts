import type { CatalogDocument } from "@/lib/catalog/catalog-document";
import { xmlEscape } from "@/lib/catalog/spreadsheet-text";
import { zipParts } from "@/lib/catalog/zip-pack";

export function buildDocx(document: CatalogDocument): Uint8Array {
  const logo = document.logo;
  const media = logo ? logoMedia(logo.kind) : null;
  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": contentTypes(media),
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
  <w:updateFields/>
</w:settings>`,
    "word/_rels/document.xml.rels": documentRels(media?.file ?? null),
  };
  if (logo && media) {
    files[`word/media/${media.file}`] = logo.bytes;
    files["word/_rels/header1.xml.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${media.file}"/>
</Relationships>`;
  }
  return zipParts(files);
}

function logoMedia(kind: "png" | "jpg"): { file: string; extension: string; contentType: string } {
  if (kind === "png") return { file: "logo.png", extension: "png", contentType: "image/png" };
  return { file: "logo.jpeg", extension: "jpeg", contentType: "image/jpeg" };
}

function contentTypes(media: { extension: string; contentType: string } | null): string {
  const image = media ? `  <Default Extension="${media.extension}" ContentType="${media.contentType}"/>\n` : "";
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

function documentRels(logoFile: string | null): string {
  const image = logoFile
    ? `\n  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${logoFile}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${image}
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:color w:val="141413"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:pPr><w:keepNext/><w:spacing w:before="280" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
      <w:color w:val="141413"/>
      <w:sz w:val="32"/><w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
      <w:color w:val="141413"/>
      <w:sz w:val="48"/><w:szCs w:val="48"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Section">
    <w:name w:val="Section"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
      <w:color w:val="141413"/>
      <w:sz w:val="32"/><w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TOC1">
    <w:name w:val="toc 1"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="39"/>
    <w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9360"/></w:tabs></w:pPr>
  </w:style>
  <w:style w:type="character" w:styleId="Hyperlink">
    <w:name w:val="Hyperlink"/>
    <w:uiPriority w:val="99"/>
    <w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>
  </w:style>
</w:styles>`;
}

function documentXml(document: CatalogDocument): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${titlePage(document)}
    ${detailsPage(document)}
    ${indexPage(document)}
    ${servicePages(document)}
    ${artifactSection(document)}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader"/>
      <w:footerReference w:type="default" r:id="rIdFooter"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1296" w:right="1080" w:bottom="1152" w:left="1080" w:header="576" w:footer="576" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function titlePage(document: CatalogDocument): string {
  const logo = document.logo
    ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${logoRun(2, 914400)}</w:p>`
    : "";
  const name = centeredParagraph(document.workspaceName, { before: document.logo ? 200 : 0, size: 36, font: "Georgia" });
  const title = `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:before="240"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Service Catalog</w:t></w:r></w:p>`;
  const marking = document.marking ? centeredParagraph(document.marking, { before: 200, bold: true, size: 20 }) : "";
  const date = centeredParagraph(`Prepared ${document.generatedOn}.`, { before: 120, size: 20, color: "87867F" });
  // This section ends the title page. Vertical alignment applies only here, so later pages stay top-aligned.
  const breakToBody = `<w:p><w:pPr><w:sectPr>
      <w:type w:val="nextPage"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1296" w:right="1080" w:bottom="1152" w:left="1080" w:header="576" w:footer="576" w:gutter="0"/>
      <w:vAlign w:val="center"/>
    </w:sectPr></w:pPr></w:p>`;
  return `${logo}${name}${title}${marking}${date}${breakToBody}`;
}

function detailsPage(document: CatalogDocument): string {
  const geography = document.notes.some((note) => /geography and privacy/i.test(note));
  const rows = [
    { label: "Workspace", value: document.workspaceName },
    { label: "Export date", value: document.generatedOn },
    { label: "Distribution", value: document.marking ?? "None" },
    { label: "Audience", value: document.audience === "internal" ? "Internal use only" : "Approved for client distribution" },
    { label: "Services", value: String(document.serviceCount) },
    { label: "Fields", value: document.fieldLabels.length > 0 ? document.fieldLabels.join(", ") : "None" },
    { label: "Sections", value: "Services, Supporting artifacts" },
    { label: "Artifacts", value: String(artifactCount(document)) },
    {
      label: "Geography and privacy",
      value: geography
        ? "Included. Geography and privacy fields are workspace records. They are not legal conclusions."
        : "Not included.",
    },
  ];
  const notes = [
    "Fields follow the selected order. Empty values are shown as an em dash.",
    "This is a service catalog. It is not a certification, an audit report, or a compliance determination.",
    "Supporting artifacts are links. This file does not contain the documents themselves.",
  ];
  return `${sectionHeading("Export details")}${labeledTable(rows)}${notes.map((note) => paragraph(note)).join("")}`;
}

function indexPage(document: CatalogDocument): string {
  const entries =
    document.services.length === 0
      ? paragraph("No services are in this export.")
      : document.services.map((service, index) => tocEntry(service.heading, index)).join("");
  return `${sectionHeading("Services", true)}<w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    </w:p>
    ${entries}
    <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
}

function tocEntry(heading: string, index: number): string {
  const anchor = bookmarkName(index);
  return `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:hyperlink w:anchor="${anchor}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">${xmlEscape(heading)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${4 + index}</w:t></w:r></w:hyperlink></w:p>`;
}

function servicePages(document: CatalogDocument): string {
  return document.services
    .map((service, index) => `${serviceHeading(service.heading, index)}${labeledTable(service.rows)}`)
    .join("");
}

function serviceHeading(text: string, index: number): string {
  const id = index + 1;
  const anchor = bookmarkName(index);
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:bookmarkStart w:id="${id}" w:name="${anchor}"/><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`;
}

function artifactSection(document: CatalogDocument): string {
  const blocks = document.artifacts
    .map((artifact) => {
      const title = artifact.heading === "Supporting artifacts" ? "" : sectionHeading(artifact.heading);
      return `${title}${labeledTable(artifact.rows)}`;
    })
    .join("");
  return `${sectionHeading("Supporting artifacts", true)}${blocks}`;
}

function artifactCount(document: CatalogDocument): number {
  const onlyEmpty =
    document.artifacts.length === 1 && document.artifacts[0]?.rows.some((row) => row.value === "No artifacts in this export.");
  return onlyEmpty ? 0 : document.artifacts.length;
}

function bookmarkName(index: number): string {
  return `Service${index + 1}`;
}

function sectionHeading(text: string, breakBefore = false): string {
  const pageBreak = breakBefore ? "<w:pageBreakBefore/>" : "";
  return `<w:p><w:pPr><w:pStyle w:val="Section"/>${pageBreak}</w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function centeredParagraph(
  text: string,
  options: { before?: number; bold?: boolean; size?: number; color?: string; font?: string },
): string {
  const spacing = options.before ? `<w:spacing w:before="${options.before}"/>` : "";
  const font = options.font ? `<w:rFonts w:ascii="${options.font}" w:hAnsi="${options.font}" w:cs="${options.font}"/>` : "";
  const bold = options.bold ? "<w:b/>" : "";
  const size = options.size ?? 22;
  return `<w:p><w:pPr>${spacing}<w:jc w:val="center"/></w:pPr><w:r><w:rPr>${font}${bold}<w:color w:val="${options.color ?? "141413"}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function labeledTable(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (row) => `<w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F0EEE6"/></w:tcPr>${paragraph(row.label, true)}</w:tc>
        <w:tc><w:tcPr><w:tcW w:w="6960" w:type="dxa"/></w:tcPr>${paragraphs(row.value)}</w:tc>
      </w:tr>`,
    )
    .join("");
  return `<w:tbl>
        <w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1CFC5"/>
        </w:tblBorders></w:tblPr>
        <w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="6960"/></w:tblGrid>
        ${body}
      </w:tbl>`;
}

function headerXml(document: CatalogDocument, hasLogo: boolean): string {
  const title = hasLogo ? `  ${document.workspaceName}` : `${document.monogram}  ${document.workspaceName}`;
  // The drawing is its own run. Nesting it inside the name run makes Word refuse to open the file.
  const name = `<w:p>${hasLogo ? logoRun(1, 365760) : ""}<w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:color w:val="141413"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${xmlEscape(title)}</w:t></w:r></w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  ${name}
</w:hdr>`;
}

function logoRun(docId: number, emu: number): string {
  return `<w:r><w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${emu}" cy="${emu}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="${docId}" name="Workspace logo ${docId}"/>
          <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr><pic:cNvPr id="${docId}" name="logo ${docId}"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing></w:r>`;
}

function footerXml(document: CatalogDocument): string {
  const lead = document.marking ? `${document.marking} · Page ` : "Page ";
  const pages = String(3 + document.services.length + 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:color w:val="87867F"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${xmlEscape(lead)}</w:t></w:r>
    ${pageField("PAGE", "2")}
    <w:r><w:rPr><w:color w:val="87867F"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r>
    ${pageField("NUMPAGES", pages)}
  </w:p>
</w:ftr>`;
}

function pageField(instruction: string, cached: string): string {
  const props = `<w:rPr><w:color w:val="87867F"/><w:sz w:val="16"/></w:rPr>`;
  return `<w:r>${props}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${props}<w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r><w:r>${props}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${props}<w:t>${xmlEscape(cached)}</w:t></w:r><w:r>${props}<w:fldChar w:fldCharType="end"/></w:r>`;
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

