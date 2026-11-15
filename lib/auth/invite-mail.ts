import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
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
}): Promise<InviteNotice> {
  const config = supabaseConfig();
  if (!config) {
    return { sent: false, detail: "Supabase is not configured, so no email was sent. The invite is saved." };
  }
  const origin = await requestOrigin();
  const next = input.kind === "invited" && input.token ? `/invite/${input.token}` : "/catalog";
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey && input.kind === "invited") {
    const admin = createClient(config.url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const invited = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo,
      data: {
        workspace_name: input.workspaceName,
        invited_role: roleLabel(input.role),
      },
    });
    if (!invited.error) {
      return { sent: true, detail: `Invite email sent for ${roleLabel(input.role)} in ${input.workspaceName}.` };
    }
  }

  const anon = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const otp = await anon.auth.signInWithOtp({
    email: input.email,
    options: { shouldCreateUser: input.kind === "invited", emailRedirectTo: redirectTo },
  });
  if (otp.error) {
    const needsKey = serviceKey ? "" : " Naming the role inside the email needs SUPABASE_SERVICE_ROLE_KEY, which is not configured.";
    return {
      sent: false,
      detail: `The ${input.kind === "invited" ? "invite is saved" : "person was added"}, but the email was not sent (${otp.error.message}).${needsKey}`,
    };
  }
  const roleText = roleLabel(input.role);
  if (input.kind === "member") {
    return {
      sent: true,
      detail: `Added as ${roleText}. A sign-in email was sent through Supabase Auth. The Auth template does not include the role name unless SUPABASE_SERVICE_ROLE_KEY is configured.`,
    };
  }
  return {
    sent: true,
    detail: `Invite saved as ${roleText}. A link was sent through Supabase Auth to finish the account. The Auth template does not include the role name unless SUPABASE_SERVICE_ROLE_KEY is configured.`,
  };
}

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
