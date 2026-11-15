import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { accountIsDeactivated } from "@/lib/auth/account-status";
import { sameOrigin } from "@/lib/auth/attempt-gate";
import { authCallbackBootstrapHtml, callbackRoutePlan, readCallbackField } from "@/lib/auth/callback-link";
import { authCallbackDestination } from "@/lib/auth/magic-link";
import { profileIsIncomplete } from "@/lib/auth/profile";
import { safeNextPath } from "@/lib/auth/redirect";
import { loadSessionProfile } from "@/lib/data/remote";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const plan = callbackRoutePlan(url.searchParams);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createClient();
  let verified = false;
  if (plan === "exchange-code" && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (plan === "verify-otp" && tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  if (verified) {
    const path = await settleVerifiedSession(supabase, next, type);
    return NextResponse.redirect(new URL(path, url.origin));
  }

  // No server-visible credential, or the code exchange failed. Invite links put
  // access_token in the fragment, which only the browser can read. Stay on this URL.
  const nonce = request.headers.get("x-nonce");
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store",
  };
  const csp = request.headers.get("content-security-policy");
  if (csp) headers["content-security-policy"] = csp;
  return new NextResponse(authCallbackBootstrapHtml(nonce), {
    status: 200,
    headers,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "That request was refused." },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ path: "/" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const next = safeNextPath(typeof record.next === "string" ? record.next : null);
  const accessToken = readCallbackField(record.accessToken);
  const refreshToken = readCallbackField(record.refreshToken);
  const linkType = readCallbackField(record.type, 32);
  const hashError = readCallbackField(record.error, 200);
  if (hashError && !(accessToken && refreshToken)) {
    const destination = authCallbackDestination({ verified: false, deactivated: false, next, linkType });
    return NextResponse.json({ path: destination.path });
  }
  if (!accessToken || !refreshToken) {
    const destination = authCallbackDestination({ verified: false, deactivated: false, next, linkType });
    return NextResponse.json({ path: destination.path });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) {
    const destination = authCallbackDestination({ verified: false, deactivated: false, next, linkType });
    return NextResponse.json({ path: destination.path });
  }
  const path = await settleVerifiedSession(supabase, next, linkType);
  return NextResponse.json({ path });
}

async function settleVerifiedSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  next: string,
  linkType: string | null,
): Promise<string> {
  const deactivated = await accountIsDeactivated(supabase);
  let accountReady = false;
  if (!deactivated) {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const profile = await loadSessionProfile(supabase, data.user);
        accountReady = Boolean(profile && !profileIsIncomplete(profile));
      }
    } catch {
      accountReady = false;
    }
  }
  const destination = authCallbackDestination({
    verified: true,
    deactivated,
    next,
    accountReady,
    linkType,
  });
  if (destination.signOut) await supabase.auth.signOut();
  return destination.path;
}
