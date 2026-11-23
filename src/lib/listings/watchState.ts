import type { ListingRecord } from "../ebay/sellingLists";

/** What we remember about one live listing's watchers. */
export interface WatchState {
  itemId: string;
  firstSeenAt: string;
  lastWatchedAt: string | null; // last time we saw at least one watcher
  lastWatchCount: number;
  lastSeenAt: string;
}

export interface WatchRow {
  user_id: string;
  item_id: string;
  first_seen_at: string;
  last_watched_at: string | null;
  last_watch_count: number;
  last_seen_at: string;
}

export type SavedWatchRow = Omit<WatchRow, "user_id">;

export function toWatchRow(userId: string, s: WatchState): WatchRow {
  return {
    user_id: userId,
    item_id: s.itemId,
    first_seen_at: s.firstSeenAt,
    last_watched_at: s.lastWatchedAt,
    last_watch_count: s.lastWatchCount,
    last_seen_at: s.lastSeenAt,
  };
}

export function fromWatchRow(row: SavedWatchRow): WatchState {
  return {
    itemId: row.item_id,
    firstSeenAt: row.first_seen_at,
    lastWatchedAt: row.last_watched_at,
    lastWatchCount: row.last_watch_count ?? 0,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * Updates the saved watcher memory with what eBay reports now. Only live
 * listings are tracked. A listing that has no <WatchCount> counts as zero.
 * Returns the new state of each live listing; the input is not changed.
 */
export function nextWatchStates(
  existing: ReadonlyMap<string, WatchState>,
  active: ListingRecord[],
  now: Date = new Date()
): WatchState[] {
  const stamp = now.toISOString();
  return active
    .filter((r) => r.status === "active")
    .map((r) => {
      const before = existing.get(r.itemId);
      const count = r.watchCount ?? 0;
      return {
        itemId: r.itemId,
        firstSeenAt: before?.firstSeenAt ?? stamp,
        lastWatchedAt: count > 0 ? stamp : (before?.lastWatchedAt ?? null),
        lastWatchCount: count,
        lastSeenAt: stamp,
      };
    });
}
