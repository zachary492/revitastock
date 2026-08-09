export interface PhysicalInventoryRecord {
  sku: string;
  quantity: number;
  title?: string;
  location?: string;
}

export interface LiveListing {
  sku: string;
  listingId: string;
  quantity: number;
  title: string;
  active: boolean;
}

export type DiscrepancyType =
  | "ghost_listing"
  | "phantom_drop"
  | "quantity_mismatch";

export interface Discrepancy {
  sku: string;
  type: DiscrepancyType;
  physicalQuantity: number;
  liveQuantity: number;
  listingId: string;
}
