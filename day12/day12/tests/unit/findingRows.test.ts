import { describe, it, expect } from "vitest";
import { findingToRow } from "../../src/lib/audit/findingRows";
import type { Finding } from "../../src/lib/audit/listingRules";
import type { ListingRecord } from "../../src/lib/ebay/sellingLists";

function rec(overrides: Partial<ListingRecord>): ListingRecord {
  return {
    itemId: "1",
    title: "Test listing",
    sku: "TIE-001",
    status: "active",
    listingType: "FixedPriceItem",
    quantityAvailable: 1,
    quantitySold: 0,
    price: 25,
    startTime: "2026-10-01T00:00:00Z",
    endTime: null,
    relisted: false,
    soldAt: null,
    paid: null,
    ...overrides,
  };
}

describe("findingToRow", () => {
  it("turns a sold-but-still-active finding into a table row", () => {
    const finding: Finding = {
      rule: "sold_but_still_active",
      label: "TIE-001",
      active: rec({ itemId: "A", title: "Live tie" }),
      sales: [
        rec({ itemId: "S2", status: "sold", soldAt: "2026-11-05T00:00:00Z" }),
        rec({ itemId: "S1", status: "sold", soldAt: "2026-10-20T00:00:00Z" }),
      ],
      listedAfterSale: true,
    };
    const row = findingToRow(finding);
    expect(row.sku).toBe("TIE-001");
    expect(row.type).toBe("sold_but_still_active");
    expect(row.physical_quantity).toBeNull();
    expect(row.live_quantity).toBe(1);
    expect(row.listing_id).toBe("A");
    expect(row.details).toEqual({
      title: "Live tie",
      price: 25,
      saleDates: ["2026-11-05T00:00:00Z", "2026-10-20T00:00:00Z"],
      saleItemIds: ["S2", "S1"],
      listedAfterSale: true,
    });
  });

  it("turns an ended-never-relisted finding into a table row", () => {
    const finding: Finding = {
      rule: "ended_never_relisted",
      label: "TIE-005",
      ended: rec({
        itemId: "E",
        status: "ended_unsold",
        title: "Ended tie",
        endTime: "2026-10-20T00:00:00Z",
      }),
      earlierEndedCount: 2,
    };
    const row = findingToRow(finding);
    expect(row.type).toBe("ended_never_relisted");
    expect(row.live_quantity).toBe(0);
    expect(row.listing_id).toBe("E");
    expect(row.details).toEqual({
      title: "Ended tie",
      price: 25,
      endedAt: "2026-10-20T00:00:00Z",
      earlierEndedCount: 2,
    });
  });
});

describe("findingToRow for listing quality", () => {
  it("builds a row with the problems, using a placeholder when unlabeled", async () => {
    const { findingToRow } = await import("../../src/lib/audit/findingRows");
    const row = findingToRow({
      rule: "listing_quality",
      label: null,
      listing: {
        itemId: "100000000001", title: "Blazer", sku: null, status: "active", listingType: "FixedPriceItem",
        quantityAvailable: 1, quantitySold: 0, price: 20, startTime: null, endTime: null,
        relisted: false, soldAt: null, paid: null,
      },
      problems: ["The description is empty."],
    });
    expect(row.sku).toBe("(no label)");
    expect(row.type).toBe("listing_quality");
    expect(row.listing_id).toBe("100000000001");
    expect(row.details).toMatchObject({ title: "Blazer", problems: ["The description is empty."] });
  });
});
