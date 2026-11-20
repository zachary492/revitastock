import { describe, it, expect } from "vitest";
import {
  fromSavedRow,
  historyRecords,
  mergeHistory,
  toHistoryRow,
  type SavedRow,
} from "../../src/lib/listings/history";
import {
  loadListingHistory,
  saveListingHistory,
  syncListingHistory,
} from "../../src/lib/listings/historyStore";
import type { ListingRecord, SellingLists } from "../../src/lib/ebay/sellingLists";
import type { SupabaseClient } from "@supabase/supabase-js";

function rec(o: Partial<ListingRecord>): ListingRecord {
  return {
    itemId: "100000000001",
    title: "Test",
    sku: "A-001",
    status: "ended_unsold",
    listingType: "FixedPriceItem",
    quantityAvailable: 1,
    quantitySold: 0,
    price: 10,
    startTime: "2026-08-01T00:00:00.000Z",
    endTime: "2026-09-01T00:00:00.000Z",
    relisted: false,
    soldAt: null,
    paid: null,
    ...o,
  };
}
const empty: SellingLists = { active: [], sold: [], endedUnsold: [] };

describe("toHistoryRow / fromSavedRow", () => {
  it("round-trips an ended listing", () => {
    const r = rec({});
    const row = toHistoryRow("u1", r, new Date("2026-11-19T00:00:00Z"));
    expect(row.user_id).toBe("u1");
    expect(row.sold_key).toBe("");
    expect(row.last_seen_at).toBe("2026-11-19T00:00:00.000Z");
    expect(fromSavedRow(row as unknown as SavedRow)).toEqual(r);
  });
  it("keys sold items by sale time", () => {
    const r = rec({ status: "sold", soldAt: "2026-10-05T10:00:00.000Z", paid: true, quantitySold: 1 });
    const row = toHistoryRow("u1", r);
    expect(row.sold_key).toBe("2026-10-05T10:00:00.000Z");
    expect(fromSavedRow(row as unknown as SavedRow)).toEqual(r);
  });
  it("refuses to save active listings", () => {
    expect(() => toHistoryRow("u1", rec({ status: "active" }))).toThrow();
  });
  it("reads numeric prices that arrive as text and skips unknown statuses", () => {
    const base: SavedRow = {
      item_id: "1", status: "sold", sku: null, title: null, listing_type: null,
      quantity_available: null, quantity_sold: null, price: "12.50", start_time: null,
      end_time: null, relisted: null, sold_at: null, paid: null,
    };
    expect(fromSavedRow(base)?.price).toBe(12.5);
    expect(fromSavedRow({ ...base, status: "active" })).toBeNull();
  });
});

describe("historyRecords", () => {
  it("takes sold and ended, never active", () => {
    const lists: SellingLists = {
      active: [rec({ itemId: "1", status: "active" })],
      sold: [rec({ itemId: "2", status: "sold", soldAt: "2026-10-01T00:00:00Z" })],
      endedUnsold: [rec({ itemId: "3" })],
    };
    expect(historyRecords(lists).map((r) => r.itemId)).toEqual(["2", "3"]);
  });
});

