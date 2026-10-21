const TRADING_URL =
  process.env.EBAY_ENV === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";

export interface SellingCounts {
  active: number;
  sold: number;
  unsold: number;
}

function section(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1] ?? null;
}

function totalEntries(xml: string, listTag: string): number {
  const list = section(xml, listTag);
  if (!list) return 0;
  const match = list.match(
    /<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/
  );
  return match?.[1] ? Number(match[1]) : 0;
}

export function parseSellingCounts(xml: string): SellingCounts {
  const ack = section(xml, "Ack");
  if (ack === "Failure") {
    const code = section(xml, "ErrorCode") ?? "?";
    const message =
      section(xml, "LongMessage") ?? section(xml, "ShortMessage") ?? "unknown";
    throw new Error(`eBay Trading API error ${code}: ${message}`);
  }

  return {
    active: totalEntries(xml, "ActiveList"),
    sold: totalEntries(xml, "SoldList"),
    unsold: totalEntries(xml, "UnsoldList"),
  };
}

const PAGE = `<Pagination><EntriesPerPage>5</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`;

const REQUEST_BODY = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList><Include>true</Include>${PAGE}</ActiveList>
  <SoldList><Include>true</Include><DurationInDays>60</DurationInDays>${PAGE}</SoldList>
  <UnsoldList><Include>true</Include><DurationInDays>60</DurationInDays>${PAGE}</UnsoldList>
</GetMyeBaySellingRequest>`;

export async function getSellingCounts(
  accessToken: string
): Promise<SellingCounts> {
  const res = await fetch(TRADING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1475",
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-IAF-TOKEN": accessToken,
    },
    body: REQUEST_BODY,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`eBay Trading API HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return parseSellingCounts(text);
}