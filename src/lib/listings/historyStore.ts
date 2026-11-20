import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingRecord, SellingLists } from "../ebay/sellingLists";
import {
  fromSavedRow,
  historyRecords,
  mergeHistory,
  toHistoryRow,
  type SavedRow,
} from "./history";

const PAGE = 1000; // Supabase returns at most 1,000 rows per request
const BATCH = 500;

/** Saves (or refreshes) every sold and ended listing we just saw. */
export async function saveListingHistory(
  supabase: SupabaseClient,
  userId: string,
  lists: SellingLists
): Promise<{ saved: number; error?: string }> {
  const rows = historyRecords(lists).map((r) => toHistoryRow(userId, r));
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("listing_history")
      .upsert(rows.slice(i, i + BATCH), {
        onConflict: "user_id,item_id,status,sold_key",
      });
    if (error) return { saved: i, error: error.message };
  }
  return { saved: rows.length };
}

/** Reads every saved record for this seller, page by page. */
export async function loadListingHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<{ records: ListingRecord[]; error?: string }> {
  const records: ListingRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("listing_history")
      .select(
        "item_id, status, sku, title, listing_type, quantity_available, quantity_sold, price, start_time, end_time, relisted, sold_at, paid"
      )
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { records, error: error.message };
    for (const row of (data ?? []) as SavedRow[]) {
      const record = fromSavedRow(row);
      if (record) records.push(record);
    }
    if (!data || data.length < PAGE) break;
  }
  return { records };
}

export interface HistoryOutcome {
  lists: SellingLists;
  /** How many sold/ended items came only from our saved copy. */
  fromHistory: number;
  /** Set when saving or reading failed; the lists are then eBay-only. */
  warning?: string;
}

/**
 * Saves what eBay reports now, then adds anything older that we saved before.
 * Never throws: if the database step fails, the seller still gets eBay's data.
 */
export async function syncListingHistory(
  supabase: SupabaseClient,
  userId: string,
  current: SellingLists
): Promise<HistoryOutcome> {
  const saveResult = await saveListingHistory(supabase, userId, current);
  const loaded = await loadListingHistory(supabase, userId);
  if (loaded.error) {
    return {
      lists: current,
      fromHistory: 0,
      warning: `Saved history couldn't be read: ${loaded.error}`,
    };
  }
  const merged = mergeHistory(current, loaded.records);
  return {
    ...merged,
    warning: saveResult.error
      ? `Saving history failed: ${saveResult.error}`
      : undefined,
  };
}
