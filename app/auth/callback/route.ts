import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { accountIsDeactivated } from "@/lib/auth/account-status";
import { authCallbackDestination } from "@/lib/auth/magic-link";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const authError = url.searchParams.get("error") ?? url.searchParams.get("error_code");
  const supabase = await createClient();

  let verified = false;
  if (!authError && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (!authError && tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  const deactivated = verified ? await accountIsDeactivated(supabase) : false;
  const destination = authCallbackDestination({ verified, deactivated, next });
  if (destination.signOut) await supabase.auth.signOut();
  return NextResponse.redirect(new URL(destination.path, url.origin));
}
