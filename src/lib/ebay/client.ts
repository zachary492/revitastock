const EBAY_API_BASE =
  process.env.EBAY_ENV === "production"
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";

interface EbayFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
}

export async function ebayFetch<T>({
  method = "GET",
  path,
  accessToken,
  body,
}: EbayFetchOptions): Promise<T> {
  const res = await fetch(`${EBAY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`eBay API error (${res.status}): ${errorBody}`);
  }

  return res.json() as Promise<T>;
}

// TODO: token refresh flow (src/lib/ebay/oauth.ts)
// TODO: getInventoryItem / updateInventoryItem wrappers (src/lib/ebay/inventory.ts)
