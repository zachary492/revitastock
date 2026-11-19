import { section, sections, text } from "./xml";
import type { ListingRecord } from "./sellingLists";

function tradingUrl(): string {
  return process.env.EBAY_ENV?.trim().toLowerCase() === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const ITEM_ID = /^\d{6,20}$/;

/**
 * Listings we allow for the write test: live, fixed price (not an auction),
 * already labeled, and not multi-quantity.
 */
export function isLabelTestCandidate(record: ListingRecord): boolean {
  return (
    record.status === "active" &&
    /^(FixedPriceItem|StoresFixedPrice)$/.test(record.listingType ?? "") &&
    !!record.sku?.trim() &&
    ITEM_ID.test(record.itemId) &&
    (record.quantityAvailable ?? 1) <= 1
  );
}

/**
 * The test edit: re-save the listing's CURRENT label. Nothing else is sent,
 * so nothing about the listing should change.
 */
export function buildReviseLabelRequest(itemId: string, sku: string): string {
  if (!ITEM_ID.test(itemId)) throw new Error("Invalid item number.");
  if (!sku.trim()) throw new Error("Missing label.");
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${itemId}</ItemID>
    <SKU>${escapeXml(sku)}</SKU>
  </Item>
</ReviseFixedPriceItemRequest>`;
}

export function buildGetItemRequest(itemId: string): string {
  if (!ITEM_ID.test(itemId)) throw new Error("Invalid item number.");
  return `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ItemID>${itemId}</ItemID>
</GetItemRequest>`;
}

export interface TradingMessage {
  code: string | null;
  severity: string | null; // "Error" or "Warning"
  message: string;
}

export interface TradingResult {
  ack: string | null; // Success, Warning, Failure, PartialFailure
  ok: boolean; // Success or Warning
  messages: TradingMessage[];
}

/** Reads eBay's Ack and any error or warning messages from a Trading API reply. */
export function parseTradingResult(xml: string): TradingResult {
  const ack = text(xml, "Ack");
  const messages = sections(xml, "Errors").map((block) => ({
    code: text(block, "ErrorCode"),
    severity: text(block, "SeverityCode"),
    message:
      text(block, "LongMessage") ?? text(block, "ShortMessage") ?? "Unknown message",
  }));
  return { ack, ok: ack === "Success" || ack === "Warning", messages };
}

/** The label (SKU) in a GetItem reply, or null if the listing has none. */
export function parseItemLabel(xml: string): string | null {
  const item = section(xml, "Item");
  return item ? text(item, "SKU") : null;
}

export type LabelWriteOutcome =
  | "unchanged" // eBay accepted the edit and the label reads back the same
  | "label_differs" // eBay accepted the edit but the label reads back differently
  | "rejected" // eBay refused the edit
  | "error"; // we could not talk to eBay

export interface LabelWriteResult {
  outcome: LabelWriteOutcome;
  itemId: string;
  label: string;
  labelAfter: string | null;
  messages: TradingMessage[];
  detail?: string;
}

/**
 * The write test. Sends the one harmless edit, then reads the listing back to
 * confirm the label is unchanged. Stops after the first call if eBay refuses.
 */
export async function testLabelWrite(
  accessToken: string,
  itemId: string,
  label: string,
  fetchImpl: typeof fetch = fetch
): Promise<LabelWriteResult> {
  const call = async (name: string, body: string): Promise<string> => {
    const res = await fetchImpl(tradingUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1475",
        "X-EBAY-API-CALL-NAME": name,
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body,
    });
    const reply = await res.text();
    if (!res.ok) {
      throw new Error(`eBay Trading API HTTP ${res.status}: ${reply.slice(0, 200)}`);
    }
    return reply;
  };

  const base = { itemId, label, labelAfter: null, messages: [] as TradingMessage[] };

  let write: TradingResult;
  try {
    write = parseTradingResult(
      await call("ReviseFixedPriceItem", buildReviseLabelRequest(itemId, label))
    );
  } catch (err) {
    return {
      ...base,
      outcome: "error",
      detail: err instanceof Error ? err.message : "Could not reach eBay.",
    };
  }

  if (!write.ok) {
    return { ...base, outcome: "rejected", messages: write.messages };
  }

  try {
    const readBack = await call("GetItem", buildGetItemRequest(itemId));
    const labelAfter = parseItemLabel(readBack);
    return {
      ...base,
      outcome: labelAfter === label ? "unchanged" : "label_differs",
      labelAfter,
      messages: write.messages, // warnings, if any
    };
  } catch (err) {
    return {
      ...base,
      outcome: "error",
      messages: write.messages,
      detail:
        "eBay accepted the edit, but reading the listing back failed: " +
        (err instanceof Error ? err.message : "unknown error"),
    };
  }
}
