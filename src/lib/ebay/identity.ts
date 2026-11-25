import type { SupabaseClient } from "@supabase/supabase-js";
import { text } from "./xml";
import { parseTradingResult } from "./labelWrite";
import { tradingUrl } from "./itemDetails";

export interface EbayIdentity {
  /** eBay user name, lower-cased (eBay user names are not case sensitive). */
  username: string;
  eiasToken: string | null;
}

export function buildGetUserRequest(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
</GetUserRequest>`;
}

/** Reads a GetUser reply. Null when it has no user name. */
export function parseGetUser(xml: string): EbayIdentity | null {
  const username = text(xml, "UserID")?.trim().toLowerCase();
  if (!username) return null;
  return { username, eiasToken: text(xml, "EIASToken")?.trim() || null };
}

export async function fetchEbayIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<EbayIdentity | null> {
  try {
    const res = await fetchImpl(tradingUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1475",
        "X-EBAY-API-CALL-NAME": "GetUser",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body: buildGetUserRequest(),
    });
    const xml = await res.text();
    if (!parseTradingResult(xml).ok) return null;
    return parseGetUser(xml);
  } catch {
    return null;
  }
}

/**
 * Saves the seller's eBay identity on their connection if it isn't there yet.
 * Best effort: never throws, because it is only bookkeeping.
 */
export async function ensureEbayIdentity(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  try {
    const { data: row } = await supabase
      .from("ebay_connections")
      .select("ebay_username")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row || row.ebay_username) return;
    const identity = await fetchEbayIdentity(accessToken, fetchImpl);
    if (!identity) return;
    await supabase
      .from("ebay_connections")
      .update({ ebay_username: identity.username, ebay_eias_token: identity.eiasToken })
      .eq("user_id", userId);
  } catch (err) {
    console.error("Saving eBay identity failed:", err instanceof Error ? err.message : err);
  }
}
