import { describe, it, expect } from "vitest";
import type { ListingRecord } from "../../src/lib/ebay/sellingLists";
import {
  filterListings,
  isFilter,
  normalizeLabel,
  organizeListings,
  summarize,
} from "../../src/lib/listings/organize";

function rec(overrides: Partial<ListingRecord>): ListingRecord {
  return {
    itemId: "1",
    title: "Item",
    sku: null,
    status: "active",
    listingType: "FixedPriceItem",
    quantityAvailable: 1,
    quantitySold: 0,
    price: 10,
    startTime: "2026-10-01T00:00:00.000Z",
    endTime: null,
    relisted: false,
    soldAt: null,
    paid: null,
    ...overrides,
  };
}

// The relist case: one tie, ended, then relisted under a new Item ID,
// same label. Plus a different labeled tie and two unlabeled items.
const lists = {
  active: [
    rec({ itemId: "A2", sku: "TIE-002", title: "Zegna tie" }),
    rec({ itemId: "A1-new", sku: "TIE-001", title: "Canali tie", startTime: "2026-11-08T00:00:00.000Z" }),
    rec({ itemId: "U1", sku: null, title: "Unlabeled active", startTime: "2026-10-20T00:00:00.000Z" }),
  ],
  sold: [rec({ itemId: "S1", status: "sold", sku: null, title: "Suit", soldAt: "2026-10-22T00:00:00.000Z" })],
  endedUnsold: [
    rec({ itemId: "A1-old", status: "ended_unsold", sku: "tie-001 ", title: "Canali tie", relisted: true, startTime: "2026-10-15T00:00:00.000Z" }),
    rec({ itemId: "U2", status: "ended_unsold", sku: null, title: "Old coat", startTime: "2026-09-01T00:00:00.000Z" }),
  ],
};

describe("organizeListings", () => {
  const rows = organizeListings(lists);

  it("puts labeled listings first, grouped by label", () => {
    expect(rows.slice(0, 3).map((r) => r.itemId)).toEqual([
      "A1-new",
      "A1-old",
      "A2",
    ]);
  });

  it("treats labels as the same ignoring case and spaces", () => {
    expect(normalizeLabel("tie-001 ")).toBe("TIE-001");
    const canali = rows.filter((r) => r.title === "Canali tie");
    expect(canali.map((r) => r.sameLabelCount)).toEqual([2, 2]);
  });

  it("orders each group: active, then ended, then sold; newest first", () => {
    expect(rows.slice(3).map((r) => r.itemId)).toEqual(["U1", "U2", "S1"]);
  });

  it("sorts numbered labels in number order", () => {
    const sorted = organizeListings({
      active: [
        rec({ itemId: "a", sku: "TIE-10" }),
        rec({ itemId: "b", sku: "TIE-2" }),
      ],
      sold: [],
      endedUnsold: [],
    });
    expect(sorted.map((r) => r.itemId)).toEqual(["b", "a"]);
  });

  it("gives unlabeled listings a label count of 0", () => {
    expect(rows.find((r) => r.itemId === "U1")?.sameLabelCount).toBe(0);
  });
});

describe("filterListings", () => {
  const rows = organizeListings(lists);

  it("filters by status", () => {
    expect(filterListings(rows, "active")).toHaveLength(3);
    expect(filterListings(rows, "sold")).toHaveLength(1);
    expect(filterListings(rows, "ended")).toHaveLength(2);
  });

  it("finds unlabeled listings", () => {
    expect(filterListings(rows, "unlabeled").map((r) => r.itemId)).toEqual([
      "U1",
      "U2",
      "S1",
    ]);
  });

  it("finds labels used on more than one listing (relists)", () => {
    expect(filterListings(rows, "shared").map((r) => r.itemId)).toEqual([
      "A1-new",
      "A1-old",
    ]);
  });

  it("returns everything for 'all'", () => {
    expect(filterListings(rows, "all")).toHaveLength(6);
  });

  it("only accepts known filter names", () => {
    expect(isFilter("shared")).toBe(true);
    expect(isFilter("nonsense")).toBe(false);
    expect(isFilter(undefined)).toBe(false);
  });
});

describe("summarize", () => {
  it("counts each kind", () => {
    expect(summarize(organizeListings(lists))).toEqual({
      total: 6,
      active: 3,
      sold: 1,
      endedUnsold: 2,
      labeled: 3,
      unlabeled: 3,
      sharedLabels: 1,
    });
  });
});