import { describe, it, expect } from "vitest";
import {
  buildGetItemDetailsRequest,
  fetchItemDetails,
  outlineXml,
  parseItemDetails,
  stripHtml,
} from "../../src/lib/ebay/itemDetails";

// Made-up reply in the documented GetItem shape (not captured from a real account).
const ITEM = `<?xml version="1.0" encoding="UTF-8"?>
<GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <Item>
    <ItemID>100000000001</ItemID>
    <Title>Brooks Brothers Blazer 46R Navy</Title>
    <Description>&lt;div&gt;&lt;p&gt;Navy wool blazer.&nbsp;Chest 22 in.&lt;/p&gt;&lt;/div&gt;</Description>
    <ListingType>FixedPriceItem</ListingType>
    <PictureDetails>
      <GalleryURL>https://example.com/g.jpg</GalleryURL>
      <PictureURL>https://example.com/1.jpg</PictureURL>
      <PictureURL>https://example.com/2.jpg</PictureURL>
      <PictureURL>https://example.com/2.jpg</PictureURL>
    </PictureDetails>
    <ItemSpecifics>
      <NameValueList><Name>Brand</Name><Value>Brooks Brothers</Value></NameValueList>
      <NameValueList><Name>Size</Name><Value>46 Long</Value></NameValueList>
      <NameValueList><Name>Color</Name><Value>Navy</Value><Value>Blue</Value></NameValueList>
      <NameValueList><Name>Material</Name></NameValueList>
    </ItemSpecifics>
    <ReturnPolicy><Description>30 days, buyer pays shipping.</Description></ReturnPolicy>
  </Item>
</GetItemResponse>`;

describe("parseItemDetails", () => {
  const d = parseItemDetails(ITEM);
  it("reads the title and id", () => {
    expect(d?.itemId).toBe("100000000001");
    expect(d?.title).toBe("Brooks Brothers Blazer 46R Navy");
  });
  it("measures the visible description, not the HTML", () => {
    expect(d?.descriptionLength).toBe("Navy wool blazer. Chest 22 in.".length);
  });
  it("counts distinct photos", () => {
    expect(d?.pictureCount).toBe(2);
  });
  it("reads item specifics with several values and blank ones", () => {
    expect(d?.specifics).toEqual([
      { name: "Brand", values: ["Brooks Brothers"] },
      { name: "Size", values: ["46 Long"] },
      { name: "Color", values: ["Navy", "Blue"] },
      { name: "Material", values: [] },
    ]);
  });
  it("does not mistake the return policy for the description", () => {
    const noDescription = ITEM.replace(/<Description>&lt;[\s\S]*?<\/Description>/, "");
    expect(parseItemDetails(noDescription)?.descriptionLength).toBe(0);
  });
  it("reads a CDATA description", () => {
    const xml = ITEM.replace(/<Description>&lt;[\s\S]*?<\/Description>/, "<Description><![CDATA[<b>Hello world</b>]]></Description>");
    expect(parseItemDetails(xml)?.descriptionLength).toBe(11);
  });
  it("falls back to the gallery picture, and handles a listing with none", () => {
    const one = ITEM.replace(/<PictureURL>[^<]*<\/PictureURL>/g, "");
    expect(parseItemDetails(one)?.pictureCount).toBe(1);
    const none = one.replace(/<GalleryURL>[^<]*<\/GalleryURL>/, "");
    expect(parseItemDetails(none)?.pictureCount).toBe(0);
  });
  it("handles a listing with no specifics and returns null with no item", () => {
    const bare = ITEM.replace(/<ItemSpecifics>[\s\S]*?<\/ItemSpecifics>/, "");
    expect(parseItemDetails(bare)?.specifics).toEqual([]);
    expect(parseItemDetails("<GetItemResponse><Ack>Failure</Ack></GetItemResponse>")).toBeNull();
  });
});

describe("stripHtml", () => {
  it("removes tags, scripts and extra spaces", () => {
    expect(stripHtml("<style>p{}</style><p>Hello&nbsp;  <b>there</b></p><script>x()</script>")).toBe("Hello there");
    expect(stripHtml("   ")).toBe("");
  });
});

describe("request and fetch", () => {
  it("builds a request and refuses bad ids", () => {
    expect(buildGetItemDetailsRequest("100000000001")).toContain("<IncludeItemSpecifics>true</IncludeItemSpecifics>");
    expect(() => buildGetItemDetailsRequest("abc")).toThrow();
  });
  const reply = (status: number, body: string) =>
    (async () => ({ ok: status < 300, status, text: async () => body }) as Response) as unknown as typeof fetch;
  it("returns details on success", async () => {
    const r = await fetchItemDetails("T", "100000000001", reply(200, ITEM));
    expect(r.ok).toBe(true);
  });
  it("reports an expired token", async () => {
    const xml = `<R><Ack>Failure</Ack><Errors><ErrorCode>932</ErrorCode><LongMessage>Auth token is hard expired.</LongMessage></Errors></R>`;
    const r = await fetchItemDetails("T", "100000000001", reply(200, xml));
    expect(r).toMatchObject({ ok: false, expiredToken: true });
  });
  it("reports other failures and HTTP errors without throwing", async () => {
    const xml = `<R><Ack>Failure</Ack><Errors><ErrorCode>17</ErrorCode><LongMessage>Item not found.</LongMessage></Errors></R>`;
    expect(await fetchItemDetails("T", "100000000001", reply(200, xml))).toMatchObject({ ok: false, expiredToken: false });
    expect(await fetchItemDetails("T", "100000000001", reply(503, "down"))).toMatchObject({ ok: false });
  });
});

describe("outlineXml", () => {
  const outline = outlineXml(ITEM);
  it("shows the structure and hides private text", () => {
    expect(outline).toContain("GetItemResponse");
    expect(outline).toContain("  Item");
    expect(outline).toContain("Title (31 characters)");
    expect(outline).not.toContain("Brooks Brothers Blazer");
    expect(outline).not.toContain("example.com");
    expect(outline).toContain("Ack: Success");
  });
  it("keeps item specific names and values, and collapses repeats", () => {
    expect(outline).toContain("Name: Size");
    expect(outline).toContain("Value: 46 Long");
    expect(outline).toMatch(/PictureURL \(\d+ characters\)  ×3/);
  });
  it("caps very long outlines", () => {
    expect(outlineXml(ITEM, 5).split("\n").length).toBe(6);
  });
});
