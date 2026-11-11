import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isUuid } from "@/lib/auth/ids";
import { allows, membershipRole, type AccessLevel, type Membership } from "@/lib/auth/permissions";
import type { Role } from "@/lib/catalog/types";
import { fail, ok, type ActionResult } from "@/lib/server/result";
import { createClient } from "@/lib/supabase/server";

export async function createAuthedClient(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in required.");
  return { supabase, user: data.user };
}

export async function loadOwnMemberships(supabase: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data, error } = await supabase.from("tenant_members").select("tenant_id, role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    userId,
    tenantId: String(row.tenant_id),
    role: row.role as Role,
  }));
}

export async function assertLevel(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  level: AccessLevel,
): Promise<void> {
  if (!isUuid(tenantId)) throw new Error("That workspace is not valid.");
  const rows = await loadOwnMemberships(supabase, userId);
  if (!allows(membershipRole(rows, userId, tenantId), level)) {
    throw new Error("You do not have permission for that workspace.");
  }
}

export async function runMutation<T>(
  tenantId: string,
  level: AccessLevel,
  run: (supabase: SupabaseClient, user: User) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const { supabase, user } = await createAuthedClient();
    await assertLevel(supabase, user.id, tenantId, level);
    return ok(await run(supabase, user));
  } catch (error) {
    return fail(error);
  }
}
