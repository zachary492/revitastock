import { section, sections, text } from "./xml";

export type ListingStatus = "active" | "sold" | "ended_unsold";

/** One eBay listing, in our own shape, whichever list it came from. */
export interface ListingRecord {
  itemId: string; // eBay Item ID. Changes when an item is relisted.
  title: string;
  sku: string | null; // seller's Custom Label; null if the listing has none
  status: ListingStatus;
  listingType: string | null; // e.g. FixedPriceItem, Chinese (auction)
  quantityAvailable: number | null;
  quantitySold: number;
  price: number | null;
  startTime: string | null;
  endTime: string | null; // null for good-till-cancelled listings still live
  relisted: boolean; // eBay's own flag on an ended listing
  soldAt: string | null; // sold list only
  paid: boolean | null; // sold list only
}

export interface SellingLists {
  active: ListingRecord[];
  sold: ListingRecord[];
  endedUnsold: ListingRecord[];
}

function num(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseItem(
  itemXml: string,
  status: ListingStatus
): ListingRecord | null {
  const itemId = text(itemXml, "ItemID");
  if (!itemId) return null;

  // Scoped on purpose: <StartTime>/<EndTime> also appear inside promotions.
  const details = section(itemXml, "ListingDetails") ?? "";
  const selling = section(itemXml, "SellingStatus") ?? "";

  return {
    itemId,
    title: text(itemXml, "Title") ?? "",
    // NOTE: <SKU> is eBay's documented name for the Custom Label, but none of
    // our captured listings have one, so this is not yet checked against a
    // real response.
    sku: text(itemXml, "SKU"),
    status,
    listingType: text(itemXml, "ListingType"),
    quantityAvailable: num(text(itemXml, "QuantityAvailable")),
    quantitySold: num(text(selling, "QuantitySold")) ?? 0,
    price: num(text(selling, "CurrentPrice")),
    startTime: text(details, "StartTime"),
    endTime: text(details, "EndTime"),
    relisted: text(itemXml, "Relisted") === "true",
    soldAt: null,
    paid: null,
  };
}

function parseItemList(
  listXml: string | null,
  status: ListingStatus
): ListingRecord[] {
  if (!listXml) return [];
  return sections(listXml, "Item")
    .map((item) => parseItem(item, status))
    .filter((r): r is ListingRecord => r !== null);
}

function parseSoldList(listXml: string | null): ListingRecord[] {
  if (!listXml) return [];
  const records: ListingRecord[] = [];

  for (const transaction of sections(listXml, "Transaction")) {
    const itemXml = section(transaction, "Item");
    if (!itemXml) continue;
    const record = parseItem(itemXml, "sold");
    if (!record) continue;

    // Transaction-level fields live outside <Item>.
    const outside = transaction.replace(/<Item>[\s\S]*?<\/Item>/, "");
    const paidStatus = text(outside, "SellerPaidStatus");

    record.soldAt = text(outside, "CreatedDate");
    // Only "NotPaid" has been seen as unpaid so far; anything else is treated
    // as paid.
    record.paid = paidStatus === null ? null : paidStatus !== "NotPaid";
    records.push(record);
  }
  return records;
}

export function parseSellingLists(xml: string): SellingLists {
  if (section(xml, "Ack") === "Failure") {
    const code = section(xml, "ErrorCode") ?? "?";
    const message =
      section(xml, "LongMessage") ?? section(xml, "ShortMessage") ?? "unknown";
    throw new Error(`eBay Trading API error ${code}: ${message}`);
  }

  return {
    active: parseItemList(section(xml, "ActiveList"), "active"),
    sold: parseSoldList(section(xml, "SoldList")),
    endedUnsold: parseItemList(section(xml, "UnsoldList"), "ended_unsold"),
  };
}