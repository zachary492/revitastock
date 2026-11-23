import { describe, it, expect } from "vitest";
import {
  explainFinding,
  findingKey,
  formatDay,
  isListingRuleType,
  summarizeFindings,
  withoutDismissed,
} from "../../src/lib/audit/explain";

describe("formatDay", () => {
  it("formats a date in US style", () => {
    expect(formatDay("2026-11-05T15:00:00Z")).toBe("Nov 5, 2026");
  });
  it("returns null for empty or bad values", () => {
    expect(formatDay(null)).toBeNull();
    expect(formatDay("")).toBeNull();
    expect(formatDay("not a date")).toBeNull();
    expect(formatDay(42)).toBeNull();
  });
});

describe("explainFinding: sold but still live", () => {
  const base = {
    type: "sold_but_still_active",
    sku: "TIE-001",
    listing_id: "A",
  };

  it("explains one paid sale in plain words", () => {
    const result = explainFinding({
      ...base,
      details: {
        title: "Purple Silk Tie",
        saleDates: ["2026-11-05T15:00:00Z"],
        listedAfterSale: false,
      },
    });
    expect(result?.heading).toBe("Sold, but a listing is still live");
    expect(result?.text).toContain("TIE-001 has a paid sale on Nov 5, 2026");
    expect(result?.text).toContain('"Purple Silk Tie" is still live');
    expect(result?.text).toContain("end the listing");
    expect(result?.text).not.toContain("return you relisted");
  });

  it("mentions a possible return when listed after the sale", () => {
    const result = explainFinding({
      ...base,
      details: {
        title: "Purple Silk Tie",
        saleDates: ["2026-11-05T15:00:00Z"],
        listedAfterSale: true,
      },
    });
    expect(result?.text).toContain("return you relisted");
  });

  it("handles several sales", () => {
    const result = explainFinding({
      ...base,
      details: {
        saleDates: ["2026-11-05T15:00:00Z", "2026-10-20T15:00:00Z"],
      },
    });
    expect(result?.text).toContain("2 paid sales (the latest on Nov 5, 2026)");
    expect(result?.text).toContain("a listing is still live");
  });

  it("still works with no details", () => {
    const result = explainFinding({ ...base, details: null });
    expect(result?.text).toContain("TIE-001 has a paid sale, and a listing");
  });
});

describe("explainFinding: ended, never relisted", () => {
  const base = {
    type: "ended_never_relisted",
    sku: "TIE-005",
    listing_id: "E",
  };

  it("explains the problem and the date", () => {
    const result = explainFinding({
      ...base,
      details: {
        title: "Red Tie",
        endedAt: "2026-10-20T15:00:00Z",
        earlierEndedCount: 0,
      },
    });
    expect(result?.heading).toBe("Ended without selling, not relisted");
    expect(result?.text).toContain('TIE-005 ("Red Tie") ended on Oct 20, 2026');
    expect(result?.text).toContain("relist it");
    expect(result?.text).not.toContain("before");
  });

  it("mentions earlier endings", () => {
    const one = explainFinding({
      ...base,
      details: { earlierEndedCount: 1 },
    });
    const many = explainFinding({
      ...base,
      details: { earlierEndedCount: 3 },
    });
    expect(one?.text).toContain("ended 1 time before");
    expect(many?.text).toContain("ended 3 times before");
  });
});

describe("explainFinding: other types", () => {
  it("returns null for the older spreadsheet check types", () => {
    expect(
      explainFinding({
        type: "ghost_listing",
        sku: "X",
        listing_id: null,
        details: null,
      })
    ).toBeNull();
  });
});

describe("summaries and dismissals", () => {
  it("counts only the two listing checks", () => {
    expect(
      summarizeFindings([
        { type: "sold_but_still_active" },
        { type: "sold_but_still_active" },
        { type: "ended_never_relisted" },
        { type: "ghost_listing" },
      ])
    ).toEqual({ total: 3, soldButStillActive: 2, endedNeverRelisted: 1, staleListings: 0, listingQuality: 0 });
  });

  it("counts stale listings in the total", () => {
    expect(
      summarizeFindings([{ type: "stale_listing" }, { type: "sold_but_still_active" }])
    ).toEqual({ total: 2, soldButStillActive: 1, endedNeverRelisted: 0, staleListings: 1, listingQuality: 0 });
  });

  it("explains a stale listing", () => {
    const e = explainFinding({
      type: "stale_listing",
      sku: "TIE-001",
      listing_id: "1",
      details: { title: "Blue Tie", listedDays: 120, lastWatchedAt: null, watchingSince: "2026-11-20T15:00:00Z" },
    });
    expect(e?.heading).toBe("No watchers for a long time");
    expect(e?.text).toContain("120 days");
    expect(e?.text).toContain("since it started checking on Nov 20, 2026");
    const seen = explainFinding({
      type: "stale_listing",
      sku: "X",
      listing_id: "1",
      details: { title: "T", listedDays: 95, lastWatchedAt: "2026-07-01T12:00:00Z" },
    });
    expect(seen?.text).toContain("last time RevitaSync saw a watcher on it was Jul 1, 2026");
  });

  it("explains a listing-quality finding with all its problems", () => {
    const e = explainFinding({
      type: "listing_quality",
      sku: "BLA-001",
      listing_id: "1",
      details: { title: "Blazer 46R", problems: ["The description is empty.", "It has only 1 photo (RevitaSync suggests at least 3)."] },
    });
    expect(e?.heading).toBe("Listing may need a fix");
    expect(e?.text).toContain('"Blazer 46R"');
    expect(e?.text).toContain("The description is empty. It has only 1 photo");
    expect(
      summarizeFindings([{ type: "listing_quality" }, { type: "listing_quality" }]).listingQuality
    ).toBe(2);
    expect(isListingRuleType("listing_quality")).toBe(true);
  });

  it("knows which types are listing checks", () => {
    expect(isListingRuleType("sold_but_still_active")).toBe(true);
    expect(isListingRuleType("ended_never_relisted")).toBe(true);
    expect(isListingRuleType("stale_listing")).toBe(true);
    expect(isListingRuleType("ghost_listing")).toBe(false);
  });

  it("matches findings ignoring spaces and capital letters in the label", () => {
    expect(findingKey("a", " tie-001 ", "1")).toBe(findingKey("a", "TIE-001", "1"));
    expect(findingKey("a", "TIE-001", "1")).not.toBe(findingKey("a", "TIE-001", "2"));
    expect(findingKey("a", "TIE-001", "1")).not.toBe(findingKey("b", "TIE-001", "1"));
  });

  it("drops dismissed findings", () => {
    const rows = [
      { type: "t", sku: "TIE-001", listing_id: "1" },
      { type: "t", sku: "TIE-002", listing_id: "2" },
    ];
    const result = withoutDismissed(
      rows,
      new Set([findingKey("t", "tie-001", "1")])
    );
    expect(result.map((r) => r.sku)).toEqual(["TIE-002"]);
  });
});
