import { type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const https = forwarded === "https" || request.nextUrl.protocol === "https:";
  const csp = contentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    development: process.env.NODE_ENV === "development",
    upgradeInsecureRequests: https,
  });
  return updateSession(request, { nonce, csp });
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|otf|woff|woff2)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
