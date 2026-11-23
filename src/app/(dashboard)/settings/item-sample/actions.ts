"use server";

import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/ebay/connection";
import { fetchItemXml, outlineXml, parseItemDetails } from "@/lib/ebay/itemDetails";

export type InspectResult =
  | { ok: false; error: string }
  | {
      ok: true;
      outline: string;
      summary: {
        photos: number;
        descriptionCharacters: number;
        specifics: { name: string; values: string[] }[];
      };
    };

/** Reads one of the seller's own listings and shows what eBay sent (text hidden). */
export async function inspectListing(itemId: string): Promise<InspectResult> {
  if (typeof itemId !== "string" || !/^\d{6,20}$/.test(itemId)) {
    return { ok: false, error: "Pick a listing first." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const token = await getValidAccessToken(supabase, user.id);
  if (!token.ok) {
    return { ok: false, error: "Your eBay connection needs attention. Check Settings." };
  }
  try {
    const xml = await fetchItemXml(token.accessToken, itemId);
    const details = parseItemDetails(xml);
    if (!details) {
      return { ok: false, error: "eBay's reply didn't contain a listing. Outline:\n" + outlineXml(xml, 40) };
    }
    return {
      ok: true,
      outline: outlineXml(xml),
      summary: {
        photos: details.pictureCount,
        descriptionCharacters: details.descriptionLength,
        specifics: details.specifics,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach eBay." };
  }
}
