import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deactivatedFromStatus } from "@/lib/auth/account-status";
import { proxySkipsSupabase } from "@/lib/auth/redirect";
import {
  MAGIC_LINK_NOTICE,
  authCallbackDestination,
  interpretMagicLinkError,
  magicLinkRedirectTo,
  requestMagicLink,
} from "@/lib/auth/magic-link";
import { isDemoPersistenceKey } from "@/lib/demo/memory-storage";
import { isDemoPath, stripDemoPrefix, withDemoPrefix } from "@/lib/demo/paths";
import { applyDemoCommand, initialDemo } from "@/lib/demo/store";
import { helpForRoute, searchHelp } from "@/lib/help/guide";
import { loadHelpArticles as readHelpFiles } from "@/lib/help/load";
import { saveService } from "@/lib/data/model";

const root = process.cwd();

describe("magic link request and callback", () => {
  it("sends a one-time link without creating an account and hides whether the email exists", async () => {
    const calls: Array<{ email: string; options: { shouldCreateUser: boolean; emailRedirectTo: string } }> = [];
    const client = {
      auth: {
        signInWithOtp: async (input: { email: string; options: { shouldCreateUser: boolean; emailRedirectTo: string } }) => {
          calls.push(input);
          return { error: null };
        },
      },
    };
    const sent = await requestMagicLink(client, "  Ada@Example.com ", "https://catalog.example");
    const missing = await requestMagicLink(
      {
        auth: {
          signInWithOtp: async () => ({ error: { message: "Signups not allowed for otp" } }),
        },
      },
      "missing@example.com",
      "https://catalog.example",
    );
    expect(sent).toEqual({ notice: MAGIC_LINK_NOTICE });
    expect(missing).toEqual({ notice: MAGIC_LINK_NOTICE });
    expect(calls[0]).toEqual({
      email: "ada@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://catalog.example/auth/callback?next=%2Fcatalog",
      },
    });
    expect(magicLinkRedirectTo("https://catalog.example/")).toBe(
      "https://catalog.example/auth/callback?next=%2Fcatalog",
    );
    expect(interpretMagicLinkError("Email rate limit exceeded")).toBe("rate");
    expect(interpretMagicLinkError("User not found")).toBe("sent");
  });

  it("signs a verified person in, rejects a used or expired link, and signs out a deactivated account", () => {
    expect(authCallbackDestination({ verified: true, deactivated: false, next: "/catalog" })).toEqual({
      path: "/catalog",
      signOut: false,
    });
    expect(authCallbackDestination({ verified: false, deactivated: false, next: "/catalog" })).toEqual({
      path: "/login?error=auth",
      signOut: false,
    });
    expect(authCallbackDestination({ verified: true, deactivated: true, next: "/catalog" })).toEqual({
      path: "/login?error=deactivated",
      signOut: true,
    });
    expect(deactivatedFromStatus({ errorMessage: null, deactivatedAt: "2026-11-01T00:00:00.000Z" })).toBe(true);
    expect(deactivatedFromStatus({ errorMessage: null, deactivatedAt: null })).toBe(false);
    expect(deactivatedFromStatus({ errorMessage: "account_status does not exist", deactivatedAt: null })).toBe(false);
    const route = readFileSync("app/auth/callback/route.ts", "utf8");
    expect(route).toContain("authCallbackDestination");
    expect(route).toContain("accountIsDeactivated");
    expect(route).toContain("signOut");
  });
});

describe("help search", () => {
  const articles = readHelpFiles();

  it("loads the markdown guide and finds a page without leaving the browser", () => {
    expect(articles.map((article) => article.slug)).toContain("sign-in");
    expect(searchHelp(articles, "magic link").some((article) => article.slug === "sign-in")).toBe(true);
    expect(searchHelp(articles, "nothing is written").some((article) => article.slug === "demo")).toBe(true);
    expect(searchHelp(articles, "zzzz-not-in-the-guide")).toEqual([]);
    expect(searchHelp(articles, "").length).toBe(articles.length);
    expect(helpForRoute(articles, "/catalog").some((article) => article.slug === "catalog")).toBe(true);
    expect(helpForRoute(articles, "/demo/services/new").some((article) => article.slug === "services")).toBe(true);
    expect(helpForRoute(articles, "/demo").some((article) => article.slug === "demo")).toBe(true);
  });
});

