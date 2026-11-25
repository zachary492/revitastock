import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeletionNotice } from "./notificationVerify";

/**
 * Finds the RevitaSync accounts connected to the eBay account in a deletion
 * notice. Exact matches only (never wildcards), so no other seller is touched.
 */
export async function findUsersForNotice(
  admin: SupabaseClient,
  notice: DeletionNotice
): Promise<string[]> {
  const lookups: [string, string | null][] = [
    ["ebay_username", notice.username],
    ["ebay_eias_token", notice.eiasToken],
    ["ebay_user_id", notice.userId],
  ];
  const ids = new Set<string>();
  for (const [column, value] of lookups) {
    if (!value) continue;
    const { data, error } = await admin.from("ebay_connections").select("user_id").eq(column, value);
    if (error) throw new Error(`Lookup failed: ${error.message}`);
    for (const row of data ?? []) if (row.user_id) ids.add(row.user_id as string);
  }
  return [...ids];
}

/**
 * Deletes each account. Everything else (connection, listings history,
 * findings, saved details, settings) is removed with it, because those tables
 * are all tied to the account and deleted together.
 */
export async function deleteUsers(admin: SupabaseClient, userIds: string[]): Promise<void> {
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not.?found/i.test(error.message)) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }
}
