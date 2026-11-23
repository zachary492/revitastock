import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fromWatchRow,
  toWatchRow,
  type SavedWatchRow,
  type WatchState,
} from "./watchState";

const PAGE = 1000;
const BATCH = 500;

export async function loadWatchStates(
  supabase: SupabaseClient,
  userId: string
): Promise<{ states: Map<string, WatchState>; error?: string }> {
  const states = new Map<string, WatchState>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("listing_watch_state")
      .select("item_id, first_seen_at, last_watched_at, last_watch_count, last_seen_at")
      .eq("user_id", userId)
      .order("item_id")
      .range(from, from + PAGE - 1);
    if (error) return { states, error: error.message };
    for (const row of (data ?? []) as SavedWatchRow[]) {
      const state = fromWatchRow(row);
      states.set(state.itemId, state);
    }
    if (!data || data.length < PAGE) break;
  }
  return { states };
}

export async function saveWatchStates(
  supabase: SupabaseClient,
  userId: string,
  states: WatchState[]
): Promise<{ error?: string }> {
  const rows = states.map((s) => toWatchRow(userId, s));
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("listing_watch_state")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "user_id,item_id" });
    if (error) return { error: error.message };
  }
  return {};
}
