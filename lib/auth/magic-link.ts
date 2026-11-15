import { normalizeEmail, validateEmail } from "@/lib/auth/credentials";
import { friendlyAuthError } from "@/lib/auth/messages";

/** Shown for every request, including an email that has no account. */
export const MAGIC_LINK_NOTICE =
  "If an account exists for that email, a sign-in link is on its way. It works once and then expires.";

const HIDDEN_ACCOUNT_ERROR =
  /signups not allowed|user not found|otp_disabled|user banned|not allowed for otp|email address not authorized|signup is disabled/i;

const RATE_LIMIT_ERROR = /rate limit|too many|only request this after|security purposes/i;

export function magicLinkRedirectTo(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent("/catalog")}`;
}

/** Unknown addresses stay on the same calm result as a real send. */
export function interpretMagicLinkError(message: string | null): "sent" | "rate" | "failed" {
  if (!message) return "sent";
  if (RATE_LIMIT_ERROR.test(message)) return "rate";
  if (HIDDEN_ACCOUNT_ERROR.test(message)) return "sent";
  return "failed";
}

export type MagicLinkClient = {
  auth: {
    signInWithOtp: (input: {
      email: string;
      options: { shouldCreateUser: boolean; emailRedirectTo: string };
    }) => Promise<{ error: { message: string } | null }>;
  };
};

export async function requestMagicLink(
  client: MagicLinkClient,
  email: string,
  origin: string,
): Promise<{ notice: string } | { error: string }> {
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };
  const { error } = await client.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: magicLinkRedirectTo(origin),
    },
  });
  const outcome = interpretMagicLinkError(error?.message ?? null);
  if (outcome === "rate") return { error: friendlyAuthError(error?.message ?? "rate limit") };
  if (outcome === "failed") return { error: "The sign-in link could not be sent. Try again in a moment." };
  return { notice: MAGIC_LINK_NOTICE };
}

/** After the link is verified, a deactivated account is signed out instead of entering the app. */
export function authCallbackDestination(input: {
  verified: boolean;
  deactivated: boolean;
  next: string;
}): { path: string; signOut: boolean } {
  if (!input.verified) return { path: "/login?error=auth", signOut: false };
  if (input.deactivated) return { path: "/login?error=deactivated", signOut: true };
  return { path: input.next, signOut: false };
}
