export type AuthHashSession = {
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
  error: string | null;
};

/** Supabase invite and magic-link redirects put the session in the URL fragment. The server never receives it. */
export function parseAuthHash(hash: string): AuthHashSession {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  return {
    accessToken: accessToken && accessToken.trim() ? accessToken.trim() : null,
    refreshToken: refreshToken && refreshToken.trim() ? refreshToken.trim() : null,
    type: params.get("type"),
    error: params.get("error") ?? params.get("error_code"),
  };
}

export type CallbackRoutePlan = "exchange-code" | "verify-otp" | "bootstrap-hash";

/** A code or token_hash can be exchanged on the server. Anything else may be a fragment session. */
export function callbackRoutePlan(params: URLSearchParams): CallbackRoutePlan {
  if (params.get("code")) return "exchange-code";
  if (params.get("token_hash") && params.get("type")) return "verify-otp";
  return "bootstrap-hash";
}

export function authCallbackRequestBody(input: {
  hash: string;
  next: string | null;
  queryError: string | null;
}): {
  next: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
  error: string | null;
} {
  const parsed = parseAuthHash(input.hash);
  return {
    next: input.next,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    type: parsed.type,
    error: parsed.error ?? input.queryError,
  };
}

export function readCallbackField(value: unknown, max = 8192): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}

/** Stay on this URL so the browser can read the fragment. Do not redirect before that. */
export function authCallbackBootstrapHtml(nonce?: string | null): string {
  const nonceAttr = scriptNonceAttribute(nonce);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opening your invite</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#faf9f5;color:#141413;font-family:system-ui,sans-serif">
  <p>Opening your invite…</p>
  <noscript><p>This link needs JavaScript so the invite can be opened.</p></noscript>
  <script${nonceAttr}>
    (function () {
      var query = new URLSearchParams(window.location.search);
      var hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
      var payload = {
        next: query.get("next"),
        accessToken: hash.get("access_token"),
        refreshToken: hash.get("refresh_token"),
        type: hash.get("type"),
        error: hash.get("error") || hash.get("error_code") || query.get("error") || query.get("error_code")
      };
      fetch("/auth/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json();
      }).then(function (data) {
        var path = data && typeof data.path === "string" ? data.path : "";
        if (path.charAt(0) === "/" && path.charAt(1) !== "/") window.location.replace(path);
        else window.location.replace("/login?error=auth");
      }).catch(function () {
        window.location.replace("/login?error=auth");
      });
    })();
  </script>
</body>
</html>`;
}

/** The callback page is raw HTML, so Next cannot stamp this script. The nonce has to be written here. */
export function scriptNonceAttribute(nonce: string | null | undefined): string {
  if (!nonce || !/^[A-Za-z0-9+/_-]+=*$/.test(nonce)) return "";
  return ` nonce="${nonce}"`;
}
