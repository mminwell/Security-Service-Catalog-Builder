import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blueprintIssues } from "@/lib/catalog/blueprints";
import { formatCatalogCell } from "@/lib/catalog/columns";
import { formatExportValue } from "@/lib/catalog/export-value";
import { INTAKE_METHOD_HELP, materializeFields, PREVIOUS_INTAKE_METHOD_HELP } from "@/lib/catalog/fields";
import { filterServices } from "@/lib/catalog/filter";
import { buildCatalogJson } from "@/lib/catalog/json-catalog";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { buildService, codeList, normalizeService, writeField } from "@/lib/catalog/service";
import type { LookupOption } from "@/lib/catalog/types";
import { migrateDemoState } from "@/lib/data/storage";

const fields = materializeFields("tenant", (key) => `field:${key}`);
const intake = fields.find((field) => field.field_key === "intake_method");
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: `lookup:${seed.field_key}:${seed.code}`,
  tenant_id: "tenant",
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

function serviceWith(methods: string[]) {
  return buildService("tenant", {
    service_code: "SVC-010",
    name: "Intake fixture",
    category: "secops",
    status: "active",
    service_tier: "tier_1",
    summary: "A fictional service used to check intake methods.",
    owner_team: "soc",
    intake_method: methods,
  });
}

describe("intake method multi-select", () => {
  it("uses the same field shape as target audience", () => {
    const audience = fields.find((field) => field.field_key === "target_audience");
    expect(intake).toMatchObject({
      input_type: "multi_select",
      lookup_field_key: "intake_method",
      help_text: INTAKE_METHOD_HELP,
    });
    expect(intake?.input_type).toBe(audience?.input_type);
    expect(STARTER_LOOKUPS.filter((row) => row.field_key === "intake_method")).toHaveLength(6);
    expect(blueprintIssues(STARTER_LOOKUPS).filter((issue) => issue.includes("intake"))).toEqual([]);
  });

  it("keeps several codes and still accepts a legacy single value", () => {
    expect(codeList("itsm_ticket")).toEqual(["itsm_ticket"]);
    expect(codeList("  ")).toEqual([]);
    expect(codeList(null)).toEqual([]);
    const written = writeField(serviceWith([]), "intake_method", ["email", "chat"]);
    expect(written.intake_method).toEqual(["email", "chat"]);
    expect(normalizeService(writeField(written, "intake_method", " scheduled ")).intake_method).toEqual(["scheduled"]);
    expect(serviceWith([]).intake_method).toEqual([]);
  });

  it("renders, filters, and exports multiple methods the way target audience does", () => {
    if (!intake) throw new Error("missing intake field");
    const service = serviceWith(["itsm_ticket", "email"]);
    expect(formatCatalogCell("intake_method", service, intake, lookups, fields).pills).toEqual([
      "ITSM / Ticket",
      "Email Request",
    ]);
    expect(formatExportValue(service, intake, lookups)).toBe("ITSM / Ticket; Email Request");
    const matched = filterServices(
      [service, serviceWith(["chat"])],
      {
        query: "",
        scope: "active",
        rules: [{ id: "rule-1", fieldKey: "intake_method", op: "includes", value: "email" }],
      },
      fields,
    );
    expect(matched).toHaveLength(1);
    const doc = buildCatalogJson({
      workspaceName: "Northwind",
      slug: "northwind",
      audience: "internal",
      profileId: "profile-1",
      profileName: "Full catalog",
      marking: null,
      services: [service],
      fields,
      lookups,
      tenantId: "tenant",
      today: "2026-11-12",
      exportedAt: "2026-11-12T00:00:00.000Z",
    });
    expect(doc.services[0]?.fields.find((field) => field.key === "intake_method")?.value).toEqual([
      { id: "lookup:intake_method:itsm_ticket", code: "itsm_ticket", label: "ITSM / Ticket" },
      { id: "lookup:intake_method:email", code: "email", label: "Email Request" },
    ]);
  });

  it("upgrades a saved demo that still has one intake method", () => {
    const migrated = migrateDemoState({
      tenants: [{ id: "t1", slug: "northwind", name: "Northwind", service_code_mode: "sequential", is_active: true }],
      lookups: [],
      services: [
        {
          id: "s1",
          tenant_id: "t1",
          service_code: "SVC-1",
          name: "Watch",
          intake_method: "itsm_ticket",
          target_audience: ["security_team"],
        },
      ],
      fields: [
        {
          id: "f1",
          tenant_id: "t1",
          field_key: "intake_method",
          label: "Intake Method",
          help_text: PREVIOUS_INTAKE_METHOD_HELP,
          input_type: "dropdown",
          lookup_field_key: "intake_method",
          is_required: false,
          visibility: "internal",
          depth_level: 2,
          sort_order: 190,
          is_active: true,
          is_standard: true,
        },
      ],
      audit: [
        {
          id: "a1",
          tenant_id: "t1",
          actor_user_id: null,
          actor_label: "editor@example.com",
          table_name: "services",
          row_id: "s1",
          action: "update",
          before_data: { intake_method: "email" },
          after_data: { intake_method: "itsm_ticket", name: "Watch" },
          created_at: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    expect(migrated?.services[0]?.intake_method).toEqual(["itsm_ticket"]);
    expect(migrated?.fields.find((field) => field.field_key === "intake_method")).toMatchObject({
      input_type: "multi_select",
      help_text: INTAKE_METHOD_HELP,
    });
    expect(migrated?.audit[0]?.before_data?.intake_method).toEqual(["email"]);
    expect(migrated?.audit[0]?.after_data?.intake_method).toEqual(["itsm_ticket"]);
  });
});

describe("intake method migration", () => {
  const sql = readFileSync("supabase/migrations/0020_v6_intake_method_multi_select.sql", "utf8");
  const seed = readFileSync("supabase/seed.sql", "utf8");

  it("is idempotent, quiet, and converts stored values to text arrays", () => {
    expect(sql).toContain("sscb.skip_audit");
    expect(sql).toContain("input_type = 'multi_select'");
    expect(sql).toContain("alter column intake_method type text[]");
    expect(sql).toContain("starter_service_templates");
    expect(sql).toContain("jsonb_typeof(before_data->'intake_method') = 'string'");
    expect(sql).toContain("jsonb_typeof(v_row->'intake_method') = 'array'");
    expect(sql).toContain("when nullif(btrim(coalesce(v_row->>'intake_method', '')), '') is not null");
    expect(seed).toContain(INTAKE_METHOD_HELP);
    expect(seed).toContain("$sscb$multi_select$sscb$, $sscb$intake_method$sscb$");
    expect(seed).toContain("array[$sscb$itsm_ticket$sscb$]::text[]");
    expect(seed).not.toContain(
      "$sscb$How a request for this service is submitted.$sscb$, $sscb$dropdown$sscb$, $sscb$intake_method$sscb$",
    );
  });
});
