import { describe, it, expect } from "vitest";
import {
  buildGetItemRequest,
  buildReviseLabelRequest,
  escapeXml,
  isLabelTestCandidate,
  parseItemLabel,
  parseTradingResult,
  testLabelWrite,
} from "../../src/lib/ebay/labelWrite";
import type { ListingRecord } from "../../src/lib/ebay/sellingLists";

function rec(overrides: Partial<ListingRecord>): ListingRecord {
  return {
    itemId: "100000000001",
    title: "Test listing",
    sku: "TIE-001",
    status: "active",
    listingType: "FixedPriceItem",
    quantityAvailable: 1,
    quantitySold: 0,
    price: 10,
    startTime: "2026-10-01T00:00:00Z",
    endTime: null,
    relisted: false,
    soldAt: null,
    paid: null,
    ...overrides,
  };
}

// Made-up replies in the documented eBay shapes (not captured from a real account).
const SUCCESS = `<?xml version="1.0" encoding="UTF-8"?>
<ReviseFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ItemID>100000000001</ItemID>
  <SKU>TIE-001</SKU>
</ReviseFixedPriceItemResponse>`;
const WARNING = `<ReviseFixedPriceItemResponse><Ack>Warning</Ack>
  <Errors><ShortMessage>Heads up</ShortMessage><LongMessage>Some &amp; warning</LongMessage>
  <ErrorCode>21917236</ErrorCode><SeverityCode>Warning</SeverityCode></Errors></ReviseFixedPriceItemResponse>`;
const FAILURE = `<ReviseFixedPriceItemResponse><Ack>Failure</Ack>
  <Errors><ShortMessage>Nope</ShortMessage><LongMessage>Insufficient permissions to fulfill the request.</LongMessage>
  <ErrorCode>1100</ErrorCode><SeverityCode>Error</SeverityCode>
  <ErrorParameters ParamID="0"><Value>x</Value></ErrorParameters></Errors>
</ReviseFixedPriceItemResponse>`;
const getItem = (sku: string | null) => `<GetItemResponse><Ack>Success</Ack>
  <Item><ItemID>100000000001</ItemID>${sku === null ? "" : `<SKU>${sku}</SKU>`}
  <SellingStatus><CurrentPrice currencyID="USD">10.0</CurrentPrice></SellingStatus></Item></GetItemResponse>`;

function sequenceFetch(replies: { status?: number; body: string }[]) {
  const calls: { name: string; body: string }[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ name: headers["X-EBAY-API-CALL-NAME"] ?? "", body: String(init.body) });
    const next = replies[calls.length - 1] ?? { body: "" };
    const status = next.status ?? 200;
    return { ok: status < 300, status, text: async () => next.body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("request builders", () => {
  it("builds a label-only edit", () => {
    const xml = buildReviseLabelRequest("100000000001", "TIE-001");
    expect(xml).toContain("<ItemID>100000000001</ItemID>");
    expect(xml).toContain("<SKU>TIE-001</SKU>");
    expect(xml).toContain("<ReviseFixedPriceItemRequest");
    // nothing but the id and the label in the Item
    const item = xml.match(/<Item>([\s\S]*?)<\/Item>/)?.[1] ?? "";
    expect(item.match(/<\w+>/g)).toEqual(["<ItemID>", "<SKU>"]);
  });

  it("escapes special characters in labels", () => {
    expect(escapeXml(`A&B <C> "D" 'E'`)).toBe("A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;");
    expect(buildReviseLabelRequest("100000000001", "A&B")).toContain("<SKU>A&amp;B</SKU>");
  });

  it("refuses bad input", () => {
    expect(() => buildReviseLabelRequest("abc", "X")).toThrow("Invalid item number");
    expect(() => buildReviseLabelRequest("1", "X")).toThrow("Invalid item number");
    expect(() => buildReviseLabelRequest("100000000001", "  ")).toThrow("Missing label");
    expect(() => buildGetItemRequest("<script>")).toThrow("Invalid item number");
  });

  it("builds a read-back request", () => {
    expect(buildGetItemRequest("100000000001")).toContain("<ItemID>100000000001</ItemID>");
  });
});

describe("parseTradingResult", () => {
  it("reads success", () => {
    const r = parseTradingResult(SUCCESS);
    expect(r).toEqual({ ack: "Success", ok: true, messages: [] });
  });
  it("treats a warning as ok and keeps the message", () => {
    const r = parseTradingResult(WARNING);
    expect(r.ok).toBe(true);
    expect(r.messages).toEqual([
      { code: "21917236", severity: "Warning", message: "Some & warning" },
    ]);
  });
  it("reads a failure with its error", () => {
    const r = parseTradingResult(FAILURE);
    expect(r.ok).toBe(false);
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.code).toBe("1100");
    expect(r.messages[0]?.message).toContain("Insufficient permissions");
  });
  it("is not ok when there is no Ack", () => {
    expect(parseTradingResult("<x/>").ok).toBe(false);
  });
});

