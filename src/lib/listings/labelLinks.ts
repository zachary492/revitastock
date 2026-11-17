import type { ListingRecord, SellingLists } from "../ebay/sellingLists";
import { normalizeLabel } from "./organize";

/** One saved answer from the "Needs a label" page. */
export interface LabelLink {
  itemId: string;
  status: "confirmed" | "rejected";
  label: string | null;
}

/**
 * Gives confirmed listings their label, in our own copy of the data.
 * A listing that already has a real label on eBay is never changed.
 * Nothing is written to eBay.
 */
export function applyLabelLinks(
  lists: SellingLists,
  links: LabelLink[]
): SellingLists {
  const confirmed = new Map<string, string>();
  for (const link of links) {
    if (link.status !== "confirmed") continue;
    const label = link.label?.trim();
    if (label) confirmed.set(link.itemId, label);
  }

  const apply = (record: ListingRecord): ListingRecord => {
    if (normalizeLabel(record.sku) !== null) return record;
    const label = confirmed.get(record.itemId);
    return label ? { ...record, sku: label } : record;
  };

  return {
    active: lists.active.map(apply),
    sold: lists.sold.map(apply),
    endedUnsold: lists.endedUnsold.map(apply),
  };
}

/** Listings the seller said are NOT the same item as a suggestion. */
export function rejectedItemIds(links: LabelLink[]): Set<string> {
  return new Set(
    links.filter((l) => l.status === "rejected").map((l) => l.itemId)
  );
}
