import { describe, it, expect } from "vitest";
import {
  findSoldButStillActive,
  findEndedNeverRelisted,
  runListingRules,
} from "../../src/lib/audit/listingRules";
import type {
  ListingRecord,
  SellingLists,
} from "../../src/lib/ebay/sellingLists";

const NOW = new Date("2026-11-16T12:00:00Z");

function rec(overrides: Partial<ListingRecord>): ListingRecord {
  return {
    itemId: "1",
    title: "Test listing",
    sku: null,
    status: "active",
    listingType: "FixedPriceItem",
    quantityAvailable: 1,
    quantitySold: 0,
    price: 10,
    startTime: "2026-10-01T00:00:00Z",
    endTime: null,
    relisted: false,
    soldAt: null,
    paid: null,
    ...overrides,
  };
}

const active = (o: Partial<ListingRecord>) => rec({ status: "active", ...o });
const sold = (o: Partial<ListingRecord>) =>
  rec({
    status: "sold",
    quantityAvailable: 0,
    quantitySold: 1,
    soldAt: "2026-11-01T00:00:00Z",
    paid: true,
    endTime: "2026-11-01T00:00:00Z",
    ...o,
  });
const ended = (o: Partial<ListingRecord>) =>
  rec({
    status: "ended_unsold",
    quantityAvailable: 1,
    endTime: "2026-10-20T00:00:00Z",
    ...o,
  });

function lists(parts: Partial<SellingLists>): SellingLists {
  return { active: [], sold: [], endedUnsold: [], ...parts };
}

describe("findSoldButStillActive", () => {
  it("flags a live listing whose label has a paid sale", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ itemId: "A", sku: "TIE-001" })],
        sold: [sold({ itemId: "S", sku: "TIE-001" })],
      }),
      { now: NOW }
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("TIE-001");
    expect(result[0]?.active.itemId).toBe("A");
    expect(result[0]?.sales[0]?.itemId).toBe("S");
  });

  it("stays quiet when the sale is unpaid (sold-unpaid then relisted)", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001" })],
        sold: [sold({ sku: "TIE-001", paid: false })],
      }),
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("stays quiet when payment status is unknown", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001" })],
        sold: [sold({ sku: "TIE-001", paid: null })],
      }),
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("skips paid sales older than 60 days", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001" })],
        sold: [sold({ sku: "TIE-001", soldAt: "2026-08-01T00:00:00Z" })],
      }),
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("ignores labels that do not match", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001" })],
        sold: [sold({ sku: "TIE-002" })],
      }),
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("ignores unlabeled listings", () => {
    const result = findSoldButStillActive(
      lists({ active: [active({})], sold: [sold({})] }),
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("matches labels ignoring spaces and capital letters", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: " tie-001 " })],
        sold: [sold({ sku: "TIE-001" })],
      }),
      { now: NOW }
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("TIE-001");
  });

  it("skips live listings with more than one in stock", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001", quantityAvailable: 3 })],
        sold: [sold({ sku: "TIE-001" })],
      }),
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("gives one finding per live listing, with all paid sales, newest first", () => {
    const result = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001" })],
        sold: [
          sold({ itemId: "S1", sku: "TIE-001", soldAt: "2026-10-20T00:00:00Z" }),
          sold({ itemId: "S2", sku: "TIE-001", soldAt: "2026-11-05T00:00:00Z" }),
        ],
      }),
      { now: NOW }
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sales.map((s) => s.itemId)).toEqual(["S2", "S1"]);
  });

  it("notes when the live listing started after the sale", () => {
    const after = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001", startTime: "2026-11-10T00:00:00Z" })],
        sold: [sold({ sku: "TIE-001", soldAt: "2026-11-01T00:00:00Z" })],
      }),
      { now: NOW }
    );
    const before = findSoldButStillActive(
      lists({
        active: [active({ sku: "TIE-001", startTime: "2026-10-01T00:00:00Z" })],
        sold: [sold({ sku: "TIE-001", soldAt: "2026-11-01T00:00:00Z" })],
      }),
      { now: NOW }
    );
    expect(after[0]?.listedAfterSale).toBe(true);
    expect(before[0]?.listedAfterSale).toBe(false);
  });
});

