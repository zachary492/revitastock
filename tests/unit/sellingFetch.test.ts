import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildSellingRequest,
  fetchAllSellingLists,
  parsePaging,
} from "../../src/lib/ebay/sellingFetch";

const sample = readFileSync(
  join(__dirname, "../fixtures/selling-sample.xml"),
  "utf8"
);

// Same real response, but with the paging numbers we want to test. The real
// sample holds 3 items per list.
function withPaging(xml: string, pages: number, entries: number): string {
  return xml
    .replace(/<TotalNumberOfPages>\d+<\/TotalNumberOfPages>/g, `<TotalNumberOfPages>${pages}</TotalNumberOfPages>`)
    .replace(/<TotalNumberOfEntries>\d+<\/TotalNumberOfEntries>/g, `<TotalNumberOfEntries>${entries}</TotalNumberOfEntries>`);
}

// Same sample with every Item ID changed, to stand in for "the next page".
function nextPage(xml: string): string {
  return xml.replace(/10000000000/g, "20000000000");
}

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function fakeFetch(bodies: string[]) {
  const requests: string[] = [];
  let i = 0;
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(String(init?.body));
    const body = bodies[Math.min(i, bodies.length - 1)] ?? "";
    i++;
    return okResponse(body);
  }) as typeof fetch;
  return { impl, requests };
}

describe("buildSellingRequest", () => {
  it("asks for the right page and size", () => {
    const xml = buildSellingRequest(3, undefined, 100);
    expect(xml).toContain("<PageNumber>3</PageNumber>");
    expect(xml).toContain("<EntriesPerPage>100</EntriesPerPage>");
    expect(xml).toContain("<DurationInDays>60</DurationInDays>");
  });

  it("switches off lists we don't need", () => {
    const xml = buildSellingRequest(2, { active: false, sold: false, unsold: true });
    expect(xml).toContain("<ActiveList><Include>false</Include></ActiveList>");
    expect(xml).toContain("<SoldList><Include>false</Include></SoldList>");
    expect(xml).toContain("<UnsoldList><Include>true</Include>");
    expect(xml).toContain("<PageNumber>2</PageNumber>");
  });
});

describe("parsePaging", () => {
  it("reads pages and entries for each list", () => {
    const paging = parsePaging(withPaging(sample, 4, 11));
    expect(paging.active).toEqual({ pages: 4, entries: 11 });
    expect(paging.sold).toEqual({ pages: 4, entries: 11 });
    expect(paging.unsold).toEqual({ pages: 4, entries: 11 });
  });

  it("treats a missing list as empty", () => {
    const xml = `<R><Ack>Success</Ack></R>`;
    expect(parsePaging(xml).active).toEqual({ pages: 0, entries: 0 });
  });
});

describe("fetchAllSellingLists", () => {
  it("makes one call when everything fits on one page", async () => {
    const { impl, requests } = fakeFetch([withPaging(sample, 1, 3)]);
    const result = await fetchAllSellingLists("token", { fetchImpl: impl });
    expect(requests).toHaveLength(1);
    expect(result.lists.active).toHaveLength(3);
    expect(result.lists.sold).toHaveLength(3);
    expect(result.lists.endedUnsold).toHaveLength(3);
    expect(result.complete).toBe(true);
  });

  it("keeps asking until every page is loaded", async () => {
    const { impl, requests } = fakeFetch([
      withPaging(sample, 2, 6),
      withPaging(nextPage(sample), 2, 6),
    ]);
    const result = await fetchAllSellingLists("token", { fetchImpl: impl });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("<PageNumber>2</PageNumber>");
    expect(result.lists.active).toHaveLength(6);
    expect(result.lists.sold).toHaveLength(6);
    expect(result.lists.endedUnsold).toHaveLength(6);
    expect(result.totals).toEqual({ active: 6, sold: 6, endedUnsold: 6 });
    expect(result.complete).toBe(true);
  });

  it("only re-requests lists that still have pages", async () => {
    // active and sold have 1 page; ended-unsold has 2.
    const page1 = sample
      .replace(
        /(<ActiveList>[\s\S]*?<TotalNumberOfPages>)\d+/,
        "$11"
      )
      .replace(
        /(<SoldList>[\s\S]*?<TotalNumberOfPages>)\d+/,
        "$11"
      )
      .replace(
        /(<UnsoldList>[\s\S]*?<TotalNumberOfPages>)\d+/,
        "$12"
      );
    // The second answer only carries the ended-unsold list.
    const unsoldOnly = nextPage(sample).match(/<UnsoldList>[\s\S]*<\/UnsoldList>/)?.[0] ?? "";
    const page2 = `<GetMyeBaySellingResponse><Ack>Success</Ack>${unsoldOnly}</GetMyeBaySellingResponse>`;

    const { impl, requests } = fakeFetch([page1, page2]);
    const result = await fetchAllSellingLists("token", { fetchImpl: impl });

    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("<ActiveList><Include>false</Include></ActiveList>");
    expect(requests[1]).toContain("<SoldList><Include>false</Include></SoldList>");
    expect(result.lists.active).toHaveLength(3);
    expect(result.lists.sold).toHaveLength(3);
    expect(result.lists.endedUnsold).toHaveLength(6);
  });

  it("does not list an item twice if pages overlap", async () => {
    const same = withPaging(sample, 2, 3);
    const { impl } = fakeFetch([same, same]);
    const result = await fetchAllSellingLists("token", { fetchImpl: impl });
    expect(result.lists.active).toHaveLength(3);
    expect(result.lists.sold).toHaveLength(3);
  });

  it("stops at the page limit and says it is incomplete", async () => {
    const { impl, requests } = fakeFetch([
      withPaging(sample, 5, 15),
      withPaging(nextPage(sample), 5, 15),
    ]);
    const result = await fetchAllSellingLists("token", {
      fetchImpl: impl,
      maxPages: 2,
    });
    expect(requests).toHaveLength(2);
    expect(result.complete).toBe(false);
  });

  it("throws when eBay answers with an HTTP error", async () => {
    const impl = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    await expect(
      fetchAllSellingLists("token", { fetchImpl: impl })
    ).rejects.toThrow("eBay Trading API HTTP 503");
  });

  it("throws eBay's own message when a later page fails", async () => {
    const failure = `<GetMyeBaySellingResponse><Ack>Failure</Ack><Errors>
      <LongMessage>Auth token is hard expired.</LongMessage><ErrorCode>932</ErrorCode>
      </Errors></GetMyeBaySellingResponse>`;
    const { impl } = fakeFetch([withPaging(sample, 2, 6), failure]);
    await expect(
      fetchAllSellingLists("token", { fetchImpl: impl })
    ).rejects.toThrow("eBay Trading API error 932: Auth token is hard expired.");
  });
});