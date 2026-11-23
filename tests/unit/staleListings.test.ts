import { describe, it, expect } from "vitest";
import { findStaleListings, runListingRules } from "../../src/lib/audit/listingRules";
import { findingToRow } from "../../src/lib/audit/findingRows";
import {
  fromWatchRow,
  nextWatchStates,
  toWatchRow,
  type WatchState,
} from "../../src/lib/listings/watchState";
import { loadWatchStates, saveWatchStates } from "../../src/lib/listings/watchStore";
import type { ListingRecord, SellingLists } from "../../src/lib/ebay/sellingLists";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOW = new Date("2026-11-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function rec(o: Partial<ListingRecord>): ListingRecord {
  return {
    itemId: "100000000001",
    title: "Blue Tie",
    sku: "TIE-001",
    status: "active",
    listingType: "FixedPriceItem",
    quantityAvailable: 1,
    quantitySold: 0,
    price: 10,
    startTime: daysAgo(120),
    endTime: null,
    relisted: false,
    soldAt: null,
    paid: null,
    watchCount: 0,
    ...o,
  };
}
const lists = (o: Partial<SellingLists>): SellingLists => ({
  active: [],
  sold: [],
  endedUnsold: [],
  ...o,
});
const state = (itemId: string, o: Partial<WatchState> = {}): WatchState => ({
  itemId,
  firstSeenAt: daysAgo(10),
  lastWatchedAt: null,
  lastWatchCount: 0,
  lastSeenAt: daysAgo(0),
  ...o,
});
const states = (...s: WatchState[]) => new Map(s.map((x) => [x.itemId, x]));

describe("findStaleListings", () => {
  it("flags an old listing with no watchers", () => {
    const l = lists({ active: [rec({})] });
    const f = findStaleListings(l, { now: NOW, watchStates: states(state("100000000001")) });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: "stale_listing", label: "TIE-001", listedDays: 120 });
    expect(f[0]?.lastWatchedAt).toBeNull();
  });

  it("does nothing without watcher memory", () => {
    expect(findStaleListings(lists({ active: [rec({})] }), { now: NOW })).toEqual([]);
  });

  it("skips listings younger than 90 days or with no start date", () => {
    const l = lists({
      active: [
        rec({ itemId: "1", startTime: daysAgo(89) }),
        rec({ itemId: "2", startTime: null }),
        rec({ itemId: "3", startTime: daysAgo(90) }),
      ],
    });
    const f = findStaleListings(l, {
      now: NOW,
      watchStates: states(state("1"), state("2"), state("3")),
    });
    expect(f.map((x) => x.listing.itemId)).toEqual(["3"]);
  });

  it("skips a listing that has a watcher now", () => {
    const l = lists({ active: [rec({ watchCount: 2 })] });
    expect(findStaleListings(l, { now: NOW, watchStates: states(state("100000000001")) })).toEqual([]);
  });

  it("skips one that had a watcher within 90 days, but not an older one", () => {
    const l = lists({ active: [rec({})] });
    const recent = states(state("100000000001", { lastWatchedAt: daysAgo(30) }));
    const old = states(state("100000000001", { lastWatchedAt: daysAgo(200) }));
    expect(findStaleListings(l, { now: NOW, watchStates: recent })).toEqual([]);
    expect(findStaleListings(l, { now: NOW, watchStates: old })).toHaveLength(1);
  });

  it("skips listings we have no memory of", () => {
    expect(
      findStaleListings(lists({ active: [rec({})] }), { now: NOW, watchStates: states() })
    ).toEqual([]);
  });

  it("skips a label that sold in the last 90 days, ignoring case and spaces", () => {
    const sale = rec({ itemId: "9", status: "sold", sku: " tie-001 ", soldAt: daysAgo(20), paid: true });
    const l = lists({ active: [rec({})], sold: [sale] });
    expect(findStaleListings(l, { now: NOW, watchStates: states(state("100000000001")) })).toEqual([]);
    const oldSale = { ...sale, soldAt: daysAgo(200) };
    expect(
      findStaleListings(lists({ active: [rec({})], sold: [oldSale] }), {
        now: NOW,
        watchStates: states(state("100000000001")),
      })
    ).toHaveLength(1);
  });

  it("works for unlabeled listings and sorts oldest first", () => {
    const l = lists({
      active: [
        rec({ itemId: "1", sku: null, startTime: daysAgo(100) }),
        rec({ itemId: "2", sku: "B-1", startTime: daysAgo(300) }),
      ],
    });
    const f = findStaleListings(l, { now: NOW, watchStates: states(state("1"), state("2")) });
    expect(f.map((x) => x.listing.itemId)).toEqual(["2", "1"]);
    expect(f[1]?.label).toBeNull();
  });

  it("respects a custom number of days", () => {
    const l = lists({ active: [rec({ startTime: daysAgo(40) })] });
    expect(
      findStaleListings(l, { now: NOW, staleDays: 30, watchStates: states(state("100000000001")) })
    ).toHaveLength(1);
  });

  it("is included in runListingRules", () => {
    const l = lists({ active: [rec({})] });
    const f = runListingRules(l, { now: NOW, watchStates: states(state("100000000001")) });
    expect(f.map((x) => x.rule)).toContain("stale_listing");
  });
});

