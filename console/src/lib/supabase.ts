import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for Console.
 * Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable auth.
 * Then use auth.getSession(), auth.signIn(), auth.signOut() for RBAC wiring.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon);
}
