import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, validateEmail, validatePassword } from "@/lib/auth/credentials";
import { interpretMagicLinkError, magicLinkRedirectTo, MAGIC_LINK_NOTICE } from "@/lib/auth/magic-link";
import { friendlyAuthError } from "@/lib/auth/messages";
import { normalizeAccountProfile, signupUserMetadata } from "@/lib/auth/profile";
import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";
import { clientAddress, enforceRateLimits, isRateLimitedMessage, type RateLimitCaller } from "@/lib/security/rate-limit";
import { supabaseConfig } from "@/lib/supabase/env";

export type AuthAttemptKind = "sign_in" | "magic_link" | "sign_up" | "password_reset";

export type AuthAttemptClient = RateLimitCaller & {
  auth: {
    signInWithPassword: (input: { email: string; password: string }) => Promise<{
      data: { session: { access_token: string; refresh_token: string } | null };
      error: { message: string } | null;
    }>;
    signInWithOtp: (input: {
      email: string;
      options: { shouldCreateUser: boolean; emailRedirectTo: string };
    }) => Promise<{ error: { message: string } | null }>;
    signUp: (input: {
      email: string;
      password: string;
      options: { emailRedirectTo: string; data: { first_name: string; last_name: string; company: string } };
    }) => Promise<{
      data: { session: { access_token: string; refresh_token: string } | null };
      error: { message: string } | null;
    }>;
    resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: { message: string } | null }>;
  };
};

type AttemptBody = {
  email?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  company?: unknown;
};

export async function runAuthAttempt(
  request: Request,
  kind: AuthAttemptKind,
  client?: AuthAttemptClient,
): Promise<Response> {
  const body = await readBody(request);
  if (!body) return json({ error: "That request could not be read." }, 400);
  if (!sameOrigin(request)) return json({ error: "That request was refused." }, 403);

  const email = typeof body.email === "string" ? body.email : "";
  const emailError = validateEmail(email);
  if (emailError) return json({ error: emailError }, 400);
  const normalized = normalizeEmail(email);

  if (kind === "sign_in" || kind === "sign_up") {
    const password = typeof body.password === "string" ? body.password : "";
    const passwordError = validatePassword(password);
    if (passwordError) return json({ error: passwordError }, 400);
  }

  let profile: ReturnType<typeof normalizeAccountProfile> | null = null;
  if (kind === "sign_up") {
    try {
      profile = normalizeAccountProfile({
        firstName: typeof body.firstName === "string" ? body.firstName : "",
        lastName: typeof body.lastName === "string" ? body.lastName : "",
        company: typeof body.company === "string" ? body.company : "",
      });
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : "Enter your name and company.";
      return json({ error: message }, 400);
    }
  }

  const supabase = client ?? createEphemeralClient();
  if (!supabase) return json({ error: "Supabase is not configured." }, 503);

  try {
    await enforceRateLimits(supabase, [
      { action: `${kind}_ip`, material: clientAddress(request.headers) },
      { action: `${kind}_email`, material: normalized },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isRateLimitedMessage(message)) return json({ error: RATE_LIMIT_MESSAGE }, 429);
    return json({ error: "That request could not be checked. Try again in a moment." }, 503);
  }

  const origin = requestOrigin(request);
  if (kind === "magic_link") {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false, emailRedirectTo: magicLinkRedirectTo(origin) },
    });
    const outcome = interpretMagicLinkError(error?.message ?? null);
    if (outcome === "rate") return json({ error: RATE_LIMIT_MESSAGE }, 429);
    if (outcome === "failed") return json({ error: "The sign-in link could not be sent. Try again in a moment." }, 502);
    return json({ notice: MAGIC_LINK_NOTICE }, 200);
  }

  if (kind === "password_reset") {
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/reset")}`,
    });
    if (error && /rate limit|too many|only request this after|security purposes/i.test(error.message)) {
      return json({ error: RATE_LIMIT_MESSAGE }, 429);
    }
    return json({ notice: "If an account exists for that email, a reset link is on its way." }, 200);
  }

  if (kind === "sign_up") {
    if (!profile) return json({ error: "Enter your name and company." }, 400);
    const { data, error } = await supabase.auth.signUp({
      email: normalized,
      password: String(body.password),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/catalog`,
        data: signupUserMetadata(profile),
      },
    });
    if (error) {
      if (/rate limit|too many/i.test(error.message)) return json({ error: RATE_LIMIT_MESSAGE }, 429);
      return json({ error: friendlyAuthError(error.message) }, 400);
    }
    if (!data.session) {
      return json({ notice: "Check your email to confirm the account, then sign in." }, 200);
    }
    return json(
      {
        notice: null,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      },
      200,
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password: String(body.password),
  });
  if (error) {
    if (/rate limit|too many/i.test(error.message)) return json({ error: RATE_LIMIT_MESSAGE }, 429);
    return json({ error: friendlyAuthError(error.message) }, 401);
  }
  if (!data.session) return json({ error: "That email and password do not match." }, 401);
  return json(
    {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
    200,
  );
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requestOrigin(request)).origin;
  } catch {
    return false;
  }
}

export function requestOrigin(request: { headers: { get(name: string): string | null } }): string {
  const host = firstHeader(request.headers.get("x-forwarded-host")) ?? firstHeader(request.headers.get("host")) ?? "localhost";
  const forwarded = firstHeader(request.headers.get("x-forwarded-proto"));
  const proto = forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function createEphemeralClient(): AuthAttemptClient | null {
  const config = supabaseConfig();
  if (!config) return null;
  return createSupabaseClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function readBody(request: Request): Promise<AttemptBody | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return null;
    return body as AttemptBody;
  } catch {
    return null;
  }
}

function json(body: { error?: string; notice?: string | null; accessToken?: string; refreshToken?: string }, status: number): Response {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function firstHeader(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : null;
}
