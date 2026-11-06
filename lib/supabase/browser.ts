import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/env";

export function createBrowserSupabase(): SupabaseClient {
  const config = supabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }
  return createBrowserClient(config.url, config.anonKey);
}