describe("mergeHistory", () => {
  it("adds old ended items eBay no longer reports", () => {
    const saved = [rec({ itemId: "OLD" })];
    const { lists, fromHistory } = mergeHistory(empty, saved);
    expect(lists.endedUnsold.map((r) => r.itemId)).toEqual(["OLD"]);
    expect(fromHistory).toBe(1);
  });
  it("prefers eBay's current copy over the saved one", () => {
    const current: SellingLists = { ...empty, endedUnsold: [rec({ relisted: true })] };
    const { lists, fromHistory } = mergeHistory(current, [rec({ relisted: false })]);
    expect(lists.endedUnsold).toHaveLength(1);
    expect(lists.endedUnsold[0]?.relisted).toBe(true);
    expect(fromHistory).toBe(0);
  });
  it("matches sales by item and time, treating +00:00 and Z as the same moment", () => {
    const current: SellingLists = {
      ...empty,
      sold: [rec({ status: "sold", soldAt: "2026-10-05T10:00:00.000Z" })],
    };
    const saved = [
      rec({ status: "sold", soldAt: "2026-10-05T10:00:00+00:00" }),
      rec({ status: "sold", soldAt: "2026-07-01T10:00:00+00:00" }),
    ];
    const { lists, fromHistory } = mergeHistory(current, saved);
    expect(lists.sold).toHaveLength(2);
    expect(fromHistory).toBe(1);
  });
  it("keeps two sales of the same item separate", () => {
    const saved = [
      rec({ status: "sold", soldAt: "2026-07-01T10:00:00Z" }),
      rec({ status: "sold", soldAt: "2026-07-02T10:00:00Z" }),
    ];
    expect(mergeHistory(empty, saved).lists.sold).toHaveLength(2);
  });
  it("never brings saved active listings back, and doesn't change its input", () => {
    const current: SellingLists = { ...empty, active: [rec({ itemId: "LIVE", status: "active" })] };
    const before = JSON.stringify(current);
    const { lists } = mergeHistory(current, [rec({ itemId: "GONE", status: "active" })]);
    expect(lists.active.map((r) => r.itemId)).toEqual(["LIVE"]);
    expect(JSON.stringify(current)).toBe(before);
  });
  it("does not double-add the same saved record", () => {
    const saved = [rec({}), rec({})];
    expect(mergeHistory(empty, saved).lists.endedUnsold).toHaveLength(1);
  });
});

// A tiny fake of the parts of Supabase we use.
function fakeSupabase(opts: { stored?: SavedRow[]; upsertError?: string; selectError?: string }) {
  const upserts: unknown[][] = [];
  const stored = opts.stored ?? [];
  const client = {
    from: () => ({
      upsert: async (rows: unknown[]) => {
        upserts.push(rows);
        return { error: opts.upsertError ? { message: opts.upsertError } : null };
      },
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          range: async (from: number, to: number) =>
            opts.selectError
              ? { data: null, error: { message: opts.selectError } }
              : { data: stored.slice(from, to + 1), error: null },
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, upserts };
}
const savedRow = (id: string): SavedRow => ({
  item_id: id, status: "ended_unsold", sku: "A-001", title: "T", listing_type: null,
  quantity_available: 1, quantity_sold: 0, price: 5, start_time: null, end_time: null,
  relisted: false, sold_at: null, paid: null,
});

describe("history store", () => {
  it("saves in batches of 500", async () => {
    const lists: SellingLists = {
      ...empty,
      endedUnsold: Array.from({ length: 1100 }, (_, i) => rec({ itemId: String(100000 + i) })),
    };
    const { client, upserts } = fakeSupabase({});
    const r = await saveListingHistory(client, "u1", lists);
    expect(r.saved).toBe(1100);
    expect(upserts.map((u) => u.length)).toEqual([500, 500, 100]);
  });
  it("reads more than one page of saved rows", async () => {
    const stored = Array.from({ length: 2300 }, (_, i) => savedRow(String(i)));
    const { client } = fakeSupabase({ stored });
    const r = await loadListingHistory(client, "u1");
    expect(r.records).toHaveLength(2300);
  });
  it("falls back to eBay-only data if saved history can't be read", async () => {
    const current: SellingLists = { ...empty, endedUnsold: [rec({})] };
    const { client } = fakeSupabase({ selectError: "boom" });
    const out = await syncListingHistory(client, "u1", current);
    expect(out.lists).toBe(current);
    expect(out.fromHistory).toBe(0);
    expect(out.warning).toContain("boom");
  });
  it("still merges history when saving fails, and warns", async () => {
    const { client } = fakeSupabase({ stored: [savedRow("OLD")], upsertError: "nope" });
    const out = await syncListingHistory(client, "u1", { ...empty, endedUnsold: [rec({ itemId: "NEW" })] });
    expect(out.lists.endedUnsold.map((r) => r.itemId).sort()).toEqual(["NEW", "OLD"]);
    expect(out.warning).toContain("nope");
  });
});
