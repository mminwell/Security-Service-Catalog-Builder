import type { SupabaseClient } from "@supabase/supabase-js";

export const DEACTIVATED_MESSAGE = "This account is deactivated. A Site Admin can reactivate it.";

export function isDeactivatedStamp(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

/** Missing table (migration not applied yet) does not lock anyone out. A row with deactivated_at does. */
export function deactivatedFromStatus(input: {
  errorMessage: string | null;
  deactivatedAt: string | null | undefined;
}): boolean {
  if (input.errorMessage && /account_status|schema cache|does not exist|could not find/i.test(input.errorMessage)) {
    return false;
  }
  if (input.errorMessage) return false;
  return isDeactivatedStamp(input.deactivatedAt);
}

export async function accountIsDeactivated(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return false;
  const status = await supabase.from("account_status").select("deactivated_at").eq("user_id", userId).maybeSingle();
  return deactivatedFromStatus({
    errorMessage: status.error?.message ?? null,
    deactivatedAt: status.data?.deactivated_at ?? null,
  });
}
