import { describe, expect, it } from "vitest";
import { formatCatalogCell } from "@/lib/catalog/columns";
import { formatExportValue } from "@/lib/catalog/export-value";
import { materializeFields } from "@/lib/catalog/fields";
import { STARTER_LOOKUPS } from "@/lib/catalog/lookups";
import { parseCsv } from "@/lib/catalog/lookup-csv";
import { displayServiceOwner, ownerDisplayName, presentedServiceOwner } from "@/lib/catalog/owner-names";
import { blankService, buildService } from "@/lib/catalog/service";
import {
  materializeServiceImports,
  planServiceImport,
  suggestServiceColumnMap,
} from "@/lib/catalog/service-import";
import type { LookupOption } from "@/lib/catalog/types";

const TENANT = "tenant-northwind";
const fields = materializeFields(TENANT, (key) => `field:${key}`);
const lookups: LookupOption[] = STARTER_LOOKUPS.map((seed) => ({
  id: `lookup:${seed.field_key}:${seed.code}`,
  tenant_id: TENANT,
  field_key: seed.field_key,
  code: seed.code,
  label: seed.label,
  description: seed.description,
  code_prefix: seed.code_prefix,
  sort_order: seed.sort_order,
  is_active: true,
}));

const ownerField = fields.find((field) => field.field_key === "service_owner");

describe("service owner display", () => {
  it("shows Last, First and drops a stray comma when only one name is present", () => {
    expect(ownerDisplayName("Ada", "Lovelace")).toBe("Lovelace, Ada");
    expect(ownerDisplayName("  Ada  ", "  Lovelace  ")).toBe("Lovelace, Ada");
    expect(ownerDisplayName("Ada", "")).toBe("Ada");
    expect(ownerDisplayName("", "Lovelace")).toBe("Lovelace");
    expect(ownerDisplayName("  ", "  ")).toBe("");
    expect(displayServiceOwner("Ada Lovelace")).toBe("Lovelace, Ada");
    expect(displayServiceOwner("  Lovelace,   Ada ")).toBe("Lovelace, Ada");
    expect(displayServiceOwner("Ada")).toBe("Ada");
    expect(displayServiceOwner(", Ada")).toBe("Ada");
    expect(displayServiceOwner("Lovelace,")).toBe("Lovelace");
    expect(displayServiceOwner("SOC Manager")).toBe("SOC Manager");
    expect(displayServiceOwner("Security Architecture (to be named)")).toBe("Security Architecture (to be named)");
    expect(
      presentedServiceOwner(
        { service_owner: "Ada", owner_id: "owner-1" },
        [{ id: "owner-1", first_name: "Ada", last_name: "Lovelace" }],
      ),
    ).toBe("Lovelace, Ada");
  });

  it("uses the same text in the catalog cell and in an export", () => {
    if (!ownerField) throw new Error("missing service owner field");
    const person = buildService(TENANT, {
      service_code: "SVC-014",
      name: "Harbor Watch",
      category: "secops",
      status: "active",
      service_tier: "tier_1",
      summary: "Fictional monitoring.",
      owner_team: "soc",
      service_owner: "Ada Lovelace",
    });
    const role = { ...person, service_owner: "SOC Manager" };
    const given = { ...person, service_owner: "Ada" };
    expect(formatCatalogCell("service_owner", person, ownerField, lookups, fields).text).toBe("Lovelace, Ada");
    expect(formatExportValue(person, ownerField, lookups)).toBe("Lovelace, Ada");
    expect(formatCatalogCell("service_owner", role, ownerField, lookups, fields).text).toBe("SOC Manager");
    expect(formatExportValue(given, ownerField, lookups)).toBe("Ada");
  });
});

