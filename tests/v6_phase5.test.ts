import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAuthAttempt, sameOrigin, type AuthAttemptClient } from "@/lib/auth/attempt-gate";
import { BLUEPRINT_VIEW_KEY, readBlueprintView, writeBlueprintView } from "@/lib/catalog/blueprint-view";
import { aggregateCoverage, countsFor } from "@/lib/catalog/coverage";
import { ancestorOfType, CSF_ELEMENTS } from "@/lib/catalog/framework";

describe("category outcome counts", () => {
  it("sums Full, Partial, None, and Unmapped to that category's subcategory count", () => {
    const report = aggregateCoverage({
      elements: CSF_ELEMENTS,
      mappings: [],
      services: [],
      tenantId: "tenant",
    });
    const categories = CSF_ELEMENTS.filter((element) => element.element_type === "category");
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      const subcategories = CSF_ELEMENTS.filter(
        (element) =>
          element.element_type === "subcategory" &&
          ancestorOfType(element, "category", CSF_ELEMENTS)?.id === category.id,
      );
      const outcomes = report.outcomes.filter(
        (outcome) => ancestorOfType(outcome.element, "category", CSF_ELEMENTS)?.id === category.id,
      );
      const counts = countsFor(outcomes);
      expect(counts.full + counts.partial + counts.none + counts.unmapped).toBe(subcategories.length);
      expect(outcomes).toHaveLength(subcategories.length);
    }
    const screen = readFileSync("components/coverage-screen.tsx", "utf8");
    expect(screen.match(/<CategoryCountBadges/g)).toHaveLength(2);
    expect(screen).toContain("countsFor(outcomes)");
  });
});

describe("blueprint store default", () => {
  it("shows List on a first visit when no preference is saved", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
    expect(readBlueprintView()).toBe("list");
    writeBlueprintView("cards");
    expect(readBlueprintView()).toBe("cards");
    storage.delete(BLUEPRINT_VIEW_KEY);
    expect(readBlueprintView()).toBe("list");
    const source = readFileSync("components/blueprint-store.tsx", "utf8");
    expect(source).toContain('() => "list" as const');
    expect(source).not.toContain('() => "cards"');
  });
});

describe("auth post origin", () => {
  it("accepts a same-origin Origin or Referer and rejects a cross-origin post", async () => {
    expect(sameOrigin(authRequest({ origin: "http://catalog.example" }))).toBe(true);
    expect(sameOrigin(authRequest({ referer: "http://catalog.example/login" }))).toBe(true);
    expect(sameOrigin(authRequest({ origin: "https://evil.example", referer: "http://catalog.example/login" }))).toBe(false);
    expect(sameOrigin(authRequest({ referer: "https://evil.example/phish" }))).toBe(false);
    expect(sameOrigin(authRequest({}))).toBe(false);

    const gate = fakeClient();
    const refused = await runAuthAttempt(authRequest({ origin: "https://evil.example" }, "not-json"), "sign_in", gate.client);
    expect(refused.status).toBe(403);
    expect(gate.actions).toEqual([]);

    const route = readFileSync("app/auth/callback/route.ts", "utf8");
    const post = route.slice(route.indexOf("export async function POST"));
    expect(post.indexOf("sameOrigin")).toBeGreaterThan(-1);
    expect(post.indexOf("sameOrigin")).toBeLessThan(post.indexOf("setSession"));
    expect(post).toContain("status: 403");
    for (const file of ["sign-in", "sign-up", "magic-link", "password-reset"]) {
      const source = readFileSync(`app/api/auth/${file}/route.ts`, "utf8");
      expect(source).toContain("runAuthAttempt");
    }
  });
});

describe("site admin workspace controls", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0018_v6_account_audit_workspace.sql"), "utf8");

  it("names the first workspace from the first name and audits member and invite changes", () => {
    expect(sql).toMatch(/v_name text := 'My workspace'/);
    expect(sql).toMatch(/v_first \|\| '''s workspace'/);
    expect(sql).not.toMatch(/v_name := v_company/);
    expect(sql).toMatch(/alter column company drop not null/i);
    for (const name of [
      "add_tenant_member",
      "resend_workspace_invitation",
      "cancel_workspace_invitation",
      "set_member_role",
      "remove_tenant_member",
      "set_account_active",
      "delete_site_account",
    ]) {
      const start = sql.indexOf(`function public.${name}`);
      const next = sql.indexOf("create or replace function", start + 20);
      const body = sql.slice(start, next === -1 ? undefined : next);
      expect(body, name).toMatch(/record_audit/);
    }
    expect(sql).not.toMatch(/^\s*drop table/im);
    expect(sql).not.toMatch(/^\s*alter table[^;]*drop column/im);
  });

  it("limits delete and transfer to the platform owner and keeps the audit row after delete", () => {
    expect(sql).toMatch(/Only a platform owner can delete a workspace/);
    expect(sql).toMatch(/Only a platform owner can transfer workspace ownership/);
    expect(sql).toMatch(/can_manage_site\(\)/);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toMatch(/on delete set null/i);
    expect(sql).toMatch(/becomes_owner/);
    expect(sql).toMatch(/grant execute on function public\.delete_workspace\(uuid, text\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.transfer_workspace_owner\(uuid, uuid, text\) to authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.record_audit\(uuid, text, uuid, text, jsonb, jsonb\) from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.claim_workspace_owner\(uuid, uuid\) from public, anon, authenticated/i);
    const settings = readFileSync("components/workspace-settings.tsx", "utf8");
    expect(settings).toContain('api.role === "platform_owner" && !api.demo');
    expect(settings).toContain("Type the name to confirm");
    expect(settings).toContain("transferWorkspaceOwnerAction");
    expect(settings).toContain("deleteWorkspaceAction");
    expect(settings).not.toContain("not available in this version");
    expect(settings).not.toContain("window.confirm");
  });
});

function authRequest(headers: Record<string, string>, body = "{}"): Request {
  return new Request("http://catalog.example/api/auth/sign-in", {
    method: "POST",
    headers: {
      host: "catalog.example",
      "x-forwarded-proto": "http",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

function fakeClient(): { client: AuthAttemptClient; actions: string[] } {
  const actions: string[] = [];
  const client: AuthAttemptClient = {
    rpc: async (_fn, args) => {
      actions.push(args.p_action);
      return { error: null };
    },
    auth: {
      signInWithPassword: async () => ({ data: { session: null }, error: { message: "no" } }),
      signInWithOtp: async () => ({ error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
    },
  };
  return { client, actions };
}
