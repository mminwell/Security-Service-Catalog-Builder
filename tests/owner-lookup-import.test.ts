import { describe, expect, it } from "vitest";
import {
  planOwnerDirectoryWrites,
  planOwnerLookupImport,
  suggestOwnerColumnMap,
} from "@/lib/catalog/lookup-csv";
import { parseCsv } from "@/lib/catalog/lookup-csv";

describe("service owner lookup import", () => {
  it("auto-detects legal first name, legal last name, and employee id", () => {
    const headers = ["employee_id", "legal_first_name", "legal_last_name"];
    expect(suggestOwnerColumnMap(headers)).toEqual({
      employeeId: 0,
      firstName: 1,
      lastName: 2,
      fullName: null,
    });
    expect(suggestOwnerColumnMap(["firstname", "surname", "code"])).toMatchObject({
      firstName: 0,
      lastName: 1,
      employeeId: 2,
    });
    expect(suggestOwnerColumnMap(["given_name", "family_name", "id"])).toMatchObject({
      firstName: 0,
      lastName: 1,
      employeeId: 2,
    });
    expect(suggestOwnerColumnMap(["Legal First Name", "Legal Last Name", "Employee ID"])).toEqual({
      firstName: 0,
      lastName: 1,
      employeeId: 2,
      fullName: null,
    });
  });

  it("builds Last, First and keeps a single name without a comma", () => {
    const table = parseCsv(
      "employee_id,legal_first_name,legal_last_name\nE100,  Ada , Lovelace \nE101,Grace,\nE102,,Hopper\n",
    );
    const map = suggestOwnerColumnMap(table[0] ?? []);
    const plan = planOwnerLookupImport({ table, map, existingCodes: [] });
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((row) => row.displayName)).toEqual(["Lovelace, Ada", "Grace", "Hopper"]);
    expect(plan.rows[0]).toMatchObject({ code: "e100", firstName: "Ada", lastName: "Lovelace", action: "create" });
    expect(plan.rows[1]).toMatchObject({ firstName: "Grace", lastName: "" });
    expect(plan.rows[2]).toMatchObject({ firstName: "", lastName: "Hopper" });
  });

  it("uses a full-name column when first name is not mapped", () => {
    const table = parseCsv('full_name,employee_id\n"Ada Lovelace",E200\nSOC Manager,E201\n"Lovelace, Ada",E202\n');
    const map = suggestOwnerColumnMap(table[0] ?? []);
    expect(map.firstName).toBeNull();
    expect(map.fullName).toBe(0);
    const plan = planOwnerLookupImport({ table, map, existingCodes: ["e202"] });
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((row) => ({ code: row.code, displayName: row.displayName, action: row.action }))).toEqual([
      { code: "e200", displayName: "Lovelace, Ada", action: "create" },
      { code: "e201", displayName: "SOC Manager", action: "create" },
      { code: "e202", displayName: "Lovelace, Ada", action: "update" },
    ]);
    expect(plan.rows[0]).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
    expect(plan.rows[1]).toMatchObject({ firstName: "", lastName: "" });
  });

  it("updates the same employee id and the same directory person instead of duplicating", () => {
    const table = parseCsv("employee_id,legal_first_name,legal_last_name\nE100,Ada,Lovelace\n");
    const map = suggestOwnerColumnMap(table[0] ?? []);
    const again = planOwnerLookupImport({ table, map, existingCodes: ["e100"] });
    expect(again.updates).toBe(1);
    expect(again.creates).toBe(0);
    expect(again.rows).toHaveLength(1);

    const renamed = parseCsv("employee_id,legal_first_name,legal_last_name\nE100,Augusta,King\n");
    const next = planOwnerLookupImport({ table: renamed, map, existingCodes: ["e100"] });
    const writes = planOwnerDirectoryWrites({
      rows: next.rows,
      owners: [{ id: "owner-ada", firstName: "Ada", lastName: "Lovelace" }],
      previousLabels: [{ code: "e100", label: "Lovelace, Ada" }],
    });
    expect(writes).toEqual([{ id: "owner-ada", firstName: "Augusta", lastName: "King" }]);

    const fresh = planOwnerDirectoryWrites({
      rows: planOwnerLookupImport({ table, map, existingCodes: [] }).rows,
      owners: [],
      previousLabels: [],
    });
    expect(fresh).toEqual([{ id: null, firstName: "Ada", lastName: "Lovelace" }]);
  });

  it("asks for a first name or a full name before reading rows", () => {
    const table = parseCsv("employee_id,department\nE100,Watch\n");
    const plan = planOwnerLookupImport({
      table,
      map: { firstName: null, lastName: null, fullName: null, employeeId: 0 },
      existingCodes: [],
    });
    expect(plan.errors[0]).toMatch(/First name/);
    expect(plan.rows).toEqual([]);
  });
});
