import { describe, it, expect } from "vitest";
import {
  titleTokens,
  compareTitles,
  groupUnlabeled,
} from "../../src/lib/listings/needsLabel";
import type { ListingRecord } from "../../src/lib/ebay/sellingLists";

let counter = 0;
function rec(overrides: Partial<ListingRecord>): ListingRecord {
  counter += 1;
  return {
    itemId: String(counter),
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

describe("titleTokens", () => {
  it("removes emoji, prices, punctuation and sales talk", () => {
    const tokens = titleTokens(
      "🔥 Pristine! 🔥 BURBERRY's Navy Suit 46R* $275 💯"
    );
    expect([...tokens].sort()).toEqual(["46r", "burberrys", "navy", "suit"]);
  });

  it("handles a title that is only emoji", () => {
    expect(titleTokens("🔥🔥").size).toBe(0);
  });
});

describe("compareTitles", () => {
  const t = titleTokens;

  it("calls titles the same when only price, emoji and sales talk change", () => {
    expect(
      compareTitles(
        t("Extra Nice CANALI made in Italy Purple Silk Neck Tie $250"),
        t("🔥 Fabulous! 🔥 CANALI made in Italy Purple Silk Neck Tie $80")
      )
    ).toBe("same");
  });

  it("calls titles likely when one extra word was added", () => {
    expect(
      compareTitles(
        t("CANALI made Italy Purple Silk Neck Tie"),
        t("CANALI made Italy Purple Silk Neck Tie Vintage")
      )
    ).toBe("likely");
  });

  it("never matches different numbers (sizes like 46R vs 48R)", () => {
    expect(
      compareTitles(
        t("Navy Wool Sport Coat 46R Brooks Brothers"),
        t("Navy Wool Sport Coat 48R Brooks Brothers")
      )
    ).toBeNull();
  });

  it("never matches different letter sizes", () => {
    expect(
      compareTitles(
        t("Blue Cotton Whale Shirt XL Button Down Collar"),
        t("Blue Cotton Whale Shirt M Button Down Collar")
      )
    ).toBeNull();
  });

  it("does not match unrelated titles", () => {
    expect(
      compareTitles(t("Red Silk Neck Tie"), t("Navy Wool Blazer 40R"))
    ).toBeNull();
  });

  it("does not match empty titles", () => {
    expect(compareTitles(new Set(), new Set(["tie"]))).toBeNull();
  });
});

describe("groupUnlabeled", () => {
  it("suggests an existing label for an unlabeled copy of a labeled item", () => {
    const groups = groupUnlabeled([
      rec({ sku: "TIE-001", title: "Purple Silk Tie Canali Italy $80" }),
      rec({
        status: "ended_unsold",
        endTime: "2026-10-01T00:00:00Z",
        title: "Extra Nice Purple Silk Tie Canali Italy $250",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("matches_label");
    expect(groups[0]?.suggestedLabel).toBe("TIE-001");
    expect(groups[0]?.confidence).toBe("same");
    expect(groups[0]?.unlabeled).toHaveLength(1);
    expect(groups[0]?.labeled).toHaveLength(1);
  });

  it("groups unlabeled relists of the same item that have no label yet", () => {
    const groups = groupUnlabeled([
      rec({ status: "ended_unsold", title: "Gray Wool Blazer 40R" }),
      rec({ status: "ended_unsold", title: "Pristine! Gray Wool Blazer 40R $99" }),
      rec({ status: "active", title: "Gray Wool Blazer 40R $120" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("new_item");
    expect(groups[0]?.suggestedLabel).toBeNull();
    expect(groups[0]?.unlabeled).toHaveLength(3);
    expect(groups[0]?.liveCount).toBe(1);
  });

  it("does not show a group when every listing already has a label", () => {
    const groups = groupUnlabeled([
      rec({ sku: "TIE-001", title: "Purple Silk Tie" }),
      rec({ sku: "TIE-001", title: "Purple Silk Tie" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("flags a conflict when one item matches two different labels by title", () => {
    const groups = groupUnlabeled([
      rec({ sku: "TIE-001", title: "Purple Silk Tie Canali Italy" }),
      rec({ sku: "TIE-009", title: "Purple Silk Tie Canali Italy" }),
      rec({ title: "Purple Silk Tie Canali Italy", status: "ended_unsold" }),
    ]);
    // Two labels never merge by title, but the unlabeled copy links to both.
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("conflict");
    expect(groups[0]?.suggestedLabel).toBeNull();
  });

  it("keeps different labeled items apart", () => {
    const groups = groupUnlabeled([
      rec({ sku: "TIE-001", title: "Purple Silk Tie Canali Italy" }),
      rec({ sku: "TIE-002", title: "Purple Silk Tie Canali Italy" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("treats labels as equal ignoring spaces and capital letters", () => {
    const groups = groupUnlabeled([
      rec({ sku: "tie-001 ", title: "Purple Silk Tie Canali Italy" }),
      rec({ sku: "TIE-001", title: "Totally Different Title Here" }),
      rec({ title: "Totally Different Title Here", status: "ended_unsold" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("matches_label");
    expect(groups[0]?.suggestedLabel).toBe("TIE-001");
  });

  it("marks a group as likely when a close but not identical title joined it", () => {
    const groups = groupUnlabeled([
      rec({ sku: "TIE-001", title: "CANALI made Italy Purple Silk Neck Tie" }),
      rec({
        status: "ended_unsold",
        title: "CANALI made Italy Purple Silk Neck Tie Vintage",
      }),
    ]);
    expect(groups[0]?.confidence).toBe("likely");
  });

  it("gives a lone unlabeled listing its own group", () => {
    const groups = groupUnlabeled([rec({ title: "Unique Item Alpha" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("new_item");
    expect(groups[0]?.unlabeled).toHaveLength(1);
  });

  it("orders matches first, then conflicts, then live items, then the rest", () => {
    const groups = groupUnlabeled([
      rec({ title: "Old Ended Thing Alpha", status: "ended_unsold" }),
      rec({ title: "Live Unlabeled Thing Beta", status: "active" }),
      rec({ sku: "SC-001", title: "Sport Coat Gamma 42R" }),
      rec({ title: "Sport Coat Gamma 42R", status: "ended_unsold" }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual([
      "matches_label",
      "new_item",
      "new_item",
    ]);
    expect(groups[1]?.liveCount).toBe(1);
    expect(groups[2]?.liveCount).toBe(0);
  });

  it("returns nothing for no listings", () => {
    expect(groupUnlabeled([])).toEqual([]);
  });
});