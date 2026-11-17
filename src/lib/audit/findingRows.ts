import type { Finding } from "./listingRules";

export type ListingRuleType = Finding["rule"];

/** One row for the `discrepancies` table (the caller adds user_id). */
export interface DiscrepancyRow {
  sku: string;
  type: ListingRuleType;
  physical_quantity: null;
  live_quantity: number | null;
  listing_id: string;
  details: Record<string, unknown>;
}

export const LISTING_RULE_TYPES: ListingRuleType[] = [
  "sold_but_still_active",
  "ended_never_relisted",
];

export function findingToRow(finding: Finding): DiscrepancyRow {
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
