import { describe, it, expect } from "vitest";
import { findSizeConflict, sizesInTitle, sizesInValues } from "../../src/lib/listings/sizes";

const arr = (s: Set<string>) => [...s].sort();

describe("sizesInTitle", () => {
  it("reads a letter size", () => {
    expect(arr(sizesInTitle("VINEYARD VINES Blue Cotton Whale Shirt XL Button Down").letters)).toEqual(["XL"]);
  });
  it("reads jacket sizes and does not also read them as letters", () => {
    const s = sizesInTitle("*Pristine* CHAPS Ralph Lauren Wool Navy Blazer 44R");
    expect(arr(s.jackets)).toEqual(["44R"]);
    expect(arr(s.letters)).toEqual([]);
    expect(arr(sizesInTitle("Hart Schaffner Marx Sport Coat 46L Gray").jackets)).toEqual(["46L"]);
  });
  it("ignores L/S and S/S sleeve markers", () => {
    expect(arr(sizesInTitle("Polo Ralph Lauren L/S Shirt M").letters)).toEqual(["M"]);
    expect(arr(sizesInTitle("Tommy Hilfiger S/S Shirt").letters)).toEqual([]);
  });
  it("needs capital letters for single-letter sizes", () => {
    expect(arr(sizesInTitle("blue m shirt").letters)).toEqual([]);
    expect(arr(sizesInTitle("Blue Shirt M").letters)).toEqual(["M"]);
  });
  it("does not read decades or other numbers as jacket sizes", () => {
    expect(arr(sizesInTitle("VINTAGE 80S Wool Blazer").jackets)).toEqual([]);
    expect(arr(sizesInTitle("Lot of 12S Items").jackets)).toEqual([]);
    expect(arr(sizesInTitle("Navy Blazer 44 Regular").jackets)).toEqual(["44R"]);
  });
  it("reads size ranges and spelled-out sizes", () => {
    expect(arr(sizesInTitle("Fleece Vest M/L").letters)).toEqual(["L", "M"]);
    expect(arr(sizesInTitle("Wool Sweater X-Large Gray").letters)).toEqual(["XL"]);
    expect(arr(sizesInTitle("Silk Tie 3.5 inch Navy").letters)).toEqual([]);
  });
  it("does not read letters inside words or numbers", () => {
    expect(arr(sizesInTitle("Stafford Slim Fit Shirt 16.5 34/35").letters)).toEqual([]);
  });
});

describe("sizesInValues", () => {
  it("understands words", () => {
    expect(arr(sizesInValues(["Large"]).letters)).toEqual(["L"]);
    expect(arr(sizesInValues(["X-Large"]).letters)).toEqual(["XL"]);
    expect(arr(sizesInValues(["Extra Large"]).letters)).toEqual(["XL"]);
    expect(arr(sizesInValues(["XX-Large"]).letters)).toEqual(["XXL"]);
    expect(arr(sizesInValues(["2XL"]).letters)).toEqual(["XXL"]);
    expect(arr(sizesInValues(["Medium", "Large"]).letters)).toEqual(["L", "M"]);
  });
  it("understands jacket sizes in several forms", () => {
    expect(arr(sizesInValues(["44 Regular"]).jackets)).toEqual(["44R"]);
    expect(arr(sizesInValues(["44R"]).jackets)).toEqual(["44R"]);
    expect(arr(sizesInValues(["46 Long"]).jackets)).toEqual(["46L"]);
    expect(arr(sizesInValues(["42 Short"]).jackets)).toEqual(["42S"]);
  });
  it("ignores decades in values too", () => {
    expect(arr(sizesInValues(["80S"]).jackets)).toEqual([]);
  });
  it("ignores things that aren't sizes", () => {
    const s = sizesInValues(["Regular", "Navy", "Wool"]);
    expect(s.letters.size + s.jackets.size).toBe(0);
  });
});

describe("findSizeConflict", () => {
  it("catches 46R in the title vs 46L in the specifics", () => {
    expect(findSizeConflict("Brooks Brothers Blazer 46R Navy", ["46L"])).toEqual({
      titleSize: "46R",
      specificsSize: "46L",
    });
  });
  it("catches a letter mismatch", () => {
    expect(findSizeConflict("Polo Shirt XL Blue", ["Large"])).toEqual({
      titleSize: "XL",
      specificsSize: "L",
    });
  });
  it("accepts matches in different wording", () => {
    expect(findSizeConflict("Polo Shirt XL Blue", ["X-Large"])).toBeNull();
    expect(findSizeConflict("Blazer 44R", ["44 Regular"])).toBeNull();
    expect(findSizeConflict("Vest M/L", ["Large"])).toBeNull();
  });
  it("stays quiet when either side has no recognizable size", () => {
    expect(findSizeConflict("Silk Tie Navy", ["Large"])).toBeNull();
    expect(findSizeConflict("Polo Shirt XL", [])).toBeNull();
    expect(findSizeConflict("Polo Shirt XL", ["One Size"])).toBeNull();
    expect(findSizeConflict("Blazer 44R", ["Large"])).toBeNull();
  });
});
