import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSellingLists } from "../../src/lib/ebay/sellingLists";
import { decodeEntities, section, sections } from "../../src/lib/ebay/xml";

// Real GetMyeBaySelling response structure (captured after labeling two
// listings), with titles, ids, prices and sales identifiers replaced by
// neutral values. The TIE-001/TIE-002 labels are as eBay returned them.
const sample = readFileSync(
  join(__dirname, "../fixtures/selling-sample.xml"),
  "utf8"
);

describe("parseSellingLists (real response shape)", () => {
  const lists = parseSellingLists(sample);

  it("finds the items in each list", () => {
    expect(lists.active.map((r) => r.itemId)).toEqual([
      "100000000001",
      "100000000002",
      "100000000003",
    ]);
    expect(lists.sold.map((r) => r.itemId)).toEqual([
      "100000000004",
      "100000000005",
      "100000000006",
    ]);
    expect(lists.endedUnsold.map((r) => r.itemId)).toEqual([
      "100000000007",
      "100000000008",
      "100000000009",
    ]);
  });

  it("reads an active good-till-cancelled listing", () => {
    expect(lists.active[0]).toEqual({
      itemId: "100000000001",
      title: "Test listing 1",
      sku: "TIE-001",
      status: "active",
      listingType: "FixedPriceItem",
      quantityAvailable: 1,
      quantitySold: 0,
      price: 10,
      startTime: "2026-10-15T02:34:36.000Z",
      endTime: null,
      relisted: false,
      soldAt: null,
      paid: null,
    });
  });

  it("reads sold items, including when the sale was made and whether it was paid", () => {
    const [unpaid, paid] = lists.sold;
    expect(unpaid?.status).toBe("sold");
    expect(unpaid?.quantitySold).toBe(1);
    expect(unpaid?.soldAt).toBe("2026-10-23T02:05:08.000Z");
    expect(unpaid?.paid).toBe(false);
    expect(paid?.paid).toBe(true);
    expect(paid?.price).toBe(90);
  });

  it("takes start/end times from the listing, not from a promotion", () => {
    // This listing also has a promotion with its own start and end times.
    const promoted = lists.endedUnsold[1];
    expect(promoted?.startTime).toBe("2026-10-23T18:01:43.000Z");
    expect(promoted?.endTime).toBe("2026-11-01T13:12:41.000Z");
  });

  it("shows the relist problem: same title, new Item ID, flagged relisted", () => {
    const soldOriginal = lists.sold[2];
    const relist = lists.endedUnsold[2];
    expect(soldOriginal?.title).toBe(relist?.title);
    expect(soldOriginal?.itemId).not.toBe(relist?.itemId);
    expect(soldOriginal?.paid).toBe(false);
    expect(relist?.relisted).toBe(true);
    expect(lists.endedUnsold[0]?.relisted).toBe(false);
  });

  it("reads the Custom Label (<SKU>) when a listing has one", () => {
    expect(lists.active[0]?.sku).toBe("TIE-001");
    expect(lists.active[1]?.sku).toBe("TIE-002");
  });

  it("leaves sku null for listings without a label", () => {
    expect(lists.active[2]?.sku).toBeNull();
    // Ended and sold listings in this sample were never labeled.
    expect(lists.sold.every((r) => r.sku === null)).toBe(true);
    expect(lists.endedUnsold.every((r) => r.sku === null)).toBe(true);
  });
});

describe("parseSellingLists (edge cases)", () => {
  it("returns empty lists when eBay sends none", () => {
    const xml = `<GetMyeBaySellingResponse><Ack>Success</Ack></GetMyeBaySellingResponse>`;
    expect(parseSellingLists(xml)).toEqual({
      active: [],
      sold: [],
      endedUnsold: [],
    });
  });

  it("throws eBay's own message when the call fails", () => {
    const xml = `<GetMyeBaySellingResponse><Ack>Failure</Ack>
      <Errors><ShortMessage>Auth token is hard expired.</ShortMessage>
      <LongMessage>Auth token is hard expired, User needs to generate a new token for this application.</LongMessage>
      <ErrorCode>932</ErrorCode></Errors></GetMyeBaySellingResponse>`;
    expect(() => parseSellingLists(xml)).toThrow(
      "eBay Trading API error 932: Auth token is hard expired, User needs to generate a new token for this application."
    );
  });

  it("decodes XML entities in titles", () => {
    const xml = `<R><Ack>Success</Ack><ActiveList><ItemArray><Item>
      <ItemID>1</ItemID><Title>Tom &amp; Jerry &quot;Set&quot;</Title>
    </Item></ItemArray></ActiveList></R>`;
    expect(parseSellingLists(xml).active[0]?.title).toBe('Tom & Jerry "Set"');
  });
});

describe("xml helpers", () => {
  it("reads tags that carry attributes", () => {
    expect(section(`<P currencyID="USD">12.5</P>`, "P")).toBe("12.5");
  });

  it("does not confuse <Item> with <ItemArray>", () => {
    const xml = `<ItemArray><Item>a</Item><Item>b</Item></ItemArray>`;
    expect(sections(xml, "Item")).toEqual(["a", "b"]);
  });

  it("decodes the common entities", () => {
    expect(decodeEntities("a &amp; b &lt; c")).toBe("a & b < c");
  });
});