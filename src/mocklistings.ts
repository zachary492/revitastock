import type { LiveListing } from "@/types/inventory";

/**
 * Fake "live eBay listing" data, standing in for the real eBay API
 * until the Sandbox OAuth connection is working.
 */
export const mockLiveListings: LiveListing[] = [
  {
    sku: "KAW-CARB-001",
    listingId: "ebay-mock-1001",
    quantity: 1,
    title: "Kawasaki carburetor",
    active: true,
  },
  {
    sku: "LEV-JKT-VTG",
    listingId: "ebay-mock-1002",
    quantity: 0,
    title: "Vintage trucker jacket",
    active: true,
  },
  {
    sku: "HON-ALT-98",
    listingId: "ebay-mock-1003",
    quantity: 1,
    title: "1998 Civic alternator",
    active: true,
  },
  {
    sku: "CER-BOWL-SET",
    listingId: "ebay-mock-1004",
    quantity: 0,
    title: "Ceramic bowl set",
    active: true,
  },
  {
    sku: "UNKNOWN-SKU-999",
    listingId: "ebay-mock-1005",
    quantity: 2,
    title: "Mystery item not in our records",
    active: true,
  },
];