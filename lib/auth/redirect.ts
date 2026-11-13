const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/confirm", "/auth/reset"];

export function isPublicPath(pathname: string): boolean {
  if (process.env.PHASE2_SCREENSHOTS === "1" && pathname.startsWith("/preview/phase2")) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Same-origin relative path only. Rejects protocol-relative and backslash tricks. */
export function safeNextPath(value: string | null | undefined, fallback = "/catalog"): string {
  if (!value) return fallback;
  const next = value.trim();
  if (next.length === 0 || next.length > 200) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.includes("\\") || next.includes("://") || next.includes("\0")) return fallback;
  return next;
}
