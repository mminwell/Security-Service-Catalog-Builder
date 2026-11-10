export function friendlyAuthError(message: string): string {
  if (/rate limit/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/already registered|already been registered/i.test(message)) {
    return "If this email is new, check your inbox to confirm it. If you already have an account, sign in.";
  }
  if (/invalid login credentials/i.test(message)) return "That email and password do not match.";
  return message;
}