describe("demo isolation", () => {
  it("keeps edits in memory and restores the fictional seed for a new visit", () => {
    const first = initialDemo();
    const service = first.db.services[0];
    if (!service) throw new Error("expected a sample service");
    const edited = saveService(first.db, { ...service, name: "Changed only in this tab" });
    expect(edited.services.find((item) => item.id === service.id)?.name).toBe("Changed only in this tab");
    expect(initialDemo().db.services.find((item) => item.id === service.id)?.name).toBe(service.name);
    expect(first.db.session?.email).toBe("avery.cole@example.com");
    expect(first.owners.some((owner) => owner.email?.endsWith("@example.com"))).toBe(true);
    expect(first.db.services.every((item) => item.tenant_id === "11111111-1111-4111-8111-111111111111" || item.tenant_id === "22222222-2222-4222-8222-222222222222")).toBe(true);
  });

  it("does not call Supabase, server actions, or persistent demo storage", () => {
    const files = [
      "components/demo-catalog.tsx",
      "lib/demo/store.ts",
      "lib/demo/paths.ts",
      "lib/demo/memory-storage.ts",
      "app/demo/layout.tsx",
      "app/demo/[[...path]]/page.tsx",
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/supabase|service_role|@\/app\/actions|localStorage|DEMO_STORAGE_KEY|writeActiveTenantId/i);
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/catalog")).toBe(true);
    expect(isDemoPath("/catalog")).toBe(false);
    expect(stripDemoPrefix("/demo/artifacts/new")).toBe("/artifacts/new");
    expect(withDemoPrefix("/services/abc", true)).toBe("/demo/services/abc");
    expect(withDemoPrefix("/login", true)).toBe("/login");
    expect(withDemoPrefix("/services/abc#mapping", true)).toBe("/demo/services/abc#mapping");
    expect(proxySkipsSupabase("/demo/settings")).toBe(true);
    expect(proxySkipsSupabase("/catalog")).toBe(false);
    expect(isDemoPersistenceKey("sscb.demo.v1")).toBe(true);
    expect(isDemoPersistenceKey("sscb.activeTenantId")).toBe(true);
    expect(isDemoPersistenceKey("other")).toBe(false);
    const saved = applyDemoCommand(initialDemo(), {
      type: "settings",
      distributionPublic: "FICTIONAL",
      distributionInternal: "",
      exportFormat: "pdf",
      exportProfileId: "",
      reminderEnabled: false,
    });
    expect(saved.result.ok).toBe(true);
    expect(saved.state.db.tenants.find((tenant) => tenant.id === saved.state.db.activeTenantId)?.distribution_public).toBe(
      "FICTIONAL",
    );
    expect(initialDemo().db.tenants[0]?.distribution_public ?? null).toBeNull();
  });

  it("guards live account and workspace actions when the screen is in demo mode", () => {
    const settings = readFileSync("components/workspace-settings.tsx", "utf8");
    const owners = readFileSync("components/owners-admin.tsx", "utf8");
    const site = readFileSync("components/site-users.tsx", "utf8");
    for (const action of [
      "saveWorkspaceSettingsAction(",
      "setMemberRoleAction(",
      "removeMemberAction(",
      "resendInviteAction(",
      "cancelInviteAction(",
    ]) {
      expect(nearDemo(settings, action), action).toBe(true);
    }
    for (const action of [
      "reactivateOwnerAction(",
      "saveOwnerAction(",
      "archiveOwnerAction(",
      "importOwnersAction(",
      "reconcileOwnersAction(",
    ]) {
      expect(nearDemo(owners, action), action).toBe(true);
    }
    expect(site).toContain("Site Admin is not part of the demo.");
    expect(nearDemo(site, "listSiteAccountsAction(")).toBe(true);
    const helpFiles = readdirSync(path.join(root, "content/help")).filter((name) => name.endsWith(".md"));
    expect(helpFiles.length).toBeGreaterThan(5);
  });
});

function nearDemo(source: string, needle: string): boolean {
  const index = source.indexOf(needle);
  if (index < 0) return false;
  return source.slice(Math.max(0, index - 700), index).includes("api.demo");
}
