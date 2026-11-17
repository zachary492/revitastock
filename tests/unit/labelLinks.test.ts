import { describe, it, expect } from "vitest";
import {
  applyLabelLinks,
  rejectedItemIds,
  type LabelLink,
} from "../../src/lib/listings/labelLinks";
import { groupUnlabeled } from "../../src/lib/listings/needsLabel";
import { runListingRules } from "../../src/lib/audit/listingRules";
import type {
  ListingRecord,
  SellingLists,
} from "../../src/lib/ebay/sellingLists";

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

function lists(parts: Partial<SellingLists>): SellingLists {
  return { active: [], sold: [], endedUnsold: [], ...parts };
}

const confirm = (itemId: string, label: string): LabelLink => ({
  itemId,
  status: "confirmed",
  label,
});
const reject = (itemId: string): LabelLink => ({
  itemId,
  status: "rejected",
  label: null,
});

describe("applyLabelLinks", () => {
  it("gives a confirmed listing its label in all three lists", () => {
    const result = applyLabelLinks(
      lists({
        active: [rec({ itemId: "A" })],
        sold: [rec({ itemId: "S", status: "sold" })],
        endedUnsold: [rec({ itemId: "E", status: "ended_unsold" })],
      }),
      [confirm("A", "TIE-001"), confirm("S", "TIE-001"), confirm("E", "TIE-001")]
    );
    expect(result.active[0]?.sku).toBe("TIE-001");
    expect(result.sold[0]?.sku).toBe("TIE-001");
    expect(result.endedUnsold[0]?.sku).toBe("TIE-001");
  });

  it("never changes a listing that already has a label on eBay", () => {
    const result = applyLabelLinks(
      lists({ active: [rec({ itemId: "A", sku: "REAL-5" })] }),
      [confirm("A", "TIE-001")]
    );
    expect(result.active[0]?.sku).toBe("REAL-5");
  });

  it("ignores rejected answers and listings with no answer", () => {
    const result = applyLabelLinks(
      lists({ active: [rec({ itemId: "A" }), rec({ itemId: "B" })] }),
      [reject("A")]
    );
    expect(result.active.map((r) => r.sku)).toEqual([null, null]);
  });

  it("does not change the lists it was given", () => {
    const input = lists({ active: [rec({ itemId: "A" })] });
    applyLabelLinks(input, [confirm("A", "TIE-001")]);
    expect(input.active[0]?.sku).toBeNull();
  });

  it("ignores a confirmed answer with a blank label", () => {
    const result = applyLabelLinks(
      lists({ active: [rec({ itemId: "A" })] }),
      [confirm("A", "   ")]
    );
    expect(result.active[0]?.sku).toBeNull();
  });
});

describe("rejectedItemIds", () => {
  it("collects only the rejected item ids", () => {
    const ids = rejectedItemIds([confirm("A", "X-1"), reject("B"), reject("C")]);
    expect([...ids].sort()).toEqual(["B", "C"]);
  });
});

describe("groupUnlabeled with rejected items", () => {
  it("keeps a rejected listing out of a title match", () => {
    const records = [
      rec({ itemId: "A", sku: "TIE-001", title: "Purple Silk Tie Canali Italy" }),
      rec({
        itemId: "B",
        status: "ended_unsold",
        title: "Purple Silk Tie Canali Italy",
      }),
    ];
    const joined = groupUnlabeled(records);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.kind).toBe("matches_label");

    const apart = groupUnlabeled(records, { isolated: new Set(["B"]) });
    expect(apart).toHaveLength(1);
    expect(apart[0]?.kind).toBe("new_item");
    expect(apart[0]?.unlabeled.map((r) => r.itemId)).toEqual(["B"]);
  });
});

describe("confirmed labels feed the rules", () => {
  it("makes a confirmed old paid sale count against a live listing", () => {
    const raw = lists({
      active: [rec({ itemId: "A", sku: "TIE-001" })],
      sold: [
        rec({
          itemId: "S",
          status: "sold",
          soldAt: "2026-11-05T00:00:00Z",
          paid: true,
        }),
      ],
    });
    const now = new Date("2026-11-16T12:00:00Z");
    expect(runListingRules(raw, { now })).toEqual([]);

    const applied = applyLabelLinks(raw, [confirm("S", "TIE-001")]);
    const findings = runListingRules(applied, { now });
    expect(findings.map((f) => f.rule)).toEqual(["sold_but_still_active"]);
  });
});
