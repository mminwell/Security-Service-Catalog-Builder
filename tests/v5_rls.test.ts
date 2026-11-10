import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");
const latest = readFileSync(path.join(migrationsDir, "0009_v5_auth_invites.sql"), "utf8");

function tables(): string[] {
  const names = new Set<string>();
  for (const match of sql.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/gi)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

describe("row level security on every public table", () => {
  const publicTables = tables();

  it("includes the V4 artifact tables and the V5 invitation table", () => {
    expect(publicTables).toEqual(
      expect.arrayContaining([
        "tenants",
        "tenant_members",
        "field_definitions",
        "lookup_options",
        "services",
        "audit_log",
        "starter_service_templates",
        "frameworks",
        "framework_elements",
        "service_outcome_mappings",
        "export_profiles",
        "artifacts",
        "artifact_service_links",
        "workspace_invitations",
      ]),
    );
  });

  it("enables and forces row level security on every table", () => {
    for (const table of publicTables) {
      expect(sql, table).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      expect(sql, table).toMatch(new RegExp(`alter table public\\.${table} force row level security`, "i"));
    }
  });

  it("does not grant the anon role access to catalog tables", () => {
    expect(sql).not.toMatch(/grant\s+[a-z,\s]+\s+on\s+(table\s+)?public\.[a-z_]+\s+to\s+anon/i);
  });

  it("scopes tenant data policies to the membership helpers", () => {
    for (const table of ["services", "artifacts", "artifact_service_links", "service_outcome_mappings", "export_profiles", "workspace_invitations"]) {
      const policies = [...sql.matchAll(new RegExp(`create policy [a-z_]+ on public\\.${table}[\\s\\S]*?;`, "gi"))].map((match) => match[0]);
      expect(policies.length, table).toBeGreaterThan(0);
      for (const policy of policies) {
        expect(policy, policy).toMatch(/can_access_tenant|can_write_services|can_admin_tenant/);
        expect(policy).not.toMatch(/using\s*\(\s*true\s*\)/i);
      }
    }
  });
});

describe("V5 auth migration", () => {
  it("makes the first account Admin of one workspace and invites the rest", () => {
    expect(latest).toMatch(/provision_tenant_internal\('Starter Workspace'/);
    expect(latest).toMatch(/'tenant_admin'/);
    expect(latest).not.toMatch(/provision_tenant_internal\('Starter Workspace', v_slug, v_uid, 'platform_owner'\)/);
    expect(latest).toMatch(/Only an Admin can create a workspace/);
    expect(latest).toMatch(/workspace_invitations/);
    expect(latest).toMatch(/status', 'invited'/);
    expect(latest).toMatch(/Only an Admin can load the sample catalog/);
  });

  it("revokes direct writes to the audit log", () => {
    expect(latest).toMatch(/revoke insert, update, delete on table public\.audit_log from authenticated/i);
  });
});

describe("repository secrets", () => {
  it("documents only the public Supabase variables", () => {
    const example = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    expect(example).toContain("NEXT_PUBLIC_SUPABASE_URL=");
    expect(example).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=");
    expect(example.toLowerCase()).not.toContain("service_role=");
    expect(example).not.toMatch(/eyJ[a-z0-9_-]{20,}/i);
  });
});
