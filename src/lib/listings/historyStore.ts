import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingRecord, SellingLists } from "../ebay/sellingLists";
import { loadWatchStates, saveWatchStates } from "./watchStore";
import { nextWatchStates, type WatchState } from "./watchState";
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
  /** What we remember about each live listing's watchers (undefined if unavailable). */
  watchStates?: Map<string, WatchState>;
  /** Set when saving or reading failed; the data is then eBay-only. */
  warning?: string;
}

/**
 * Saves what eBay reports now, then adds anything older that we saved before.
 * Also updates the watcher memory for live listings.
 * Never throws: if the database step fails, the seller still gets eBay's data.
 */
export async function syncListingHistory(
  supabase: SupabaseClient,
  userId: string,
  current: SellingLists,
  now: Date = new Date()
): Promise<HistoryOutcome> {
  const warnings: string[] = [];

  // Sold and ended history
  let lists = current;
  let fromHistory = 0;
  const saveResult = await saveListingHistory(supabase, userId, current);
  if (saveResult.error) warnings.push(`Saving history failed: ${saveResult.error}`);
  const loaded = await loadListingHistory(supabase, userId);
  if (loaded.error) {
    warnings.push(`Saved history couldn't be read: ${loaded.error}`);
  } else {
    const merged = mergeHistory(current, loaded.records);
    lists = merged.lists;
    fromHistory = merged.fromHistory;
  }

  // Watchers on live listings
  let watchStates: Map<string, WatchState> | undefined;
  const watchLoaded = await loadWatchStates(supabase, userId);
  if (watchLoaded.error) {
    warnings.push(`Watcher history couldn't be read: ${watchLoaded.error}`);
  } else {
    const updated = nextWatchStates(watchLoaded.states, current.active, now);
    const saved = await saveWatchStates(supabase, userId, updated);
    if (saved.error) warnings.push(`Saving watcher history failed: ${saved.error}`);
    watchStates = new Map(watchLoaded.states);
    for (const state of updated) watchStates.set(state.itemId, state);
  }

  return {
    lists,
    fromHistory,
    watchStates,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}
