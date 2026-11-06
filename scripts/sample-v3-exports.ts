import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCatalogDocument } from "../lib/catalog/catalog-document";
import { buildCatalogWorkbook } from "../lib/catalog/catalog-workbook";
import { distributionMarking, servicesToCsv } from "../lib/catalog/csv";
import { buildDocx } from "../lib/catalog/docx";
import { fullPreset, publicPreset } from "../lib/catalog/export-plan";
import { buildCatalogPdf } from "../lib/catalog/pdf-catalog";
import { writeField } from "../lib/catalog/service";
import { freshDemo } from "../lib/data/model";

const out = "/opt/cursor/artifacts/v3-samples";
mkdirSync(out, { recursive: true });

const db = freshDemo();
const found = db.tenants.find((item) => item.slug === "acme-corp");
if (!found) throw new Error("Acme Corp is missing from the demo seed.");
const tenant = found;
const fields = db.fields.filter((field) => field.tenant_id === tenant.id);
const lookups = db.lookups.filter((option) => option.tenant_id === tenant.id);
const services = db.services
  .filter((service) => service.tenant_id === tenant.id && !service.archived_at)
  .map((service, index) =>
    index === 0
      ? writeField(
          service,
          "summary",
          `${service.summary}\nSão Paulo — café — naïve.\n${"This fictional monitoring service watches the customer environment during business hours. ".repeat(40)}`,
        )
      : service,
  );
const pub = publicPreset(fields);
const full = fullPreset(fields);
const fonts = {
  sans: readFileSync("public/fonts/LiberationSans-Regular.ttf"),
  sansBold: readFileSync("public/fonts/LiberationSans-Bold.ttf"),
  serif: readFileSync("public/fonts/LiberationSerif-Regular.ttf"),
};

const publicMark = distributionMarking(tenant.name, "public");
const internalMark = distributionMarking(tenant.name, "all");
const publicDoc = buildCatalogDocument({
  workspaceName: tenant.name,
  logoUrl: tenant.logo_url,
  audience: "public",
  marking: publicMark,
  generatedOn: "2026-11-06",
  services,
  fields: pub.fields,
  lookups,
});
const internalDoc = buildCatalogDocument({
  workspaceName: tenant.name,
  logoUrl: tenant.logo_url,
  audience: "internal",
  marking: internalMark,
  generatedOn: "2026-11-06",
  services,
  fields: full.fields,
  lookups,
});

async function main(): Promise<void> {
  writeFileSync(
    `${out}/acme-public-catalog.csv`,
    servicesToCsv(services, fields, lookups, "public", { columns: pub.fields, marking: publicMark }),
  );
  writeFileSync(`${out}/acme-public-catalog.docx`, buildDocx(publicDoc));
  writeFileSync(`${out}/acme-public-catalog.pdf`, await buildCatalogPdf(publicDoc, fonts));
  writeFileSync(`${out}/acme-internal-catalog.docx`, buildDocx(internalDoc));
  writeFileSync(
    `${out}/acme-internal-catalog.xlsx`,
    buildCatalogWorkbook({
      services,
      fields: full.fields,
      lookups,
      mappings: db.mappings.filter((mapping) => mapping.tenant_id === tenant.id),
      elements: db.elements,
      frameworks: db.frameworks,
      tenantId: tenant.id,
      audience: "internal",
      marking: internalMark,
    }),
  );

  const publicCsv = readFileSync(`${out}/acme-public-catalog.csv`, "utf8");
  if (publicCsv.includes("Internal Notes") || publicCsv.includes("Holiday")) {
    throw new Error("Public sample included internal content.");
  }
  console.log(`Wrote fictional Acme samples to ${out}`);
}

void main();
