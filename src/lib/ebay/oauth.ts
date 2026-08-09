const EBAY_AUTH_BASE =
  process.env.EBAY_ENV === "production"
    ? "https://auth.ebay.com"
    : "https://auth.sandbox.ebay.com";

const EBAY_API_BASE =
  process.env.EBAY_ENV === "production"
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";

// Minimal scope for now — just enough to read/write inventory items.
// Add more scopes here later as features need them (e.g. fulfillment
// for sold-orders tracking).
const SCOPES = ["https://api.ebay.com/oauth/api_scope/sell.inventory"];

/**
 * Builds the URL to send a seller to, to start connecting their eBay
 * account. eBay does NOT accept a raw callback URL here — it uses a
 * "RuName" (configured in the eBay Developer Portal under
 * Application Keys > User Tokens), which eBay resolves to the real
 * Auth Accepted URL on their end.
 */
export function getEbayAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID!,
    redirect_uri: process.env.EBAY_RUNAME!, // yes, the RuName, not a URL
    response_type: "code",
    scope: SCOPES.join(" "),
  });

  return `${EBAY_AUTH_BASE}/oauth2/authorize?${params.toString()}`;
}

export interface EbayTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

/**
 * Exchanges the short-lived authorization code eBay hands back (via the
 * callback redirect) for a real access token + refresh token.
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<EbayTokenResponse> {
  const basicAuth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: decodeURIComponent(code),
      redirect_uri: process.env.EBAY_RUNAME!,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`eBay token exchange failed (${res.status}): ${errorBody}`);
  }

  return res.json();
}
