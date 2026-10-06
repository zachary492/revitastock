import type { LiveListing } from "@/types/inventory";

export const mockLiveListings: LiveListing[] = [
  {
    // Ghost listing case: physical qty is 0 (per the sample CSV),
    // but this "live" listing still shows 1 available.
    sku: "KAW-CARB-001",
    listingId: "ebay-mock-1001",
    quantity: 1,
    title: "Kawasaki carburetor",
    active: true,
  },
  {
    // Phantom drop case: physical qty is 1, but this listing shows 0 â€”
    // looks sold out online even though it's sitting on the shelf.
    sku: "LEV-JKT-VTG",
    listingId: "ebay-mock-1002",
    quantity: 0,
    title: "Vintage trucker jacket",
    active: true,
  },
  {
    // Exact match / in-sync case: both sides agree (qty 1).
    sku: "HON-ALT-98",
    listingId: "ebay-mock-1003",
    quantity: 1,
    title: "1998 Civic alternator",
    active: true,
  },
  {
    // Exact match / in-sync case: both sides agree (qty 0, nothing to sell).
    sku: "CER-BOWL-SET",
    listingId: "ebay-mock-1004",
    quantity: 0,
    title: "Ceramic bowl set",
    active: true,
  },
  {
    // Edge case: a listing that exists on eBay with NO matching row in
    // physical inventory at all (never uploaded, or a discontinued SKU
    // still live). Worth deciding later how this should be classified â€”
    // it's not quite a "phantom drop" since there's no physical record
    // to compare against.
    sku: "UNKNOWN-SKU-999",
    listingId: "ebay-mock-1005",
    quantity: 2,
    title: "Mystery item not in our records",
    active: true,
  },
];

