import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateEmail, validatePassword } from "@/lib/auth/credentials";
import { passwordFieldState } from "@/lib/auth/password-field";
import {
  accountProfileFromMetadata,
  clearProfilePromptDismissal,
  dismissProfilePrompt,
  headerLabel,
  isProfilePromptDismissed,
  normalizeAccountProfile,
  profileIsIncomplete,
  signupUserMetadata,
  validateAccountProfile,
  workspaceNameFromCompany,
} from "@/lib/auth/profile";
import { primaryNavFor } from "@/lib/catalog/primary-nav";
import { TEMPLATES_LABEL } from "@/lib/catalog/shop-label";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0012_v6_user_profiles.sql"),
  "utf8",
);

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("password visibility", () => {
  it("stays hidden until the eye control is pressed", () => {
    expect(passwordFieldState(false)).toEqual({
      type: "password",
      label: "Show password",
      pressed: false,
    });
    expect(passwordFieldState(true)).toEqual({
      type: "text",
      label: "Hide password",
      pressed: true,
    });
  });

  it("uses a button inside every password field", () => {
    const field = readFileSync("components/password-field.tsx", "utf8");
    expect(field).toContain('type="button"');
    expect(field).toContain("aria-label={state.label}");
    expect(field).toContain("aria-pressed={state.pressed}");
    expect(field).toContain("useState(false)");
    const login = readFileSync("components/login-panel.tsx", "utf8");
    const reset = readFileSync("app/auth/reset/page.tsx", "utf8");
    expect(login).toContain("<PasswordField");
    expect(reset.match(/<PasswordField/g)).toHaveLength(2);
    expect(login).not.toContain('type="password"');
    expect(reset).not.toContain('type="password"');
  });
});

describe("signup profile", () => {
  it("trims names and rejects a blank, short company, or line break", () => {
    expect(validateAccountProfile({ firstName: "  Ada ", lastName: " Lovelace ", company: "  Northwind Traders " })).toBeNull();
    expect(normalizeAccountProfile({ firstName: "  Ada ", lastName: " Lovelace ", company: "  Northwind Traders " })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Northwind Traders",
    });
    expect(validateAccountProfile({ firstName: " ", lastName: "Lovelace", company: "Northwind" })).toMatch(/first name/i);
    expect(validateAccountProfile({ firstName: "Ada", lastName: "", company: "Northwind" })).toMatch(/last name/i);
    expect(validateAccountProfile({ firstName: "Ada", lastName: "Lovelace", company: " N " })).toMatch(/company/i);
    expect(validateAccountProfile({ firstName: "Ada\u0000", lastName: "Lovelace", company: "Northwind" })).toMatch(/line breaks/i);
    expect(validateEmail("  ada@example.com ")).toBeNull();
    expect(validatePassword("long-enough")).toBeNull();
  });

  it("keeps signup metadata off the authorization path and names the first workspace from the company", () => {
    const profile = normalizeAccountProfile({ firstName: "Ada", lastName: "Lovelace", company: "Northwind Traders" });
    expect(signupUserMetadata(profile)).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Northwind Traders",
    });
    expect(accountProfileFromMetadata(signupUserMetadata(profile))).toEqual(profile);
    expect(accountProfileFromMetadata({ first_name: "Ada" })).toBeNull();
    expect(workspaceNameFromCompany("  Northwind Traders ")).toBe("Northwind Traders");
    expect(workspaceNameFromCompany("")).toBe("Starter Workspace");
    expect(workspaceNameFromCompany(null)).toBe("Starter Workspace");
    const login = readFileSync("components/login-panel.tsx", "utf8");
    const first = login.indexOf('id="first-name"');
    const last = login.indexOf('id="last-name"');
    const email = login.indexOf('id="email"');
    const company = login.indexOf('id="company"');
    const password = login.indexOf('id="password"');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(last);
    expect(last).toBeLessThan(email);
    expect(email).toBeLessThan(company);
    expect(company).toBeLessThan(password);
  });
});

describe("header name and the one-time profile prompt", () => {
  it("shows the first name and falls back to email when it is missing", () => {
    expect(headerLabel({ email: "ada@example.com", firstName: " Ada " })).toBe("Ada");
    expect(headerLabel({ email: "ada@example.com", firstName: "  " })).toBe("ada@example.com");
    expect(headerLabel({ email: "ada@example.com" })).toBe("ada@example.com");
    expect(profileIsIncomplete({ firstName: "Ada", lastName: "" })).toBe(true);
    expect(profileIsIncomplete({ firstName: "Ada", lastName: "Lovelace" })).toBe(false);
  });

  it("dismisses the prompt once per sign-in and still offers Profile", () => {
    const store = memoryStore();
    expect(isProfilePromptDismissed(store, "ada")).toBe(false);
    dismissProfilePrompt(store, "ada");
    expect(isProfilePromptDismissed(store, "ada")).toBe(true);
    expect(isProfilePromptDismissed(store, "bea")).toBe(false);
    clearProfilePromptDismissal(store);
    expect(isProfilePromptDismissed(store, "ada")).toBe(false);
    const prompt = readFileSync("components/profile-prompt.tsx", "utf8");
    const menu = readFileSync("components/user-menu.tsx", "utf8");
    const shell = readFileSync("components/shell.tsx", "utf8");
    expect(prompt).toContain("Complete your profile");
    expect(prompt).toContain("Not now");
    expect(menu).toContain('aria-label="Profile"');
    expect(shell).toContain("<UserMenu />");
    expect(shell).toContain("<CompleteProfilePrompt />");
    expect(shell).toContain("primaryNavFor");
  });
});

describe("primary navigation order", () => {
  it("is the same sequence for an admin and, without the admin links, for everyone else", () => {
    expect(primaryNavFor(true).map((item) => item.label)).toEqual([
      "Catalog",
      "Fields",
      "Lookups",
      "Artifacts",
      "CSF Mapping",
      TEMPLATES_LABEL,
    ]);
  });
});

describe("profile migration", () => {
  it("lets a person read and update only their own row and does not backfill accounts", () => {
    expect(migration).toMatch(/alter table public\.user_profiles enable row level security/i);
    expect(migration).toMatch(/alter table public\.user_profiles force row level security/i);
    expect(migration).toMatch(/user_profiles_select[\s\S]*user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/user_profiles_update[\s\S]*user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/grant select, insert, update on table public\.user_profiles to authenticated/i);
    expect(migration).not.toMatch(/grant\s+[a-z,\s]+\s+on\s+(table\s+)?public\.[a-z_]+\s+to\s+anon/i);
    expect(migration).not.toMatch(/insert into public\.user_profiles\s*\([^)]*\)\s*select/i);
    expect(migration).not.toMatch(/update public\.tenants/i);
    expect(migration).toMatch(/from public\.user_profiles/);
    expect(migration).toMatch(/v_name := v_company/);
    expect(migration).toMatch(/Starter Workspace/);
    expect(migration).toMatch(/revoke all on function public\.copy_signup_profile\(\) from public, anon, authenticated/i);
  });
});
