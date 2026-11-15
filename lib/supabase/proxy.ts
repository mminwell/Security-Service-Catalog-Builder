import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, proxySkipsSupabase, safeNextPath } from "@/lib/auth/redirect";
import { supabaseConfig } from "@/lib/supabase/env";

export type SessionGuard = {
  nonce: string;
  csp: string;
};

export async function updateSession(request: NextRequest, guard: SessionGuard) {
  const path = request.nextUrl.pathname;
  if (proxySkipsSupabase(path)) return forward(request, guard);

  const config = supabaseConfig();
  if (!config) return forward(request, guard);

  let response = forward(request, guard);
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward(request, guard);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        }
      },
    },
  });

  // Refresh the session before any other logic. getClaims verifies the JWT.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  } catch {
    signedIn = false;
  }

  if (!signedIn && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (path !== "/") url.searchParams.set("next", safeNextPath(path, "/catalog"));
    return stamp(NextResponse.redirect(url), guard);
  }

  if (signedIn && path === "/login") {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return stamp(NextResponse.redirect(new URL(next, request.url)), guard);
  }

  return response;
}

function forward(request: NextRequest, guard: SessionGuard) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", guard.nonce);
  requestHeaders.set("content-security-policy", guard.csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return stamp(response, guard);
}

function stamp(response: NextResponse, guard: SessionGuard) {
  response.headers.set("Content-Security-Policy", guard.csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
