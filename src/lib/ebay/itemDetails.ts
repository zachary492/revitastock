import { section, sections, text } from "./xml";
import { parseTradingResult } from "./labelWrite";
import { isExpiredTokenMessage } from "./tokenRefresh";

function tradingUrl(): string {
  return process.env.EBAY_ENV?.trim().toLowerCase() === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";
}

export interface ItemSpecific {
  name: string;
  values: string[]; // empty = the name is there but nothing is filled in
}

/** What we keep about one listing's content. */
export interface ItemDetails {
  itemId: string;
  title: string;
  descriptionLength: number; // visible characters, HTML removed
  pictureCount: number;
  specifics: ItemSpecific[];
  /** eBay category, e.g. "Clothing, Shoes & Accessories:Men's Clothing:Suits". */
  categoryId?: string | null;
  categoryName?: string | null;
  /** Visible description text (HTML removed, capped). Absent on older saved copies. */
  descriptionText?: string | null;
}

export const MAX_DESCRIPTION_TEXT = 8000;

const ITEM_ID = /^\d{6,20}$/;

export function buildGetItemDetailsRequest(itemId: string): string {
  if (!ITEM_ID.test(itemId)) throw new Error("Invalid item number.");
  return `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;
}

/** Visible text of an HTML description. */
export function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes whole blocks (return policy text also uses a <Description> tag). */
function without(xml: string, tags: string[]): string {
  let out = xml;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "g"), " ");
  }
  return out;
}

/** Reads a GetItem reply. Returns null when there is no <Item>. */
export function parseItemDetails(xml: string): ItemDetails | null {
  const rawItem = section(xml, "Item");
  if (!rawItem) return null;
  const itemId = text(rawItem, "ItemID");
  if (!itemId) return null;

  const item = without(rawItem, ["ReturnPolicy", "SellerProfiles", "ShippingDetails"]);

  // The description arrives either escaped (&lt;div&gt;) or inside CDATA.
  const rawDescription = section(item, "Description") ?? "";
  const decodedDescription = rawDescription
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const descriptionPlain = stripHtml(decodedDescription);
  const descriptionLength = descriptionPlain.length;
  const categoryBlock = section(item, "PrimaryCategory") ?? "";

  const pictureBlock = section(item, "PictureDetails") ?? "";
  const pictureUrls = new Set(
    sections(pictureBlock, "PictureURL").map((u) => u.trim()).filter(Boolean)
  );
  const pictureCount =
    pictureUrls.size > 0 ? pictureUrls.size : text(pictureBlock, "GalleryURL") ? 1 : 0;

  const specificsBlock = section(item, "ItemSpecifics") ?? "";
  const specifics: ItemSpecific[] = sections(specificsBlock, "NameValueList")
    .map((block) => ({
      name: text(block, "Name") ?? "",
      values: sections(block, "Value")
        .map((v) => stripHtml(v))
        .filter((v) => v.length > 0),
    }))
    .filter((s) => s.name.length > 0);

  return {
    itemId,
    title: text(item, "Title") ?? "",
    descriptionLength,
    pictureCount,
    specifics,
    categoryId: text(categoryBlock, "CategoryID") ?? null,
    categoryName: (text(categoryBlock, "CategoryName") ?? "").replace(/&amp;/g, "&").trim() || null,
    descriptionText: descriptionPlain.slice(0, MAX_DESCRIPTION_TEXT),
  };
}

export type DetailFetchResult =
  | { ok: true; details: ItemDetails }
  | { ok: false; message: string; expiredToken: boolean };

export async function fetchItemDetails(
  accessToken: string,
  itemId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DetailFetchResult> {
  try {
    const xml = await fetchItemXml(accessToken, itemId, fetchImpl);
    const result = parseTradingResult(xml);
    if (!result.ok) {
      const message = result.messages.map((m) => `${m.code ?? "?"}: ${m.message}`).join("; ");
      return { ok: false, message: message || "eBay refused the request.", expiredToken: isExpiredTokenMessage(message) };
    }
    const details = parseItemDetails(xml);
    if (!details) return { ok: false, message: "eBay's reply had no item.", expiredToken: false };
    return { ok: true, details };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach eBay.";
    return { ok: false, message, expiredToken: isExpiredTokenMessage(message) };
  }
}

/** The raw GetItem reply (also used by the "look at one listing" page). */
export async function fetchItemXml(
  accessToken: string,
  itemId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(tradingUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1475",
      "X-EBAY-API-CALL-NAME": "GetItem",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-IAF-TOKEN": accessToken,
    },
    body: buildGetItemDetailsRequest(itemId),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`eBay Trading API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return body;
}

const KEEP_VALUES = new Set([
  "Ack", "ListingType", "ListingDuration", "Quantity", "QuantityAvailable",
  "WatchCount", "HitCount", "Name", "Value", "ConditionDisplayName", "Currency",
]);

/**
 * A map of what eBay's reply contains: every tag, with text values hidden
 * except for a few harmless ones (and item-specific names and values).
 * Safe to paste into a chat.
 */
export function outlineXml(xml: string, maxLines = 150): string {
  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "CDATA");

  interface Node { name: string; depth: number; value: string | null; inSpecifics: boolean }
  const nodes: Node[] = [];
  const stack: Node[] = [];

  const tokens = cleaned.matchAll(/<(\/?)([A-Za-z0-9_:]+)[^>]*?(\/?)>|([^<]+)/g);
  for (const t of tokens) {
    const [, closing, name, selfClosing, content] = t;
    if (content !== undefined) {
      const top = stack[stack.length - 1];
      const trimmed = content.trim();
      if (top && trimmed) top.value = trimmed;
      continue;
    }
    if (!name) continue;
    if (closing) {
      stack.pop();
      continue;
    }
    const node: Node = {
      name,
      depth: stack.length,
      value: null,
      inSpecifics: stack.some((n) => n.name === "NameValueList"),
    };
    nodes.push(node);
    if (!selfClosing) stack.push(node);
  }

  const lines: string[] = [];
  let last = "";
  let repeat = 1;
  const flush = () => {
    if (!last) return;
    lines.push(repeat > 1 ? `${last}  ×${repeat}` : last);
  };
  for (const n of nodes) {
    let shown = "";
    if (n.value !== null) {
      const keep = KEEP_VALUES.has(n.name) && ((n.name !== "Name" && n.name !== "Value") || n.inSpecifics);
      shown = keep && n.value.length <= 80 ? `: ${n.value}` : ` (${n.value.length} characters)`;
    }
    const line = `${"  ".repeat(n.depth)}${n.name}${shown}`;
    if (line === last) {
      repeat++;
    } else {
      flush();
      last = line;
      repeat = 1;
    }
  }
  flush();
  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines) clipped.push(`… ${lines.length - maxLines} more lines`);
  return clipped.join("\n");
}
