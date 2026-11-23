import type { SupabaseClient } from "@supabase/supabase-js";
import { EBAY_SCOPES, getEbayApiBase } from "./oauth";
import { fetchAllSellingLists } from "./sellingFetch";
import { syncListingHistory } from "../listings/historyStore";
import type { WatchState } from "../listings/watchState";
import {
  ReconnectRequiredError,
  isExpired,
  isExpiredTokenMessage,
  needsRefresh,
  refreshAccessToken,
} from "./tokenRefresh";

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" | "reconnect_required" | "error"; message: string };

function refreshConfig() {
  return {
    clientId: process.env.EBAY_CLIENT_ID!.trim(),
    clientSecret: process.env.EBAY_CLIENT_SECRET!.trim(),
    apiBase: getEbayApiBase(),
    scopes: EBAY_SCOPES,
  };
}

/**
 * Returns a working eBay access token for this seller, renewing it with the
 * saved refresh token when it is expired or about to expire.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
  options: { force?: boolean } = {}
): Promise<TokenResult> {
  const { data: row } = await supabase
    .from("ebay_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) {
    return { ok: false, reason: "not_connected", message: "Not connected." };
  }

  const stillUsable =
    !options.force && !needsRefresh(row.token_expires_at) && row.access_token;
  if (stillUsable) return { ok: true, accessToken: row.access_token };

  try {
    const fresh = await refreshAccessToken(row.refresh_token, refreshConfig());
    const { error } = await supabase
      .from("ebay_connections")
      .update({
        access_token: fresh.accessToken,
        token_expires_at: fresh.expiresAt,
        ...(fresh.refreshToken ? { refresh_token: fresh.refreshToken } : {}),
      })
      .eq("user_id", userId);
    if (error) {
      console.error("Saving refreshed eBay token failed:", error.message);
    }
    return { ok: true, accessToken: fresh.accessToken };
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      return { ok: false, reason: "reconnect_required", message: err.message };
    }
    console.error("eBay token refresh error:", err);
    // The refresh failed, but the old token may still have time left.
    if (!options.force && row.access_token && !isExpired(row.token_expires_at)) {
      return { ok: true, accessToken: row.access_token };
    }
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Token refresh failed.",
    };
  }
}

export type SellingFetchData = Awaited<ReturnType<typeof fetchAllSellingLists>> & {
  /** Sold/ended items that only our saved history still knows about. */
  fromHistory?: number;
  historyWarning?: string;
  /** Watcher memory per live item (absent if it couldn't be loaded). */
  watchStates?: ReadonlyMap<string, WatchState>;
};

export type SellingListsResult =
  | { status: "ok"; data: SellingFetchData }
  | { status: "not_connected" }
  | { status: "reconnect_required"; message: string }
  | { status: "error"; message: string };

/**
 * Loads all of the seller's listings from eBay. Renews the token first when
 * needed, and if eBay still says the token expired, renews once and retries.
 */
export async function loadSellingListsForUser(
  supabase: SupabaseClient,
  userId: string,
  options: { useHistory?: boolean } = {}
): Promise<SellingListsResult> {
  const result = await loadFromEbay(supabase, userId);
  if (result.status !== "ok" || !options.useHistory) return result;

  // Only save and merge a COMPLETE load, so a partial one can't hide anything.
  if (!result.data.complete) return result;
  const outcome = await syncListingHistory(supabase, userId, result.data.lists);
  return {
    status: "ok",
    data: {
      ...result.data,
      lists: outcome.lists,
      fromHistory: outcome.fromHistory,
      historyWarning: outcome.warning,
      watchStates: outcome.watchStates,
    },
  };
}

async function loadFromEbay(
  supabase: SupabaseClient,
  userId: string
): Promise<SellingListsResult> {
  let token = await getValidAccessToken(supabase, userId);
  if (!token.ok) {
    return token.reason === "not_connected"
      ? { status: "not_connected" }
      : { status: token.reason, message: token.message };
  }

  try {
    return { status: "ok", data: await fetchAllSellingLists(token.accessToken) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read listings.";
    if (!isExpiredTokenMessage(message)) return { status: "error", message };

    token = await getValidAccessToken(supabase, userId, { force: true });
    if (!token.ok) {
      return token.reason === "not_connected"
        ? { status: "not_connected" }
        : { status: token.reason, message: token.message };
    }
    try {
      return { status: "ok", data: await fetchAllSellingLists(token.accessToken) };
    } catch (retryErr) {
      const retryMessage =
        retryErr instanceof Error ? retryErr.message : "Couldn't read listings.";
      return isExpiredTokenMessage(retryMessage)
        ? { status: "reconnect_required", message: retryMessage }
        : { status: "error", message: retryMessage };
    }
  }
}
