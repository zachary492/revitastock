import type { ListingRecord, SellingLists } from "../ebay/sellingLists";

/** The database row for one saved sold or ended listing. */
export interface HistoryRow {
  user_id: string;
  item_id: string;
  status: "sold" | "ended_unsold";
  sold_key: string;
  sku: string | null;
  title: string;
  listing_type: string | null;
  quantity_available: number | null;
  quantity_sold: number;
  price: number | null;
  start_time: string | null;
  end_time: string | null;
  relisted: boolean;
  sold_at: string | null;
  paid: boolean | null;
  last_seen_at: string;
}

/** What we save: only sold and ended items, the ones eBay forgets. */
export function historyRecords(lists: SellingLists): ListingRecord[] {
  return [...lists.sold, ...lists.endedUnsold];
}

export function toHistoryRow(
  userId: string,
  record: ListingRecord,
  now: Date = new Date()
): HistoryRow {
  if (record.status === "active") {
    throw new Error("Active listings are not saved to history.");
  }
  return {
    user_id: userId,
    item_id: record.itemId,
    status: record.status,
    sold_key: record.soldAt ?? "",
    sku: record.sku,
    title: record.title,
    listing_type: record.listingType,
    quantity_available: record.quantityAvailable,
    quantity_sold: record.quantitySold,
    price: record.price,
    start_time: record.startTime,
    end_time: record.endTime,
    relisted: record.relisted,
    sold_at: record.soldAt,
    paid: record.paid,
    last_seen_at: now.toISOString(),
  };
}

export interface SavedRow {
  item_id: string;
  status: string;
  sku: string | null;
  title: string | null;
  listing_type: string | null;
  quantity_available: number | null;
  quantity_sold: number | null;
  price: number | string | null; // Postgres numeric can arrive as text
  start_time: string | null;
  end_time: string | null;
  relisted: boolean | null;
  sold_at: string | null;
  paid: boolean | null;
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Turns a saved row back into a ListingRecord (null if it isn't usable). */
export function fromSavedRow(row: SavedRow): ListingRecord | null {
  if (row.status !== "sold" && row.status !== "ended_unsold") return null;
  return {
    itemId: row.item_id,
    title: row.title ?? "",
    sku: row.sku,
    status: row.status,
    listingType: row.listing_type,
    quantityAvailable: row.quantity_available,
    quantitySold: row.quantity_sold ?? 0,
    price: numberOrNull(row.price),
    startTime: row.start_time,
    endTime: row.end_time,
    relisted: row.relisted ?? false,
    soldAt: row.sold_at,
    paid: row.paid,
  };
}

const keyOf = (r: ListingRecord) => `${r.status}|${r.itemId}|${r.soldAt ?? ""}`;

// Postgres returns timestamps like "2026-10-01T12:00:00+00:00" where eBay says
// "2026-10-01T12:00:00.000Z". Compare them as moments in time.
function sameMoment(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Adds saved sold/ended records that eBay no longer reports. Anything eBay
 * still reports wins over our saved copy. Active listings always come from
 * eBay alone, because a saved "active" listing could be long gone.
 */
export function mergeHistory(
  current: SellingLists,
  saved: ListingRecord[]
): { lists: SellingLists; fromHistory: number } {
  const seenSold = current.sold.map((r) => ({ id: r.itemId, at: r.soldAt }));
  const seenEnded = new Set(current.endedUnsold.map((r) => r.itemId));

  const lists: SellingLists = {
    active: [...current.active],
    sold: [...current.sold],
    endedUnsold: [...current.endedUnsold],
  };
  let fromHistory = 0;

  for (const record of saved) {
    if (record.status === "sold") {
      const known = seenSold.some(
        (s) => s.id === record.itemId && sameMoment(s.at, record.soldAt)
      );
      if (known) continue;
      seenSold.push({ id: record.itemId, at: record.soldAt });
      lists.sold.push(record);
      fromHistory++;
    } else if (record.status === "ended_unsold") {
      if (seenEnded.has(record.itemId)) continue;
      seenEnded.add(record.itemId);
      lists.endedUnsold.push(record);
      fromHistory++;
    }
  }
  return { lists, fromHistory };
}

export { keyOf as historyRecordKey };
