import { describe, it, expect } from "vitest";
import { findQualityIssues, qualityProblems } from "../../src/lib/audit/qualityRules";
import type { ItemDetails } from "../../src/lib/ebay/itemDetails";
import type { ListingRecord } from "../../src/lib/ebay/sellingLists";

const good = (o: Partial<ItemDetails> = {}): ItemDetails => ({
  itemId: "100000000001",
  title: "Brooks Brothers Blazer 46R Navy",
  descriptionLength: 300,
  pictureCount: 8,
  specifics: [
    { name: "Brand", values: ["Brooks Brothers"] },
    { name: "Size", values: ["46 Regular"] },
    { name: "Color", values: ["Navy"] },
  ],
  ...o,
});

function rec(o: Partial<ListingRecord> = {}): ListingRecord {
  return {
    itemId: "100000000001", title: "T", sku: "BLA-001", status: "active",
    listingType: "FixedPriceItem", quantityAvailable: 1, quantitySold: 0, price: 10,
    startTime: null, endTime: null, relisted: false, soldAt: null, paid: null, ...o,
  };
}

describe("qualityProblems", () => {
  it("finds nothing wrong with a good listing", () => {
    expect(qualityProblems(good())).toEqual([]);
  });
  it("catches the 46R vs 46L mistake", () => {
    const p = qualityProblems(good({ specifics: [
      { name: "Brand", values: ["B"] }, { name: "Size", values: ["46 Long"] }, { name: "Color", values: ["Navy"] },
    ] }));
    expect(p).toEqual(["The title says 46R, but the Size in the item specifics says 46L."]);
  });
  it("uses only specifics named Size, not Size Type", () => {
    const p = qualityProblems(good({ specifics: [
      { name: "Brand", values: ["B"] }, { name: "Size Type", values: ["Large"] }, { name: "Color", values: ["Navy"] },
    ] }));
    expect(p).toEqual([]);
  });
  it("flags missing, few and blank item specifics", () => {
    expect(qualityProblems(good({ specifics: [] }))).toContain("No item specifics are filled in.");
    expect(qualityProblems(good({ specifics: [{ name: "Brand", values: ["B"] }] }))).toContain("Only 1 item specific is filled in.");
    const blank = qualityProblems(good({ specifics: [
      { name: "Brand", values: ["B"] }, { name: "Size", values: ["46R"] }, { name: "Color", values: ["Navy"] },
      { name: "Material", values: [] }, { name: "Pattern", values: [] },
    ] }));
    expect(blank).toEqual(["These item specifics are blank: Material, Pattern."]);
  });
  it("flags empty and very short descriptions", () => {
    expect(qualityProblems(good({ descriptionLength: 0 }))).toEqual(["The description is empty."]);
    expect(qualityProblems(good({ descriptionLength: 12 }))).toEqual(["The description is very short."]);
    expect(qualityProblems(good({ descriptionLength: 40 }))).toEqual([]);
  });
  it("flags too few photos", () => {
    expect(qualityProblems(good({ pictureCount: 0 }))).toEqual(["The listing has no photos."]);
    expect(qualityProblems(good({ pictureCount: 1 }))).toEqual(["It has only 1 photo (RevitaSync suggests at least 3)."]);
    expect(qualityProblems(good({ pictureCount: 3 }))).toEqual([]);
  });
  it("lists several problems together", () => {
    expect(qualityProblems(good({ descriptionLength: 0, pictureCount: 1 }))).toHaveLength(2);
  });
});

describe("findQualityIssues", () => {
  it("only checks live listings that have details, worst first", () => {
    const active = [
      rec({ itemId: "1", sku: "B-1" }),
      rec({ itemId: "2", sku: "A-1" }),
      rec({ itemId: "3", sku: null }),
      rec({ itemId: "4", status: "ended_unsold" }),
      rec({ itemId: "5" }),
    ];
    const details = new Map<string, ItemDetails>([
      ["1", good({ itemId: "1", descriptionLength: 0 })],
      ["2", good({ itemId: "2", descriptionLength: 0, pictureCount: 1 })],
      ["3", good({ itemId: "3", pictureCount: 0 })],
      ["4", good({ itemId: "4", pictureCount: 0 })],
    ]);
    const issues = findQualityIssues(active, details);
    expect(issues.map((i) => i.listing.itemId)).toEqual(["2", "1", "3"]);
    expect(issues[2]?.label).toBeNull();
  });
});

describe("size split across Size and Jacket/Coat Length", () => {
  const base = { itemId: "1", descriptionLength: 200, pictureCount: 6 };
  const spec = (size: string, length?: string, fit?: string) => [
    { name: "Brand", values: ["X"] }, { name: "Color", values: ["Navy"] },
    { name: "Size", values: [size] },
    ...(length ? [{ name: "Jacket/Coat Length", values: [length] }] : []),
    ...(fit ? [{ name: "Size Type", values: [fit] }] : []),
  ];
  it("accepts 42L when Size is 42, Length is Long and Size Type is Regular (a fit)", () => {
    expect(qualityProblems({ ...base, title: "Suit 42L", specifics: spec("42", "Long", "Regular") })).toEqual([]);
  });
  it("flags the length when it differs", () => {
    const p = qualityProblems({ ...base, title: "Suit 42L", specifics: spec("42", "Regular", "Regular") });
    expect(p.join(" ")).toMatch(/42L.*42R/);
  });
  it("flags the chest number when it differs", () => {
    const p = qualityProblems({ ...base, title: "Suit 46R", specifics: spec("44", "Regular") });
    expect(p.join(" ")).toMatch(/46R.*44R/);
  });
  it("ignores Size Type completely, and compares chest only when no length is given", () => {
    expect(qualityProblems({ ...base, title: "Suit 42L", specifics: spec("42", undefined, "Regular") })).toEqual([]);
    const p = qualityProblems({ ...base, title: "Suit 46R", specifics: spec("44", undefined, "Slim") });
    expect(p.join(" ")).toMatch(/46R.*44/);
  });
});
