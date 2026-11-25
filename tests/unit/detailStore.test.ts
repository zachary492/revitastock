import { describe, it, expect } from "vitest";
import {
  DETAILS_MAX_AGE_DAYS,
  fromDetailRow,
  needingRefresh,
  refreshListingDetails,
  toDetailRow,
  type StoredDetails,
} from "../../src/lib/listings/detailStore";
import type { DetailFetchResult } from "../../src/lib/ebay/itemDetails";
import type { ListingRecord } from "../../src/lib/ebay/sellingLists";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOW = new Date("2026-11-23T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const rec = (id: string, o: Partial<ListingRecord> = {}): ListingRecord => ({
  itemId: id, title: `Title ${id}`, sku: `L-${id}`, status: "active", listingType: "FixedPriceItem",
  quantityAvailable: 1, quantitySold: 0, price: 10, startTime: null, endTime: null,
  relisted: false, soldAt: null, paid: null, ...o,
});
const stored = (id: string, o: Partial<StoredDetails> = {}): StoredDetails => ({
  itemId: id, title: `Title ${id}`, descriptionLength: 100, pictureCount: 5,
  specifics: [{ name: "Brand", values: ["X"] }], descriptionText: "text", categoryName: "A:B", fetchedAt: daysAgo(1), ...o,
});
const map = (...s: StoredDetails[]) => new Map(s.map((x) => [x.itemId, x]));

describe("row conversion", () => {
  it("round-trips", () => {
    const d = stored("1");
    const row = toDetailRow("u1", d);
    expect(row.user_id).toBe("u1");
    expect(fromDetailRow({ ...row })).toEqual(d);
  });
  it("copes with odd saved specifics", () => {
    const d = fromDetailRow({
      item_id: "1", title: null, description_length: null, picture_count: null,
      specifics: [{ name: "A", values: ["x", 5] }, 7, { values: [] }, { name: "B" }], fetched_at: daysAgo(0),
    });
    expect(d.specifics).toEqual([{ name: "A", values: ["x"] }, { name: "B", values: [] }]);
    expect(d.title).toBe("");
  });
});

describe("needingRefresh", () => {
  it("orders never-read, then edited titles, then oldest copies, and skips fresh ones", () => {
    const active = [rec("fresh"), rec("old"), rec("edited"), rec("never"), rec("older")];
    const s = map(
      stored("fresh"),
      stored("old", { fetchedAt: daysAgo(DETAILS_MAX_AGE_DAYS + 1) }),
      stored("older", { fetchedAt: daysAgo(DETAILS_MAX_AGE_DAYS + 20) }),
      stored("edited", { title: "Old title" })
    );
    expect(needingRefresh(active, s, NOW).map((r) => r.itemId)).toEqual(["never", "edited", "older", "old"]);
  });
  it("re-reads copies saved before description text was kept", () => {
    const s = map(stored("1", { descriptionText: undefined }), stored("2"));
    expect(needingRefresh([rec("1"), rec("2")], s, NOW).map((r) => r.itemId)).toEqual(["1"]);
  });
  it("ignores listings that are not live", () => {
    expect(needingRefresh([rec("1", { status: "sold" })], map(), NOW)).toEqual([]);
  });
});

function fakeDb(rows: StoredDetails[] = [], opts: { loadError?: string; saveError?: string } = {}) {
  const upserts: unknown[][] = [];
  const data = rows.map((d) => toDetailRow("u1", d));
  const client = {
    from: () => ({
      upsert: async (batch: unknown[]) => {
        upserts.push(batch);
        return { error: opts.saveError ? { message: opts.saveError } : null };
      },
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          range: async (a: number, b: number) =>
            opts.loadError
              ? { data: null, error: { message: opts.loadError } }
              : { data: data.slice(a, b + 1), error: null },
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, upserts };
}
const okFetch = (id: string): DetailFetchResult => ({
  ok: true,
  details: { itemId: id, title: `Title ${id}`, descriptionLength: 50, pictureCount: 4, specifics: [], descriptionText: "hello", categoryName: "A:B" },
});

describe("refreshListingDetails", () => {
  it("reads only up to the per-run limit and saves what it read", async () => {
    const { client, upserts } = fakeDb();
    const calls: string[] = [];
    const r = await refreshListingDetails({
      supabase: client, userId: "u1", accessToken: "T", now: () => NOW, max: 3,
      active: ["1", "2", "3", "4", "5"].map((i) => rec(i)),
      fetcher: async (id) => { calls.push(id); return okFetch(id); },
    });
    expect(calls).toHaveLength(3);
    expect(r.fetched).toBe(3);
    expect(r.pending).toBe(2);
    expect(r.details.size).toBe(3);
    expect(upserts.flat()).toHaveLength(3);
  });

  it("does nothing when everything is fresh", async () => {
    const { client, upserts } = fakeDb([stored("1"), stored("2")]);
    const r = await refreshListingDetails({
      supabase: client, userId: "u1", accessToken: "T", now: () => NOW,
      active: [rec("1"), rec("2")],
      fetcher: async () => { throw new Error("should not be called"); },
    });
    expect(r).toMatchObject({ fetched: 0, failed: 0, pending: 0 });
    expect(r.details.size).toBe(2);
    expect(upserts).toHaveLength(0);
  });

  it("counts failures and keeps going", async () => {
    const { client } = fakeDb();
    const r = await refreshListingDetails({
      supabase: client, userId: "u1", accessToken: "T", now: () => NOW,
      active: [rec("1"), rec("2"), rec("3")], concurrency: 1,
      fetcher: async (id) => (id === "2" ? { ok: false, message: "nope", expiredToken: false } : okFetch(id)),
    });
    expect(r).toMatchObject({ fetched: 2, failed: 1, pending: 1, tokenExpired: false });
  });

  it("stops when the token has expired", async () => {
    const { client } = fakeDb();
    const calls: string[] = [];
    const r = await refreshListingDetails({
      supabase: client, userId: "u1", accessToken: "T", now: () => NOW, concurrency: 1,
      active: [rec("1"), rec("2"), rec("3")],
      fetcher: async (id) => { calls.push(id); return { ok: false, message: "932", expiredToken: true }; },
    });
    expect(calls).toEqual(["1"]);
    expect(r.tokenExpired).toBe(true);
  });

  it("returns a warning, and no details, if saved details can't be read", async () => {
    const { client } = fakeDb([], { loadError: "boom" });
    const r = await refreshListingDetails({
      supabase: client, userId: "u1", accessToken: "T", now: () => NOW,
      active: [rec("1")], fetcher: async (id) => okFetch(id),
    });
    expect(r.warning).toContain("boom");
    expect(r.details.size).toBe(0);
    expect(r.fetched).toBe(0);
  });

  it("warns, but still returns what it read, if saving fails", async () => {
    const { client } = fakeDb([], { saveError: "nope" });
    const r = await refreshListingDetails({
      supabase: client, userId: "u1", accessToken: "T", now: () => NOW,
      active: [rec("1")], fetcher: async (id) => okFetch(id),
    });
    expect(r.warning).toContain("nope");
    expect(r.details.size).toBe(1);
  });
});
