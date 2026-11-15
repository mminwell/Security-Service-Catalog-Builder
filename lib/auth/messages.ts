import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";

export function isAuthSessionMissing(message: string): boolean {
  return /auth session missing/i.test(message);
}

export function friendlyAuthError(message: string): string {
  if (/rate_limited|rate limit|too many/i.test(message)) return RATE_LIMIT_MESSAGE;
  if (/already registered|already been registered/i.test(message)) {
    return "If this email is new, check your inbox to confirm it. If you already have an account, sign in.";
  }
  if (/invalid login credentials/i.test(message)) return "That email and password do not match.";
  if (isAuthSessionMissing(message)) return "Sign-in did not start a session. Try again.";
  return message;
}
