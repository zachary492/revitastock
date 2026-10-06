import { describe, it, expect } from "vitest";
import {
  classify,
  findDiscrepancies,
} from "../../src/lib/matching/findDiscrepancies";
import { mockLiveListings } from "../../src/lib/ebay/mockListings";
import type {
  LiveListing,
  PhysicalInventoryRecord,
} from "../../src/types/inventory";

describe("classify", () => {
  it("flags a ghost listing: nothing on the shelf, but listing is live", () => {
    expect(classify(0, 1)).toBe("ghost_listing");
  });

  it("flags a phantom drop: stock on the shelf, but listing shows zero", () => {
    expect(classify(1, 0)).toBe("phantom_drop");
  });

  it("flags a quantity mismatch: both have stock, but numbers differ", () => {
    expect(classify(2, 5)).toBe("quantity_mismatch");
  });

  it("returns null when shelf and listing agree", () => {
    expect(classify(1, 1)).toBeNull();
    expect(classify(0, 0)).toBeNull();
  });
});

describe("findDiscrepancies", () => {
  // Same four valid rows as sample-inventory-test.csv from Day 6.
  const sampleInventory: PhysicalInventoryRecord[] = [
    { sku: "KAW-CARB-001", quantity: 0, title: "Kawasaki carburetor" },
    { sku: "LEV-JKT-VTG", quantity: 1, title: "Vintage trucker jacket" },
    { sku: "HON-ALT-98", quantity: 1, title: "1998 Civic alternator" },
    { sku: "CER-BOWL-SET", quantity: 0, title: "Ceramic bowl set" },
  ];

  it("finds the right problems in the sample inventory vs. mock listings", () => {
    const result = findDiscrepancies(sampleInventory, mockLiveListings);

    expect(result.discrepancies).toEqual([
      {
        sku: "KAW-CARB-001",
        type: "ghost_listing",
        physicalQuantity: 0,
        liveQuantity: 1,
        listingId: "ebay-mock-1001",
      },
      {
        sku: "LEV-JKT-VTG",
        type: "phantom_drop",
        physicalQuantity: 1,
        liveQuantity: 0,
        listingId: "ebay-mock-1002",
      },
    ]);

    expect(result.inSync.map((i) => i.sku)).toEqual([
      "HON-ALT-98",
      "CER-BOWL-SET",
    ]);
    expect(result.unlistedInventory).toEqual([]);
    expect(result.unknownListings.map((l) => l.sku)).toEqual([
      "UNKNOWN-SKU-999",
    ]);
  });

  it("matches SKUs regardless of letter case or stray spaces", () => {
    const physical: PhysicalInventoryRecord[] = [
      { sku: "  kaw-carb-001 ", quantity: 0 },
    ];
    const live: LiveListing[] = [
      {
        sku: "KAW-CARB-001",
        listingId: "L1",
        quantity: 1,
        title: "Carb",
        active: true,
      },
    ];

    const result = findDiscrepancies(physical, live);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]?.type).toBe("ghost_listing");
    expect(result.unlistedInventory).toEqual([]);
    expect(result.unknownListings).toEqual([]);
  });

  it("reports shelf items that have no eBay listing at all", () => {
    const physical: PhysicalInventoryRecord[] = [
      { sku: "NOT-LISTED-1", quantity: 3 },
    ];
    const result = findDiscrepancies(physical, []);

    expect(result.unlistedInventory).toEqual(physical);
    expect(result.discrepancies).toEqual([]);
  });

  it("reports a quantity mismatch when both sides have stock but differ", () => {
    const physical: PhysicalInventoryRecord[] = [{ sku: "A", quantity: 2 }];
    const live: LiveListing[] = [
      { sku: "A", listingId: "L2", quantity: 5, title: "A", active: true },
    ];

    const result = findDiscrepancies(physical, live);
    expect(result.discrepancies[0]?.type).toBe("quantity_mismatch");
    expect(result.discrepancies[0]?.physicalQuantity).toBe(2);
    expect(result.discrepancies[0]?.liveQuantity).toBe(5);
  });

  it("treats an ended (inactive) listing as zero available", () => {
    const live: LiveListing[] = [
      { sku: "A", listingId: "L3", quantity: 3, title: "A", active: false },
    ];

    // Nothing on the shelf + ended listing = nothing wrong.
    const noStock = findDiscrepancies([{ sku: "A", quantity: 0 }], live);
    expect(noStock.discrepancies).toEqual([]);
    expect(noStock.inSync).toHaveLength(1);

    // Stock on the shelf + ended listing = buyers can't buy it.
    const hasStock = findDiscrepancies([{ sku: "A", quantity: 1 }], live);
    expect(hasStock.discrepancies[0]?.type).toBe("phantom_drop");
  });

  it("does not report the same item twice when a SKU is duplicated", () => {
    const physical: PhysicalInventoryRecord[] = [
      { sku: "DUP", quantity: 0 },
      { sku: "DUP", quantity: 0 },
    ];
    const live: LiveListing[] = [
      { sku: "DUP", listingId: "L4", quantity: 1, title: "Dup", active: true },
    ];

    const result = findDiscrepancies(physical, live);
    expect(result.discrepancies).toHaveLength(1);
  });
});