describe("service CSV import", () => {
  it("maps first and last name columns and stores Last, First", () => {
    const table = parseCsv(
      "Service Name,First Name,Last Name,Category,Status,Owner Team\nHarbor Watch,  Ada , Lovelace ,Security Operations & Monitoring,Active,SOC / SecOps\n",
    );
    const map = suggestServiceColumnMap(table[0] ?? [], fields);
    expect(map.owner_first_name).toBe(1);
    expect(map.owner_last_name).toBe(2);
    const plan = planServiceImport({ table, map, fields, lookups, existing: [] });
    expect(plan.errors).toEqual([]);
    expect(plan.rows[0]?.service_owner).toBe("Lovelace, Ada");
    expect(plan.rows[0]?.fields.category).toBe("secops");
    const [saved] = materializeServiceImports({
      tenantId: TENANT,
      planned: plan.rows,
      existing: [],
      mode: "sequential",
      categoryPrefix: () => null,
    });
    expect(saved?.service_owner).toBe("Lovelace, Ada");
    expect(saved?.name).toBe("Harbor Watch");
    expect(saved?.service_code).toBe("SVC-001");
  });

  it("keeps a single name without a comma and still accepts one full-name column", () => {
    const parts = parseCsv("Service Name,First name\nHarbor Watch,Ada\nBeacon,  \n");
    const partMap = suggestServiceColumnMap(parts[0] ?? [], fields);
    const partPlan = planServiceImport({ table: parts, map: partMap, fields, lookups, existing: [] });
    expect(partPlan.rows.map((row) => row.service_owner)).toEqual(["Ada", null]);

    const lastOnly = parseCsv("Service Name,Surname\nHarbor Watch,Lovelace\n");
    const lastMap = suggestServiceColumnMap(lastOnly[0] ?? [], fields);
    const lastPlan = planServiceImport({ table: lastOnly, map: lastMap, fields, lookups, existing: [] });
    expect(lastPlan.rows[0]?.service_owner).toBe("Lovelace");

    const full = parseCsv(
      'Service Name,Service Owner\nHarbor Watch,Ada Lovelace\nAdvisory,"SOC Manager"\nPager,"Lovelace, Ada"\n',
    );
    const fullMap = suggestServiceColumnMap(full[0] ?? [], fields);
    expect(fullMap.owner_first_name).toBeNull();
    expect(fullMap.owner_last_name).toBeNull();
    expect(fullMap.service_owner).toBe(1);
    const fullPlan = planServiceImport({ table: full, map: fullMap, fields, lookups, existing: [] });
    expect(fullPlan.rows.map((row) => row.service_owner)).toEqual([
      "Lovelace, Ada",
      "SOC Manager",
      "Lovelace, Ada",
    ]);
  });

  it("lets a given-name column and a surname column both be mapped by hand", () => {
    const table = parseCsv("Offering,Given Name,Surname\nHarbor Watch,Grace,Hopper\n");
    const map = suggestServiceColumnMap(table[0] ?? [], fields);
    expect(map.name).toBeNull();
    expect(map.owner_first_name).toBe(1);
    expect(map.owner_last_name).toBe(2);
    const manual = { ...map, name: 0 };
    const plan = planServiceImport({ table, map: manual, fields, lookups, existing: [] });
    expect(plan.rows[0]).toMatchObject({ name: "Harbor Watch", service_owner: "Hopper, Grace" });
  });

  it("updates the matching service code and does not wipe fields that were not mapped", () => {
    const current = {
      ...blankService(TENANT, "svc-1", "SVC-014"),
      name: "Harbor Watch",
      summary: "Keep this description.",
      service_owner: "Ada",
      owner_id: "owner-1",
      category: "secops",
    };
    const table = parseCsv("Service Name,Service Code,First name,Last name\nHarbor Watch,SVC-014,Ada,Lovelace\n");
    const map = suggestServiceColumnMap(table[0] ?? [], fields);
    const plan = planServiceImport({ table, map, fields, lookups, existing: [current] });
    expect(plan.rows[0]?.action).toBe("update");
    const [saved] = materializeServiceImports({
      tenantId: TENANT,
      planned: plan.rows,
      existing: [current],
      mode: "sequential",
      categoryPrefix: () => null,
    });
    expect(saved?.service_owner).toBe("Lovelace, Ada");
    expect(saved?.summary).toBe("Keep this description.");
    expect(saved?.owner_id).toBeNull();
    expect(saved?.category).toBe("secops");
  });
});
