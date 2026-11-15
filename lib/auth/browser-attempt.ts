import { RATE_LIMIT_MESSAGE } from "@/lib/security/copy";

export async function postAuthAttempt(
  path: string,
  body: Record<string, string>,
): Promise<{ notice: string | null; accessToken: string | null; refreshToken: string | null }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The request could not be sent. Try again in a moment.");
  }
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
    notice?: unknown;
    accessToken?: unknown;
    refreshToken?: unknown;
  } | null;
  if (response.status === 429) throw new Error(typeof payload?.error === "string" ? payload.error : RATE_LIMIT_MESSAGE);
  if (!response.ok) {
    const message = typeof payload?.error === "string" && payload.error.trim() ? payload.error : "Could not complete that request.";
    throw new Error(message);
  }
  return {
    notice: typeof payload?.notice === "string" ? payload.notice : null,
    accessToken: typeof payload?.accessToken === "string" ? payload.accessToken : null,
    refreshToken: typeof payload?.refreshToken === "string" ? payload.refreshToken : null,
  };
}
