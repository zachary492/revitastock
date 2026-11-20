import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client that bypasses row-level security. For background jobs
 * only (no signed-in user). Never import this from a page or a component,
 * and always filter by user_id yourself.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
