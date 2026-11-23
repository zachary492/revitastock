import type { Finding } from "./listingRules";
import type { QualityIssue } from "./qualityRules";

export type AnyFinding = Finding | QualityIssue;
export type ListingRuleType = AnyFinding["rule"];

/** One row for the `discrepancies` table (the caller adds user_id). */
export interface DiscrepancyRow {
  sku: string;
  type: ListingRuleType;
  physical_quantity: null;
  live_quantity: number | null;
  listing_id: string;
  details: Record<string, unknown>;
}

/** Stands in for the label on findings about listings that have none. */
export const NO_LABEL = "(no label)";

export const LISTING_RULE_TYPES: ListingRuleType[] = [
  "sold_but_still_active",
  "ended_never_relisted",
  "stale_listing",
  "listing_quality",
];

export function findingToRow(finding: AnyFinding): DiscrepancyRow {
  if (finding.rule === "listing_quality") {
    return {
      sku: finding.label ?? NO_LABEL,
      type: finding.rule,
      physical_quantity: null,
      live_quantity: finding.listing.quantityAvailable,
      listing_id: finding.listing.itemId,
      details: {
        title: finding.listing.title,
        price: finding.listing.price,
        problems: finding.problems,
      },
    };
  }

  if (finding.rule === "sold_but_still_active") {
    return {
      sku: finding.label,
      type: finding.rule,
      physical_quantity: null,
      live_quantity: finding.active.quantityAvailable,
      listing_id: finding.active.itemId,
      details: {
        title: finding.active.title,
        price: finding.active.price,
        saleDates: finding.sales.map((s) => s.soldAt),
        saleItemIds: finding.sales.map((s) => s.itemId),
        listedAfterSale: finding.listedAfterSale,
      },
    };
  }

  if (finding.rule === "stale_listing") {
    return {
      sku: finding.label ?? NO_LABEL,
      type: finding.rule,
      physical_quantity: null,
      live_quantity: finding.listing.quantityAvailable,
      listing_id: finding.listing.itemId,
      details: {
        title: finding.listing.title,
        price: finding.listing.price,
        startTime: finding.listing.startTime,
        listedDays: finding.listedDays,
        lastWatchedAt: finding.lastWatchedAt,
        watchingSince: finding.watchingSince,
      },
    };
  }

  return {
    sku: finding.label,
    type: finding.rule,
    physical_quantity: null,
    live_quantity: 0,
    listing_id: finding.ended.itemId,
    details: {
      title: finding.ended.title,
      price: finding.ended.price,
      endedAt: finding.ended.endTime,
      earlierEndedCount: finding.earlierEndedCount,
    },
  };
}
