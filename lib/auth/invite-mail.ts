import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { inviteNoticeText } from "@/lib/auth/invites";
import { roleLabel } from "@/lib/catalog/access";
import type { Role } from "@/lib/catalog/types";
import { supabaseConfig } from "@/lib/supabase/env";

export type InviteNotice = {
  sent: boolean;
  detail: string;
};

/**
 * Sends the invite through Supabase Auth, which already relays mail with Resend.
 * inviteUserByEmail needs SUPABASE_SERVICE_ROLE_KEY and is used only when that variable
 * is already present. Otherwise the anon client asks Auth to email a one-time link.
 * The role stays on the invitation row. It is not taken from the email body.
 */
export async function sendInviteNotice(input: {
  email: string;
  token: string | null;
  workspaceName: string;
  role: Role;
  kind: "invited" | "member";
  resent?: boolean;
}): Promise<InviteNotice> {
  const notice = (sent: boolean) =>
    inviteNoticeText({ email: input.email, kind: input.kind, sent, resent: input.resent });
  const config = supabaseConfig();
  if (!config) {
    return { sent: false, detail: notice(false) };
  }
  const origin = await requestOrigin();
  const next = inviteEmailNextPath(input.kind, input.token);
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Implicit, not PKCE. This email is opened in the invitee's browser, which does not
  // have the code verifier a server-side PKCE challenge would store only in this process.
  // GoTrue then returns the session in the URL fragment, and /auth/callback reads it.
  const auth = { persistSession: false, autoRefreshToken: false, flowType: "implicit" as const };
  if (serviceKey && input.kind === "invited") {
    const admin = createClient(config.url, serviceKey, {
      auth,
    });
    const invited = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo,
      data: {
        workspace_name: input.workspaceName,
        invited_role: roleLabel(input.role),
      },
    });
    if (!invited.error) {
      return { sent: true, detail: notice(true) };
    }
  }

  const anon = createClient(config.url, config.anonKey, {
    auth,
  });
  const otp = await anon.auth.signInWithOtp({
    email: input.email,
    options: { shouldCreateUser: input.kind === "invited", emailRedirectTo: redirectTo },
  });
  if (otp.error) {
    return { sent: false, detail: notice(false) };
  }
  return { sent: true, detail: notice(true) };
}

export function inviteEmailNextPath(kind: "invited" | "member", token: string | null): string {
  return kind === "invited" && token ? `/invite/${token}` : "/catalog";
}

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
