import { createHash } from "node:crypto";
import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";

export { RATE_LIMIT_MESSAGE };

export type RateLimitCaller = {
  rpc: (
    fn: string,
    args: { p_action: string; p_bucket: string | null },
  ) => PromiseLike<{ error: { message: string } | null }>;
};

/** SHA-256 hex. The database stores this, never the email or IP. */
export function hashRateKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Prefer the platform client IP. x-real-ip is set by Vercel and is not taken
 * from a caller-supplied X-Forwarded-For list. Local dev often has neither.
 */
export function clientAddress(headerStore: { get(name: string): string | null }): string {
  const real = firstAddress(headerStore.get("x-real-ip"));
  if (real) return real;
  const vercel = lastAddress(headerStore.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;
  const forwarded = firstAddress(headerStore.get("x-forwarded-for"));
  if (forwarded) return forwarded;
  return "unknown";
}

export function limiterMissing(message: string): boolean {
  return /enforce_rate_limit/i.test(message) && /schema cache|could not find the function|does not exist/i.test(message);
}

export function isRateLimitedMessage(message: string): boolean {
  return /rate_limited/i.test(message);
}

export async function enforceRateLimits(
  supabase: RateLimitCaller,
  checks: Array<{ action: string; material: string | null }>,
): Promise<void> {
  for (const check of checks) {
    const outcome = await consumeRateLimit(supabase, check.action, check.material);
    if (outcome === "limited") throw new Error("rate_limited");
    if (outcome === "unavailable") return;
  }
}

async function consumeRateLimit(
  supabase: RateLimitCaller,
  action: string,
  material: string | null,
): Promise<"ok" | "limited" | "unavailable"> {
  const bucket = material == null ? null : hashRateKey(material);
  const { error } = await supabase.rpc("enforce_rate_limit", { p_action: action, p_bucket: bucket });
  if (!error) return "ok";
  if (isRateLimitedMessage(error.message)) return "limited";
  if (limiterMissing(error.message)) return "unavailable";
  throw new Error(error.message);
}

function firstAddress(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : null;
}

function lastAddress(value: string | null): string | null {
  const parts = value?.split(",").map((part) => part.trim()).filter((part) => part.length > 0) ?? [];
  return parts.length > 0 ? parts[parts.length - 1] : null;
}