describe("findEndedNeverRelisted", () => {
  it("flags a labeled ended listing with no live listing, no sale, not relisted", () => {
    const result = findEndedNeverRelisted(
      lists({ endedUnsold: [ended({ itemId: "E", sku: "TIE-005" })] })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("TIE-005");
    expect(result[0]?.ended.itemId).toBe("E");
    expect(result[0]?.earlierEndedCount).toBe(0);
  });

  it("stays quiet when eBay marks the ended listing as relisted", () => {
    const result = findEndedNeverRelisted(
      lists({ endedUnsold: [ended({ sku: "TIE-005", relisted: true })] })
    );
    expect(result).toEqual([]);
  });

  it("stays quiet when the label has a live listing", () => {
    const result = findEndedNeverRelisted(
      lists({
        active: [active({ sku: "TIE-005" })],
        endedUnsold: [ended({ sku: "TIE-005" })],
      })
    );
    expect(result).toEqual([]);
  });

  it("stays quiet when the label has a sale", () => {
    const result = findEndedNeverRelisted(
      lists({
        sold: [sold({ sku: "TIE-005" })],
        endedUnsold: [ended({ sku: "TIE-005" })],
      })
    );
    expect(result).toEqual([]);
  });

  it("ignores unlabeled ended listings", () => {
    const result = findEndedNeverRelisted(
      lists({ endedUnsold: [ended({})] })
    );
    expect(result).toEqual([]);
  });

  it("looks at the most recent ended listing and counts the earlier ones", () => {
    const result = findEndedNeverRelisted(
      lists({
        endedUnsold: [
          ended({
            itemId: "E1",
            sku: "TIE-005",
            relisted: true,
            endTime: "2026-09-01T00:00:00Z",
          }),
          ended({
            itemId: "E2",
            sku: "TIE-005",
            relisted: false,
            endTime: "2026-10-15T00:00:00Z",
          }),
        ],
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.ended.itemId).toBe("E2");
    expect(result[0]?.earlierEndedCount).toBe(1);
  });

  it("stays quiet when the most recent ended listing was relisted", () => {
    const result = findEndedNeverRelisted(
      lists({
        endedUnsold: [
          ended({
            itemId: "E1",
            sku: "TIE-005",
            relisted: false,
            endTime: "2026-09-01T00:00:00Z",
          }),
          ended({
            itemId: "E2",
            sku: "TIE-005",
            relisted: true,
            endTime: "2026-10-15T00:00:00Z",
          }),
        ],
      })
    );
    expect(result).toEqual([]);
  });

  it("sorts findings by label, numbers in order", () => {
    const result = findEndedNeverRelisted(
      lists({
        endedUnsold: [
          ended({ itemId: "E10", sku: "TIE-010" }),
          ended({ itemId: "E2", sku: "TIE-002" }),
        ],
      })
    );
    expect(result.map((f) => f.label)).toEqual(["TIE-002", "TIE-010"]);
  });
});

describe("runListingRules", () => {
  it("returns findings from both rules", () => {
    const result = runListingRules(
      lists({
        active: [active({ sku: "TIE-001" })],
        sold: [sold({ sku: "TIE-001" })],
        endedUnsold: [ended({ sku: "TIE-005" })],
      }),
      { now: NOW }
    );
    expect(result.map((f) => f.rule)).toEqual([
      "sold_but_still_active",
      "ended_never_relisted",
    ]);
  });

  it("returns nothing for an empty account", () => {
    expect(runListingRules(lists({}), { now: NOW })).toEqual([]);
  });
});
