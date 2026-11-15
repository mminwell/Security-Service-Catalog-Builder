import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditActorName,
  deletedWorkspaceName,
  labelMap,
  summarizeAudit,
  type AuditPerson,
} from "@/lib/catalog/audit";
import type { AuditEntry } from "@/lib/catalog/types";

const people: AuditPerson[] = [{ email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" }];

function entry(partial: Partial<AuditEntry> & Pick<AuditEntry, "table_name" | "action">): AuditEntry {
  return {
    id: "audit-1",
    tenant_id: "tenant",
    actor_user_id: "ada",
    actor_label: "ada@example.com",
    row_id: "row",
    before_data: null,
    after_data: null,
    created_at: "2026-11-15T18:00:00.000Z",
    ...partial,
  };
}

describe("plain audit sentences", () => {
  const labels = labelMap([]);

  it("describes people, roles, invites, ownership, and services without raw names", () => {
    expect(
      summarizeAudit(
        entry({
          table_name: "tenant_members",
          action: "update",
          before_data: { email: "ada@example.com", role: "editor" },
          after_data: { email: "ada@example.com", role: "tenant_admin" },
        }),
        labels,
        people,
      ).title,
    ).toBe("Changed Ada Lovelace's role from Editor to Admin");

    expect(
      summarizeAudit(
        entry({
          table_name: "workspace_invitations",
          action: "insert",
          after_data: { email: "grace@example.com", role: "editor", becomes_owner: false },
        }),
        labels,
      ).title,
    ).toBe("Invited grace@example.com as Editor");

    expect(
      summarizeAudit(
        entry({
          table_name: "workspace_invitations",
          action: "update",
          before_data: { email: "grace@example.com", role: "editor" },
          after_data: { email: "grace@example.com", role: "editor", cancelled: true },
        }),
        labels,
      ).title,
    ).toBe("Cancelled the invitation for grace@example.com");

    expect(
      summarizeAudit(
        entry({
          table_name: "tenant_members",
          action: "delete",
          before_data: { email: "grace@example.com", role: "viewer" },
        }),
        labels,
      ).title,
    ).toBe("Removed grace@example.com from the workspace");

    expect(
      summarizeAudit(
        entry({
          table_name: "tenants",
          action: "update",
          before_data: { name: "Northwind", owner_email: "ada@example.com" },
          after_data: { name: "Northwind", owner_email: "grace@example.com", previous_owner_role: "tenant_admin" },
        }),
        labels,
        people,
      ).title,
    ).toBe("Transferred ownership from Ada Lovelace to grace@example.com");

    expect(
      summarizeAudit(
        entry({
          table_name: "services",
          action: "delete",
          before_data: { service_code: "SVC-004", name: "Vulnerability Management" },
        }),
        labels,
      ).title,
    ).toBe("Deleted service SVC-004 Vulnerability Management");

    expect(
      summarizeAudit(
        entry({
          table_name: "account_status",
          action: "update",
          before_data: { email: "ada@example.com", active: true },
          after_data: { email: "ada@example.com", active: false },
        }),
        labels,
        people,
      ).title,
    ).toBe("Deactivated Ada Lovelace");

    expect(
      summarizeAudit(
        entry({
          table_name: "account_status",
          action: "delete",
          before_data: { email: "grace@example.com" },
        }),
        labels,
      ).title,
    ).toBe("Deleted the account for grace@example.com");

    const unknown = summarizeAudit(entry({ table_name: "mystery_table", action: "update", after_data: { role: "editor" } }), labels);
    expect(unknown.title).toBe("Updated a record");
    expect(unknown.changes).toEqual([]);
    expect(unknown.title).not.toMatch(/mystery|role|tenant_admin/);
    expect(auditActorName(entry({ table_name: "services", action: "update" }), people)).toBe("Ada Lovelace");
  });

  it("names the deleted workspace on rows whose tenant was cleared", () => {
    const removed = entry({
      id: "gone",
      tenant_id: null,
      table_name: "tenants",
      action: "delete",
      row_id: "workspace-1",
      before_data: { tenant_id: "workspace-1", name: "Northwind Security", slug: "northwind" },
    });
    const earlier = entry({
      id: "earlier",
      tenant_id: null,
      table_name: "services",
      action: "update",
      before_data: { tenant_id: "workspace-1", service_code: "SVC-001", name: "Watch" },
      after_data: { tenant_id: "workspace-1", service_code: "SVC-001", name: "Watch" },
    });
    expect(deletedWorkspaceName(removed, [removed, earlier])).toBe("Northwind Security");
    expect(deletedWorkspaceName(earlier, [removed, earlier])).toBe("Northwind Security");
    expect(summarizeAudit(removed, labelMap([])).title).toBe("Deleted the workspace Northwind Security");
  });
});

describe("deleted workspace history access", () => {
  it("keeps null-tenant audit rows for the site admin only", () => {
    const sql = readFileSync("supabase/migrations/0018_v6_account_audit_workspace.sql", "utf8");
    const policy = sql.slice(sql.lastIndexOf("create policy audit_select"));
    expect(policy).toMatch(/tenant_id is null and public\.can_manage_site\(\)/);
    expect(policy).toMatch(/tenant_id is not null and public\.can_access_tenant\(tenant_id\)/);
    const action = readFileSync("app/actions/workspace.ts", "utf8");
    expect(action).toContain('is("tenant_id", null)');
    expect(action).toContain("Only a platform owner can view deleted workspace history.");
    const page = readFileSync("components/site-users.tsx", "utf8");
    expect(page).toContain("Deleted workspaces");
    expect(page).toContain("listDeletedWorkspaceHistoryAction");
  });
});