describe("findingToRow for stale listings", () => {
  it("builds a row, using a placeholder when there is no label", () => {
    const l = lists({ active: [rec({ sku: null })] });
    const [f] = findStaleListings(l, { now: NOW, watchStates: states(state("100000000001")) });
    const row = findingToRow(f!);
    expect(row.sku).toBe("(no label)");
    expect(row.type).toBe("stale_listing");
    expect(row.listing_id).toBe("100000000001");
    expect(row.details).toMatchObject({ title: "Blue Tie", listedDays: 120 });
  });
});

describe("nextWatchStates", () => {
  it("starts tracking a new listing", () => {
    const [s] = nextWatchStates(new Map(), [rec({ watchCount: 0 })], NOW);
    expect(s).toEqual({
      itemId: "100000000001",
      firstSeenAt: NOW.toISOString(),
      lastWatchedAt: null,
      lastWatchCount: 0,
      lastSeenAt: NOW.toISOString(),
    });
  });
  it("records a watcher and keeps it when the count drops back to zero", () => {
    const first = nextWatchStates(new Map(), [rec({ watchCount: 3 })], new Date(daysAgo(10)));
    expect(first[0]?.lastWatchedAt).toBe(daysAgo(10));
    const later = nextWatchStates(states(first[0]!), [rec({ watchCount: 0 })], NOW);
    expect(later[0]?.lastWatchedAt).toBe(daysAgo(10));
    expect(later[0]?.firstSeenAt).toBe(daysAgo(10));
    expect(later[0]?.lastSeenAt).toBe(NOW.toISOString());
  });
  it("ignores sold and ended listings and a missing count", () => {
    const out = nextWatchStates(
      new Map(),
      [rec({ itemId: "1", status: "sold" }), rec({ itemId: "2", status: "ended_unsold" }), rec({ itemId: "3", watchCount: undefined })],
      NOW
    );
    expect(out.map((s) => s.itemId)).toEqual(["3"]);
    expect(out[0]?.lastWatchCount).toBe(0);
  });
  it("round-trips through a database row", () => {
    const s = state("5", { lastWatchedAt: daysAgo(3), lastWatchCount: 2 });
    const row = toWatchRow("u1", s);
    expect(row.user_id).toBe("u1");
    expect(fromWatchRow(row)).toEqual(s);
  });
});

function fakeWatchDb(stored: WatchState[], opts: { error?: string } = {}) {
  const upserts: unknown[][] = [];
  const rows = stored.map((s) => ({
    item_id: s.itemId,
    first_seen_at: s.firstSeenAt,
    last_watched_at: s.lastWatchedAt,
    last_watch_count: s.lastWatchCount,
    last_seen_at: s.lastSeenAt,
  }));
  const client = {
    from: () => ({
      upsert: async (batch: unknown[]) => {
        upserts.push(batch);
        return { error: opts.error ? { message: opts.error } : null };
      },
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          range: async (from: number, to: number) =>
            opts.error
              ? { data: null, error: { message: opts.error } }
              : { data: rows.slice(from, to + 1), error: null },
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, upserts };
}

describe("watch store", () => {
  it("loads more than one page", async () => {
    const many = Array.from({ length: 2100 }, (_, i) => state(String(100000 + i)));
    const { client } = fakeWatchDb(many);
    const r = await loadWatchStates(client, "u1");
    expect(r.states.size).toBe(2100);
  });
  it("saves in batches and reports errors", async () => {
    const many = Array.from({ length: 1200 }, (_, i) => state(String(100000 + i)));
    const ok = fakeWatchDb([]);
    expect(await saveWatchStates(ok.client, "u1", many)).toEqual({});
    expect(ok.upserts.map((u) => u.length)).toEqual([500, 500, 200]);
    const bad = fakeWatchDb([], { error: "nope" });
    expect((await saveWatchStates(bad.client, "u1", many)).error).toBe("nope");
    expect((await loadWatchStates(bad.client, "u1")).error).toBe("nope");
  });
});
