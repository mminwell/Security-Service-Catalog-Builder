import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/rate_limited/i.test(message)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  if (message) return { ok: false, error: message };
  return { ok: false, error: "Something went wrong." };
}
