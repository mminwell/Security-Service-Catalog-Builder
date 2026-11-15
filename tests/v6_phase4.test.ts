import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authCallbackBootstrapHtml } from "@/lib/auth/callback-link";
import { readableInviteError } from "@/lib/auth/invites";
import { friendlyAuthError } from "@/lib/auth/messages";
import { runAuthAttempt, sameOrigin, type AuthAttemptClient } from "@/lib/auth/attempt-gate";
import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";
import { contentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { clientAddress, hashRateKey, limiterMissing } from "@/lib/security/rate-limit";

const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'nonce-NONCE' 'strict-dynamic'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://project.supabase.co wss://project.supabase.co",
  "upgrade-insecure-requests",
].join("; ");

describe("nonce content security policy", () => {
  it("builds the production policy without unsafe-inline or unsafe-eval scripts", () => {
    const policy = contentSecurityPolicy({
      nonce: "NONCE",
      supabaseUrl: "https://project.supabase.co/rest/v1",
      development: false,
    });
    expect(policy).toBe(PRODUCTION_CSP);
    const script = policy.split("; ").find((part) => part.startsWith("script-src"));
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(policy).not.toContain("http://127.0.0.1");
    expect(contentSecurityPolicy({ nonce: "NONCE", supabaseUrl: "https://project.supabase.co", development: false, upgradeInsecureRequests: false })).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(policy).not.toContain("preload");
    const style = policy.split("; ").find((part) => part.startsWith("style-src"));
    expect(style).toBe("style-src 'self' 'unsafe-inline'");
    expect(style).not.toContain("nonce-");
  });

  it("allows eval and the local Supabase ports only in development", () => {
    const policy = contentSecurityPolicy({
      nonce: "NONCE",
      supabaseUrl: "https://project.supabase.co",
      development: true,
    });
    const script = policy.split("; ").find((part) => part.startsWith("script-src"));
    expect(script).toBe("script-src 'self' 'nonce-NONCE' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).toContain("http://127.0.0.1:54321");
    expect(policy).toContain("ws://localhost:54321");
  });

  it("mints a nonce the framework can parse", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
    const policy = contentSecurityPolicy({ nonce, supabaseUrl: "", development: false });
    expect(policy).toContain(`'nonce-${nonce}'`);
  });

  it("keeps the other security headers and leaves HSTS without preload", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('value: "nosniff"');
    expect(config).toContain('value: "DENY"');
    expect(config).toContain('value: "strict-origin-when-cross-origin"');
    expect(config).toContain('value: "camera=(), microphone=(), geolocation=()"');
    expect(config).toContain('value: "max-age=63072000; includeSubDomains"');
    expect(config).not.toMatch(/includeSubDomains;\s*preload/i);
    expect(config).not.toContain("Content-Security-Policy");
    expect(config).not.toContain("unsafe-inline");
  });

  it("puts the request nonce on the invite callback script", () => {
    const html = authCallbackBootstrapHtml("abc+def/12=");
    expect(html).toContain('<script nonce="abc+def/12=">');
    expect(html).toContain("access_token");
    expect(html).toContain('fetch("/auth/callback"');
    expect(authCallbackBootstrapHtml("bad nonce")).not.toContain("nonce=");
  });
});

