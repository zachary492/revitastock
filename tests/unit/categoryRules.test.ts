import { describe, it, expect } from "vitest";
import {
  hasEnoughMeasurements, isTailoredCategory, leafCategory, measurementsMentioned, missingPhrases,
} from "../../src/lib/audit/categoryRules";
import { cleanDisabled, normalizePhrases, readSettingsRow } from "../../src/lib/audit/checkSettings";
import { qualityProblems } from "../../src/lib/audit/qualityRules";

describe("category helpers", () => {
  it("recognizes tailored categories by path", () => {
    expect(isTailoredCategory("Clothing, Shoes & Accessories:Men's Clothing:Suits & Suit Separates")).toBe(true);
    expect(isTailoredCategory("Clothing, Shoes & Accessories:Men:Coats, Jackets & Vests")).toBe(true);
    expect(isTailoredCategory("Clothing, Shoes & Accessories:Men's Accessories:Ties")).toBe(false);
    expect(isTailoredCategory("Clothing, Shoes & Accessories:Men's Shoes")).toBe(false);
    expect(isTailoredCategory(null)).toBe(false);
  });
  it("gives the last part of a path", () => {
    expect(leafCategory("A:B:Blazers & Sport Coats")).toBe("Blazers & Sport Coats");
    expect(leafCategory(undefined)).toBeNull();
  });
});

describe("measurements", () => {
  it("finds common wordings, number before or after", () => {
    const f = measurementsMentioned('Pit to pit: 22" Shoulders 18.5 in. Sleeve - 25 Length 30');
    expect([...f].sort()).toEqual(["chest", "length", "shoulders", "sleeve"]);
    expect(measurementsMentioned("22 inches pit-to-pit, 30 in length").has("chest")).toBe(true);
    expect(measurementsMentioned("p2p 21").has("chest")).toBe(true);
  });
  it("needs two kinds with numbers", () => {
    expect(hasEnoughMeasurements("Measurements: pit to pit 22, length 30")).toBe(true);
    expect(hasEnoughMeasurements("Great jacket. Length 30 only.")).toBe(false);
    expect(hasEnoughMeasurements("See photos for the measurements. Great shoulders and sleeve")).toBe(false);
    expect(hasEnoughMeasurements("")).toBe(false);
  });
  it("finds missing phrases, ignoring case and spacing", () => {
    expect(missingPhrases("Smoke-Free  home. Flaws noted.", ["smoke-free", "flaws noted", "measurements"])).toEqual(["measurements"]);
    expect(missingPhrases("x", [])).toEqual([]);
  });
});

describe("seller settings", () => {
  it("normalizes typed phrases", () => {
    expect(normalizePhrases(" Smoke-free ,\nflaws noted\n\nSMOKE-FREE\n")).toEqual(["Smoke-free", "flaws noted"]);
    expect(normalizePhrases("x".repeat(100))[0]).toHaveLength(60);
    expect(normalizePhrases(Array.from({ length: 30 }, (_, i) => `p${i}`).join("\n"))).toHaveLength(20);
  });
  it("keeps only known check ids", () => {
    expect(cleanDisabled(["photos", "nope", 5, "photos"])).toEqual(["photos"]);
    expect(cleanDisabled("photos")).toEqual([]);
  });
  it("reads a saved row defensively", () => {
    expect(readSettingsRow(null)).toEqual({ disabledChecks: [], requiredPhrases: [] });
    expect(readSettingsRow({ disabled_checks: ["photos", "x"], required_phrases: ["a", 3, "a"] }))
      .toEqual({ disabledChecks: ["photos"], requiredPhrases: ["a"] });
  });
});

describe("qualityProblems with category and settings", () => {
  const base = {
    itemId: "1", title: "Wool Blazer 44R", descriptionLength: 120, pictureCount: 6,
    specifics: [
      { name: "Brand", values: ["X"] }, { name: "Color", values: ["Navy"] }, { name: "Size", values: ["44"] },
    ],
  };
  const suit = "Clothing, Shoes & Accessories:Men's Clothing:Suits & Suit Separates:Blazers & Sport Coats";
  it("flags missing measurements on tailored items only", () => {
    const tailored = qualityProblems({ ...base, categoryName: suit, descriptionText: "Nice navy blazer in great shape." });
    expect(tailored.join(" ")).toMatch(/doesn't seem to include measurements/);
    const tie = qualityProblems({ ...base, categoryName: "Clothing:Ties", descriptionText: "Nice navy blazer in great shape." });
    expect(tie).toEqual([]);
  });
  it("passes tailored items that have measurements", () => {
    expect(qualityProblems({ ...base, categoryName: suit, descriptionText: "Pit to pit 22. Shoulders 18. Sleeve 25." })).toEqual([]);
  });
  it("skips description checks when the text isn't saved yet or the description is empty", () => {
    expect(qualityProblems({ ...base, categoryName: suit })).toEqual([]);
    const p = qualityProblems({ ...base, categoryName: suit, descriptionLength: 0, descriptionText: "" });
    expect(p).toEqual(["The description is empty."]);
  });
  it("applies required phrases and lets sellers switch checks off", () => {
    const d = { ...base, categoryName: suit, descriptionText: "Pit to pit 22 shoulders 18. Smoke free home." };
    expect(qualityProblems(d, { requiredPhrases: ["smoke free", "flaws noted"] }).join(" "))
      .toMatch(/doesn't mention: flaws noted\./);
    const bad = { ...d, descriptionText: "Short.", descriptionLength: 6, pictureCount: 1 };
    const all = qualityProblems(bad).length;
    const fewer = qualityProblems(bad, { disabledChecks: ["measurements", "photos", "description"] }).length;
    expect(all).toBeGreaterThan(fewer);
    expect(qualityProblems(bad, { disabledChecks: ["measurements", "photos", "description"] })).toEqual([]);
  });
  it("can switch off the size check", () => {
    const d = { ...base, title: "Blazer 46R", descriptionText: "ok pit to pit 22 length 30 and more words here" };
    expect(qualityProblems(d).join(" ")).toMatch(/46R/);
    expect(qualityProblems(d, { disabledChecks: ["size_conflict"] }).join(" ")).not.toMatch(/46R/);
  });
});