describe("parseItemLabel", () => {
  it("reads the label from GetItem", () => {
    expect(parseItemLabel(getItem("TIE-001"))).toBe("TIE-001");
  });
  it("returns null when the listing has no label", () => {
    expect(parseItemLabel(getItem(null))).toBeNull();
  });
});

describe("isLabelTestCandidate", () => {
  it("accepts a live, labeled, fixed-price listing", () => {
    expect(isLabelTestCandidate(rec({}))).toBe(true);
  });
  it("rejects auctions, ended, unlabeled and multi-quantity listings", () => {
    expect(isLabelTestCandidate(rec({ listingType: "Chinese" }))).toBe(false);
    expect(isLabelTestCandidate(rec({ status: "ended_unsold" }))).toBe(false);
    expect(isLabelTestCandidate(rec({ sku: null }))).toBe(false);
    expect(isLabelTestCandidate(rec({ sku: "  " }))).toBe(false);
    expect(isLabelTestCandidate(rec({ quantityAvailable: 3 }))).toBe(false);
    expect(isLabelTestCandidate(rec({ itemId: "12" }))).toBe(false);
  });
});

describe("testLabelWrite", () => {
  it("sends the edit, then reads back and reports no change", async () => {
    const { impl, calls } = sequenceFetch([{ body: SUCCESS }, { body: getItem("TIE-001") }]);
    const r = await testLabelWrite("TOKEN", "100000000001", "TIE-001", impl);
    expect(r.outcome).toBe("unchanged");
    expect(r.labelAfter).toBe("TIE-001");
    expect(calls.map((c) => c.name)).toEqual(["ReviseFixedPriceItem", "GetItem"]);
  });

  it("flags a label that reads back differently", async () => {
    const { impl } = sequenceFetch([{ body: SUCCESS }, { body: getItem("OTHER") }]);
    const r = await testLabelWrite("TOKEN", "100000000001", "TIE-001", impl);
    expect(r.outcome).toBe("label_differs");
    expect(r.labelAfter).toBe("OTHER");
  });

  it("stops after one call when eBay refuses", async () => {
    const { impl, calls } = sequenceFetch([{ body: FAILURE }]);
    const r = await testLabelWrite("TOKEN", "100000000001", "TIE-001", impl);
    expect(r.outcome).toBe("rejected");
    expect(r.messages[0]?.code).toBe("1100");
    expect(calls).toHaveLength(1);
  });

  it("keeps warnings from an accepted edit", async () => {
    const { impl } = sequenceFetch([{ body: WARNING }, { body: getItem("TIE-001") }]);
    const r = await testLabelWrite("TOKEN", "100000000001", "TIE-001", impl);
    expect(r.outcome).toBe("unchanged");
    expect(r.messages).toHaveLength(1);
  });

  it("reports a network or HTTP problem", async () => {
    const { impl } = sequenceFetch([{ status: 503, body: "down" }]);
    const r = await testLabelWrite("TOKEN", "100000000001", "TIE-001", impl);
    expect(r.outcome).toBe("error");
    expect(r.detail).toContain("HTTP 503");
  });

  it("reports when the read-back fails after an accepted edit", async () => {
    const { impl } = sequenceFetch([{ body: SUCCESS }, { status: 500, body: "oops" }]);
    const r = await testLabelWrite("TOKEN", "100000000001", "TIE-001", impl);
    expect(r.outcome).toBe("error");
    expect(r.detail).toContain("accepted the edit");
  });

  it("sends the token only in the eBay header", async () => {
    const { impl, calls } = sequenceFetch([{ body: SUCCESS }, { body: getItem("TIE-001") }]);
    await testLabelWrite("SECRET-TOKEN", "100000000001", "TIE-001", impl);
    expect(calls.every((c) => !c.body.includes("SECRET-TOKEN"))).toBe(true);
  });
});
