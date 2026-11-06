import { displayExportValue, formatExportValue } from "@/lib/catalog/export-value";
import { monogram } from "@/lib/catalog/logos";
import type { FieldDefinition, LookupOption, ServiceRecord, Visibility } from "@/lib/catalog/types";

export type CatalogDocument = {
  workspaceName: string;
  audience: Visibility;
  marking: string | null;
  logo: { bytes: Uint8Array; kind: "png" | "jpg" } | null;
  monogram: string;
  generatedOn: string;
  serviceCount: number;
  fieldLabels: string[];
  services: Array<{ code: string; name: string; rows: Array<{ label: string; value: string }> }>;
  notes: string[];
};

export function buildCatalogDocument(args: {
  workspaceName: string;
  logoUrl: string | null;
  audience: Visibility;
  marking: string | null;
  generatedOn: string;
  services: ServiceRecord[];
  fields: FieldDefinition[];
  lookups: LookupOption[];
}): CatalogDocument {
  const geo = args.fields.some((field) => field.field_group === "geography" || field.field_group === "privacy");
  const notes = [
    `${args.services.length} ${args.services.length === 1 ? "service" : "services"} in the current search and filters.`,
    `Audience: ${args.audience === "internal" ? "Internal" : "Public"}.`,
    "Fields follow the selected order. Empty values are shown as an em dash.",
    "This is a service catalog. It is not a certification, an audit report, or a compliance determination.",
  ];
  if (geo) {
    notes.push("Geography and privacy fields are workspace records. They are not legal conclusions.");
  }
  return {
    workspaceName: args.workspaceName,
    audience: args.audience,
    marking: args.marking,
    logo: inlineRasterLogo(args.logoUrl),
    monogram: monogram(args.workspaceName),
    generatedOn: args.generatedOn,
    serviceCount: args.services.length,
    fieldLabels: args.fields.map((field) => field.label),
    services: args.services.map((service) => ({
      code: service.service_code,
      name: service.name,
      rows: args.fields.map((field) => ({
        label: field.label,
        value: displayExportValue(formatExportValue(service, field, args.lookups)),
      })),
    })),
    notes,
  };
}

/** Inline PNG or JPEG only. Remote URLs are ignored so an export does not fetch them. */
export function inlineRasterLogo(logoUrl: string | null | undefined): { bytes: Uint8Array; kind: "png" | "jpg" } | null {
  if (!logoUrl || !logoUrl.startsWith("data:image/")) return null;
  const match = /^data:image\/(png|jpe?g);base64,([a-z0-9+/=\s]+)$/i.exec(logoUrl);
  if (!match) return null;
  try {
    const bytes = decodeBase64(match[2].replace(/\s/g, ""));
    if (bytes.length === 0 || bytes.length > 80 * 1024) return null;
    return { bytes, kind: match[1].toLowerCase() === "png" ? "png" : "jpg" };
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
