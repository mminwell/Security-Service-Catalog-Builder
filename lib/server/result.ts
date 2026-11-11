export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof Error && error.message.trim()) return { ok: false, error: error.message };
  return { ok: false, error: "Something went wrong." };
}
