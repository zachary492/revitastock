import { parseSellingLists, type ListingRecord, type SellingLists } from "./sellingLists";
import { section, text } from "./xml";

// How many items to ask for per page, and a safety limit on pages per list
// (50 pages x 100 items = 5,000 items per list).
export const ENTRIES_PER_PAGE = 100;
export const MAX_PAGES = 50;

type ListKey = "active" | "sold" | "unsold";

const LIST_TAGS: Record<ListKey, string> = {
  active: "ActiveList",
  sold: "SoldList",
  unsold: "UnsoldList",
};

function tradingUrl(): string {
  return process.env.EBAY_ENV?.trim().toLowerCase() === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";
}

/**
 * Builds the GetMyeBaySelling request for one page. Lists we don't need on
 * this page are switched off explicitly, so we never re-download them.
 */
export function buildSellingRequest(
  page: number,
  wanted: Record<ListKey, boolean> = { active: true, sold: true, unsold: true },
  entriesPerPage: number = ENTRIES_PER_PAGE
): string {
  const pagination = `<Pagination><EntriesPerPage>${entriesPerPage}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>`;
  const list = (key: ListKey, days?: number) => {
    const tag = LIST_TAGS[key];
    if (!wanted[key]) return `<${tag}><Include>false</Include></${tag}>`;
    const duration = days ? `<DurationInDays>${days}</DurationInDays>` : "";
    return `<${tag}><Include>true</Include>${duration}${pagination}</${tag}>`;
  };

  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  ${list("active")}
  ${list("sold", 60)}
  ${list("unsold", 60)}
</GetMyeBaySellingRequest>`;
}

export interface ListPaging {
  pages: number;
  entries: number;
}

/** Reads how many pages and entries eBay says each list has. */
export function parsePaging(xml: string): Record<ListKey, ListPaging> {
  const read = (key: ListKey): ListPaging => {
    const list = section(xml, LIST_TAGS[key]) ?? "";
    const paging = section(list, "PaginationResult") ?? "";
    return {
      pages: Number(text(paging, "TotalNumberOfPages") ?? 0),
      entries: Number(text(paging, "TotalNumberOfEntries") ?? 0),
    };
  };
  return { active: read("active"), sold: read("sold"), unsold: read("unsold") };
}

export interface SellingFetchResult {
  lists: SellingLists;
  /** What eBay says each list holds in total. */
  totals: { active: number; sold: number; endedUnsold: number };
  /** True when we loaded everything eBay said exists. */
  complete: boolean;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch; // for tests
  maxPages?: number;
}

function addUnique(target: ListingRecord[], incoming: ListingRecord[]): void {
  const seen = new Set(
    target.map((r) => `${r.status}|${r.itemId}|${r.soldAt ?? ""}`)
  );
  for (const record of incoming) {
    const key = `${record.status}|${record.itemId}|${record.soldAt ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      target.push(record);
    }
  }
}

/** Loads every page of the active, sold and ended-unsold lists. */
export async function fetchAllSellingLists(
  accessToken: string,
  options: FetchOptions = {}
): Promise<SellingFetchResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? MAX_PAGES;

  const call = async (
    page: number,
    wanted?: Record<ListKey, boolean>
  ): Promise<string> => {
    const res = await doFetch(tradingUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1475",
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body: buildSellingRequest(page, wanted),
    });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(
        `eBay Trading API HTTP ${res.status}: ${body.slice(0, 300)}`
      );
    }
    return body;
  };

  const firstXml = await call(1);
  const paging = parsePaging(firstXml);
  const first = parseSellingLists(firstXml); // throws if eBay reported failure

  const lists: SellingLists = { active: [], sold: [], endedUnsold: [] };
  addUnique(lists.active, first.active);
  addUnique(lists.sold, first.sold);
  addUnique(lists.endedUnsold, first.endedUnsold);

  const lastPage = Math.min(
    maxPages,
    Math.max(paging.active.pages, paging.sold.pages, paging.unsold.pages)
  );

  for (let page = 2; page <= lastPage; page++) {
    const wanted = {
      active: page <= Math.min(paging.active.pages, maxPages),
      sold: page <= Math.min(paging.sold.pages, maxPages),
      unsold: page <= Math.min(paging.unsold.pages, maxPages),
    };
    const next = parseSellingLists(await call(page, wanted));
    addUnique(lists.active, next.active);
    addUnique(lists.sold, next.sold);
    addUnique(lists.endedUnsold, next.endedUnsold);
  }

  const totals = {
    active: paging.active.entries,
    sold: paging.sold.entries,
    endedUnsold: paging.unsold.entries,
  };
  const complete =
    lists.active.length >= totals.active &&
    lists.sold.length >= totals.sold &&
    lists.endedUnsold.length >= totals.endedUnsold;

  return { lists, totals, complete };
}