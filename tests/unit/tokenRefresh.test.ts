import { describe, it, expect } from "vitest";
import {
  REFRESH_BUFFER_MS,
  ReconnectRequiredError,
  isExpired,
  isExpiredTokenMessage,
  needsRefresh,
  refreshAccessToken,
  type RefreshConfig,
} from "../../src/lib/ebay/tokenRefresh";

const NOW = new Date("2026-11-18T12:00:00Z");
const CONFIG: RefreshConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  apiBase: "https://api.ebay.com",
  scopes: ["https://api.ebay.com/oauth/api_scope/sell.inventory"],
};

function iso(msFromNow: number): string {
  return new Date(NOW.getTime() + msFromNow).toISOString();
}

function fakeFetch(status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []) {
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return impl;
}

describe("needsRefresh / isExpired", () => {
  it("needs a refresh with no expiry time", () => {
    expect(needsRefresh(null, NOW)).toBe(true);
    expect(needsRefresh(undefined, NOW)).toBe(true);
    expect(needsRefresh("garbage", NOW)).toBe(true);
  });

  it("needs a refresh when expired or within the 5 minute buffer", () => {
    expect(needsRefresh(iso(-1000), NOW)).toBe(true);
    expect(needsRefresh(iso(REFRESH_BUFFER_MS), NOW)).toBe(true);
    expect(needsRefresh(iso(REFRESH_BUFFER_MS - 1000), NOW)).toBe(true);
  });

  it("does not refresh a token with plenty of time left", () => {
    expect(needsRefresh(iso(60 * 60 * 1000), NOW)).toBe(false);
  });

  it("knows when a token has really expired", () => {
    expect(isExpired(iso(-1), NOW)).toBe(true);
    expect(isExpired(iso(1000), NOW)).toBe(false);
    expect(isExpired(null, NOW)).toBe(true);
  });
});

describe("isExpiredTokenMessage", () => {
  it("recognizes eBay's expired-token errors", () => {
    expect(isExpiredTokenMessage("eBay Trading API error 932: Auth token is hard expired")).toBe(true);
    expect(isExpiredTokenMessage("eBay Trading API error 931: Auth token is invalid")).toBe(true);
    expect(isExpiredTokenMessage("Invalid access token")).toBe(true);
  });
  it("ignores other errors", () => {
    expect(isExpiredTokenMessage("eBay Trading API HTTP 500: server error")).toBe(false);
    expect(isExpiredTokenMessage("eBay Trading API error 10007: Internal error")).toBe(false);
  });
});

describe("refreshAccessToken", () => {
  it("asks eBay for a new token the way eBay documents it", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await refreshAccessToken(
      "REFRESH",
      CONFIG,
      fakeFetch(200, { access_token: "NEW", expires_in: 7200 }, calls),
      NOW
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect(calls[0]?.init.method).toBe("POST");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`
    );
    const body = calls[0]?.init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("REFRESH");
    expect(body.get("scope")).toBe(CONFIG.scopes.join(" "));
  });

  it("returns the new token and its expiry time", async () => {
    const result = await refreshAccessToken(
      "REFRESH",
      CONFIG,
      fakeFetch(200, { access_token: "NEW", expires_in: 7200 }),
      NOW
    );
    expect(result.accessToken).toBe("NEW");
    expect(result.expiresAt).toBe("2026-11-18T14:00:00.000Z");
    expect(result.refreshToken).toBeNull();
  });

  it("keeps a new refresh token if eBay sends one", async () => {
    const result = await refreshAccessToken(
      "REFRESH",
      CONFIG,
      fakeFetch(200, { access_token: "NEW", expires_in: 7200, refresh_token: "R2" }),
      NOW
    );
    expect(result.refreshToken).toBe("R2");
  });

  it("asks for a reconnect when eBay says invalid_grant", async () => {
    await expect(
      refreshAccessToken(
        "REFRESH",
        CONFIG,
        fakeFetch(400, { error: "invalid_grant" }),
        NOW
      )
    ).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("asks for a reconnect when there is no refresh token", async () => {
    await expect(
      refreshAccessToken("", CONFIG, fakeFetch(200, {}), NOW)
    ).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("reports other failures without asking for a reconnect", async () => {
    const attempt = refreshAccessToken(
      "REFRESH",
      CONFIG,
      fakeFetch(500, { error: "server_error" }),
      NOW
    );
    await expect(attempt).rejects.toThrow("eBay token refresh failed (server_error)");
    await expect(attempt).rejects.not.toBeInstanceOf(ReconnectRequiredError);
  });

  it("rejects a success response with no token", async () => {
    await expect(
      refreshAccessToken("REFRESH", CONFIG, fakeFetch(200, { expires_in: 7200 }), NOW)
    ).rejects.toThrow("no access token");
    await expect(
      refreshAccessToken("REFRESH", CONFIG, fakeFetch(200, { access_token: "X" }), NOW)
    ).rejects.toThrow("no expiry");
  });

  it("never puts the refresh token in an error message", async () => {
    try {
      await refreshAccessToken(
        "SECRET-REFRESH-VALUE",
        CONFIG,
        fakeFetch(500, { error: "server_error", error_description: "SECRET-REFRESH-VALUE" }),
        NOW
      );
    } catch (err) {
      expect(String(err)).not.toContain("SECRET-REFRESH-VALUE");
    }
  });
});
