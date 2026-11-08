// TEMPORARY: used once to capture a real eBay response for building the
// parser and its tests. Delete this file and the debug-sample route after.

const TRADING_URL =
  process.env.EBAY_ENV?.trim().toLowerCase() === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";

const PAGE = `<Pagination><EntriesPerPage>3</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`;

const REQUEST_BODY = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList><Include>true</Include>${PAGE}</ActiveList>
  <SoldList><Include>true</Include><DurationInDays>60</DurationInDays>${PAGE}</SoldList>
  <UnsoldList><Include>true</Include><DurationInDays>60</DurationInDays>${PAGE}</UnsoldList>
</GetMyeBaySellingRequest>`;

// Removes the parts that identify people. Always eyeball the result too.
export function redact(xml: string): string {
  return xml
    .replace(/<Buyer>[\s\S]*?<\/Buyer>/g, "<Buyer>REDACTED</Buyer>")
    .replace(/<BuyerInfo>[\s\S]*?<\/BuyerInfo>/g, "<BuyerInfo>REDACTED</BuyerInfo>")
    .replace(
      /<ShippingAddress>[\s\S]*?<\/ShippingAddress>/g,
      "<ShippingAddress>REDACTED</ShippingAddress>"
    )
    .replace(/<Email>[\s\S]*?<\/Email>/g, "<Email>REDACTED</Email>")
    .replace(/<UserID>[\s\S]*?<\/UserID>/g, "<UserID>REDACTED</UserID>")
    .replace(/<EIASToken>[\s\S]*?<\/EIASToken>/g, "<EIASToken>REDACTED</EIASToken>");
}

export async function getSellingSampleXml(accessToken: string): Promise<string> {
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
  return redact(await res.text());
}