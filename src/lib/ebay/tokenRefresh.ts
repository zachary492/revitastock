/** Renew a little early so a request never starts with a token about to expire. */
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface RefreshConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string; // https://api.ebay.com
  scopes: string[];
}

export interface RefreshedToken {
  accessToken: string;
  expiresAt: string; // ISO time
  /** Only set if eBay sent a new refresh token (it normally does not). */
  refreshToken: string | null;
}

/** The refresh token no longer works. The seller has to click Reconnect. */
export class ReconnectRequiredError extends Error {
  constructor(message = "eBay connection must be renewed.") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

/** True if the access token is missing an expiry, expired, or about to expire. */
export function needsRefresh(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return true;
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return true;
  return expires - now.getTime() <= REFRESH_BUFFER_MS;
}

/** True once the expiry time has actually passed. */
export function isExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return true;
  const expires = Date.parse(expiresAt);
  return Number.isNaN(expires) || expires <= now.getTime();
}

/** Does this eBay error message mean "the access token is no longer good"? */
export function isExpiredTokenMessage(message: string): boolean {
  return /\b93[12]\b|hard expired|invalid access token|token.*expired/i.test(
    message
  );
}

/**
 * Asks eBay for a fresh 2-hour access token using the long-lived refresh token.
 * (eBay: POST /identity/v1/oauth2/token with grant_type=refresh_token.)
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: RefreshConfig,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date()
): Promise<RefreshedToken> {
  if (!refreshToken) throw new ReconnectRequiredError();

  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64");

  const res = await fetchImpl(`${config.apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: config.scopes.join(" "),
    }),
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // not JSON; handled below
  }

  if (!res.ok) {
    const code = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    // invalid_grant: expired, revoked, or issued to another app. Needs a new sign-in.
    if (code === "invalid_grant" || res.status === 401) {
      throw new ReconnectRequiredError(`eBay refused the saved sign-in (${code}).`);
    }
    throw new Error(`eBay token refresh failed (${code}).`);
  }

  const accessToken = body.access_token;
  const expiresIn = body.expires_in;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("eBay token refresh gave no access token.");
  }
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
    throw new Error("eBay token refresh gave no expiry time.");
  }

  return {
    accessToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    refreshToken:
      typeof body.refresh_token === "string" && body.refresh_token
        ? body.refresh_token
        : null,
  };
}