describe("auth attempt limits", () => {
  it("returns 429 before calling Auth when the email or IP bucket is full", async () => {
    const gate = fakeClient();
    const response = await runAuthAttempt(request({ email: "ada@example.com", password: "correct-horse" }), "sign_in", gate.client);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(gate.actions).toEqual(["sign_in_ip"]);
    expect(gate.authCalls).toEqual([]);
    expect(gate.buckets[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(gate.buckets[0]).not.toContain("203.0.113.8");
  });

  it("sends the password sign-in only after both buckets accept it", async () => {
    const gate = fakeClient({ allow: true });
    const response = await runAuthAttempt(request({ email: "Ada@Example.com", password: "correct-horse" }), "sign_in", gate.client);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessToken: "access", refreshToken: "refresh" });
    expect(gate.actions).toEqual(["sign_in_ip", "sign_in_email"]);
    expect(gate.authCalls).toEqual(["signInWithPassword:ada@example.com"]);
    expect(hashRateKey("ada@example.com")).not.toBe("ada@example.com");
  });

  it("keeps magic-link and reset replies calm, and uses 429 for a full bucket", async () => {
    const missing = fakeClient({ allow: true, otpError: "Signups not allowed for otp" });
    const sent = await runAuthAttempt(request({ email: "ada@example.com" }), "magic_link", missing.client);
    expect(sent.status).toBe(200);
    expect((await sent.json()).notice).toMatch(/sign-in link is on its way/);

    const limited = fakeClient();
    const blocked = await runAuthAttempt(request({ email: "ada@example.com" }), "password_reset", limited.client);
    expect(blocked.status).toBe(429);
    expect(limited.authCalls).toEqual([]);

    const reset = fakeClient({ allow: true, resetError: "Unable to send" });
    const hidden = await runAuthAttempt(request({ email: "ada@example.com" }), "password_reset", reset.client);
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).notice).toMatch(/If an account exists/);
  });

  it("refuses a cross-origin post before counting it", async () => {
    const gate = fakeClient({ allow: true });
    const response = await runAuthAttempt(
      request({ email: "ada@example.com", password: "correct-horse" }, "https://evil.example"),
      "sign_in",
      gate.client,
    );
    expect(response.status).toBe(403);
    expect(gate.actions).toEqual([]);
    expect(sameOrigin(request({}))).toBe(true);
  });

  it("continues when the migration has not been applied yet", async () => {
    const gate = fakeClient({
      allow: true,
      rpcError: "Could not find the function public.enforce_rate_limit(p_action, p_bucket) in the schema cache",
    });
    const response = await runAuthAttempt(request({ email: "ada@example.com", password: "correct-horse" }), "sign_in", gate.client);
    expect(response.status).toBe(200);
    expect(gate.authCalls).toEqual(["signInWithPassword:ada@example.com"]);
    expect(limiterMissing(gate.rpcError)).toBe(true);
    expect(friendlyAuthError("Request rate limit reached")).toBe(RATE_LIMIT_MESSAGE);
    expect(readableInviteError("rate_limited")).toBe(RATE_LIMIT_MESSAGE);
  });

  it("reads the platform client address instead of a spoofed forwarded list", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9, 198.51.100.2",
      "x-real-ip": "198.51.100.10",
    });
    expect(clientAddress(headers)).toBe("198.51.100.10");
    expect(clientAddress(new Headers({ "x-vercel-forwarded-for": "203.0.113.9, 198.51.100.4" }))).toBe("198.51.100.4");
  });
});

describe("rate limit migration", () => {
  const sql = readFileSync("supabase/migrations/0017_v6_rate_limits.sql", "utf8");

  it("adds a locked table and does not delete existing catalog rows", () => {
    expect(sql).toMatch(/create table if not exists public\.rate_limits/i);
    expect(sql).toMatch(/alter table public\.rate_limits enable row level security/i);
    expect(sql).toMatch(/alter table public\.rate_limits force row level security/i);
    expect(sql).toMatch(/revoke all on table public\.rate_limits from public, anon, authenticated/i);
    expect(sql).not.toMatch(/grant\s+[a-z,\s]+\s+on\s+(table\s+)?public\.rate_limits\s+to\s+anon/i);
    expect(sql).toMatch(/grant execute on function public\.enforce_rate_limit\(text, text\) to anon, authenticated/i);
    expect(sql).toMatch(/delete from public\.rate_limits/i);
    expect(sql).not.toMatch(/delete from public\.(?!rate_limits\b)[a-z_]+/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/service_role|eyJ|sb_secret|password\s*=/i);
    expect(sql).toContain("when 'sign_in_email'");
    expect(sql).toContain("v_limit := 5");
    expect(sql).toContain("v_limit := 20");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("when 'invite_send'");
    expect(sql).toContain("sha256");
  });
});

function request(body: Record<string, string>, origin = "http://catalog.example"): Request {
  return new Request("http://catalog.example/api/auth/sign-in", {
    method: "POST",
    headers: {
      origin,
      host: "catalog.example",
      "x-forwarded-proto": "http",
      "x-real-ip": "203.0.113.8",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function fakeClient(options: { allow?: boolean; otpError?: string; resetError?: string; rpcError?: string } = {}): {
  client: AuthAttemptClient;
  actions: string[];
  buckets: Array<string | null>;
  authCalls: string[];
  rpcError: string;
} {
  const actions: string[] = [];
  const buckets: Array<string | null> = [];
  const authCalls: string[] = [];
  const rpcError = options.rpcError ?? "";
  const client: AuthAttemptClient = {
    rpc: async (_fn, args) => {
      actions.push(args.p_action);
      buckets.push(args.p_bucket);
      if (rpcError) return { error: { message: rpcError } };
      if (!options.allow && args.p_action.endsWith("_ip")) return { error: { message: "rate_limited" } };
      return { error: null };
    },
    auth: {
      signInWithPassword: async (input) => {
        authCalls.push(`signInWithPassword:${input.email}`);
        return { data: { session: { access_token: "access", refresh_token: "refresh" } }, error: null };
      },
      signInWithOtp: async (input) => {
        authCalls.push(`signInWithOtp:${input.email}`);
        return { error: options.otpError ? { message: options.otpError } : null };
      },
      signUp: async (input) => {
        authCalls.push(`signUp:${input.email}`);
        return { data: { session: null }, error: null };
      },
      resetPasswordForEmail: async (email) => {
        authCalls.push(`reset:${email}`);
        return { error: options.resetError ? { message: options.resetError } : null };
      },
    },
  };
  return { client, actions, buckets, authCalls, rpcError };
}
