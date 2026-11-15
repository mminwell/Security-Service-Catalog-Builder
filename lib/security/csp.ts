export type ContentSecurityPolicyInput = {
  nonce: string;
  supabaseUrl: string;
  development: boolean;
  /** Omitted on an http page, where it would rewrite this app's own font fetches to https. */
  upgradeInsecureRequests?: boolean;
};

const LOCAL_SUPABASE = [
  "http://127.0.0.1:54321",
  "http://localhost:54321",
  "ws://127.0.0.1:54321",
  "ws://localhost:54321",
];

/**
 * style-src keeps 'unsafe-inline' and does not use a nonce.
 * A nonce or hash in style-src makes browsers ignore 'unsafe-inline'.
 * This app sets style attributes from React (the help panel position, catalog
 * progress, logo size, and form spacing) and the invite callback page centers
 * its message with a style attribute. Nonces apply to <style> elements, not
 * to those attributes, so the attribute allowance has to stay.
 */
export function contentSecurityPolicy(input: ContentSecurityPolicyInput): string {
  const script = [
    "script-src 'self'",
    `'nonce-${input.nonce}'`,
    "'strict-dynamic'",
    input.development ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const connect = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    ...supabaseConnectSources(input.supabaseUrl),
    ...(input.development ? LOCAL_SUPABASE : []),
  ];
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${unique(connect).join(" ")}`,
  ];
  if (input.upgradeInsecureRequests !== false) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Same generator the Next.js CSP guide uses, so the framework can read the nonce back out. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

function supabaseConnectSources(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const ws = url.origin.replace(/^http/i, "ws");
    return [url.origin, ws];
  } catch {
    return [];
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
