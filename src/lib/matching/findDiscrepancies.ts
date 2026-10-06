import type {
  Discrepancy,
  DiscrepancyType,
  LiveListing,
  PhysicalInventoryRecord,
} from "@/types/inventory";

/** An item where the shelf and the live listing agree. */
export interface InSyncItem {
  sku: string;
  quantity: number;
  listingId: string;
}

export interface MatchResult {
  /** Shelf and listing disagree. This is the product's main output. */
  discrepancies: Discrepancy[];
  /** Shelf and listing agree. */
  inSync: InSyncItem[];
  /** On your shelf, but no matching eBay listing was found. */
  unlistedInventory: PhysicalInventoryRecord[];
  /** Live on eBay, but not found in your physical inventory. */
  unknownListings: LiveListing[];
}

/**
 * Makes SKUs comparable: ignores stray spaces and upper/lower case, so
 * "kaw-carb-001 " and "KAW-CARB-001" count as the same item. This is
 * deliberately NOT fuzzy matching — it only forgives formatting, never
 * guesses that two different SKUs "look similar enough."
 */
function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * The heart of RevitaSync. Given what's on the shelf and what's live
 * on eBay, decide what kind of problem (if any) this item has.
 *
 * Returns null when the two numbers agree (nothing to flag).
 */
export function classify(
  physicalQuantity: number,
  liveQuantity: number
): DiscrepancyType | null {
  if (physicalQuantity === liveQuantity) return null;
  if (physicalQuantity === 0 && liveQuantity > 0) return "ghost_listing";
  if (physicalQuantity > 0 && liveQuantity === 0) return "phantom_drop";
  return "quantity_mismatch";
}

/**
 * Compares physical inventory against live listings, matching by SKU.
 *
 * Notes on behavior:
 * - An INACTIVE (ended) listing counts as 0 available, since buyers
 *   can't purchase it. Spotting "ended but never relisted" as its own
 *   special case is a planned later feature — for now it simply shows
 *   up as a phantom drop if there's stock on the shelf.
 * - If the same SKU appears more than once on either side, the LAST one
 *   wins. (Re-uploading the same CSV creates duplicate rows today;
 *   cleaning that up properly is planned for later this week.)
 * - Results keep the order of your physical inventory.
 */
export function findDiscrepancies(
  physical: PhysicalInventoryRecord[],
  live: LiveListing[]
): MatchResult {
  const listingsBySku = new Map<string, LiveListing>();
  for (const listing of live) {
    listingsBySku.set(normalizeSku(listing.sku), listing);
  }

  const physicalBySku = new Map<string, PhysicalInventoryRecord>();
  for (const record of physical) {
    physicalBySku.set(normalizeSku(record.sku), record);
  }

  const result: MatchResult = {
    discrepancies: [],
    inSync: [],
    unlistedInventory: [],
    unknownListings: [],
  };

  // Walk the shelf: find each item's listing and compare.
  for (const [key, record] of physicalBySku) {
    const listing = listingsBySku.get(key);

    if (!listing) {
      result.unlistedInventory.push(record);
      continue;
    }

    const liveQuantity = listing.active ? listing.quantity : 0;
    const type = classify(record.quantity, liveQuantity);

    if (type === null) {
      result.inSync.push({
        sku: record.sku,
        quantity: record.quantity,
        listingId: listing.listingId,
      });
    } else {
      result.discrepancies.push({
        sku: record.sku,
        type,
        physicalQuantity: record.quantity,
        liveQuantity,
        listingId: listing.listingId,
      });
    }
  }

  // Walk the listings: anything live that isn't on the shelf list.
  for (const [key, listing] of listingsBySku) {
    if (!physicalBySku.has(key)) {
      result.unknownListings.push(listing);
    }
  }

  return result;
}
