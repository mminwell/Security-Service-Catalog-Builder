export const DEMO_PREFIX = "/demo";

export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_PREFIX || pathname.startsWith(`${DEMO_PREFIX}/`);
}

/** App routes inside the demo, so nav highlighting can ignore the /demo prefix. */
export function stripDemoPrefix(pathname: string): string {
  if (pathname === DEMO_PREFIX) return "/catalog";
  if (pathname.startsWith(`${DEMO_PREFIX}/`)) {
    const rest = pathname.slice(DEMO_PREFIX.length);
    return rest.length > 0 ? rest : "/catalog";
  }
  return pathname;
}

/**
 * Keep sign-in, auth, and invite URLs on the real app.
 * Catalog routes opened from the demo stay under /demo.
 */
export function withDemoPrefix(path: string, demo: boolean): string {
  if (!demo) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const cutAt = ["?", "#"].map((mark) => path.indexOf(mark)).filter((index) => index >= 0);
  const cut = cutAt.length > 0 ? Math.min(...cutAt) : path.length;
  const pathname = path.slice(0, cut);
  const suffix = path.slice(cut);
  if (pathname === DEMO_PREFIX || pathname.startsWith(`${DEMO_PREFIX}/`)) return path;
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/preview")
  ) {
    return path;
  }
  return `${DEMO_PREFIX}${pathname}${suffix}`;
}
