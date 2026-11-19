"use server";

import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, loadSellingListsForUser } from "@/lib/ebay/connection";
import {
  isLabelTestCandidate,
  testLabelWrite,
  type LabelWriteResult,
} from "@/lib/ebay/labelWrite";

export type LabelWriteActionResult =
  | { ok: false; error: string }
  | { ok: true; result: LabelWriteResult };

/**
 * Write test on ONE listing the seller picked. The label sent is always the
 * listing's current label as eBay reports it (never text from the browser),
 * so the edit changes nothing.
 */
export async function runLabelWriteTest(
  itemId: string
): Promise<LabelWriteActionResult> {
  if (typeof itemId !== "string" || !/^\d{6,20}$/.test(itemId)) {
    return { ok: false, error: "Pick a listing first." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const loaded = await loadSellingListsForUser(supabase, user.id);
  if (loaded.status === "not_connected") {
    return { ok: false, error: "Your eBay account isn't connected." };
  }
  if (loaded.status === "reconnect_required") {
    return { ok: false, error: "Your eBay connection has expired. Reconnect in Settings." };
  }
  if (loaded.status === "error") {
    return { ok: false, error: `Couldn't load your listings: ${loaded.message}` };
  }

  const record = loaded.data.lists.active.find(
    (r) => r.itemId === itemId && isLabelTestCandidate(r)
  );
  if (!record || !record.sku) {
    return {
      ok: false,
      error: "That listing isn't eligible (it must be live, fixed price and labeled).",
    };
  }

  const token = await getValidAccessToken(supabase, user.id);
  if (!token.ok) {
    return { ok: false, error: "Your eBay connection needs to be renewed. Reconnect in Settings." };
  }

  const result = await testLabelWrite(token.accessToken, record.itemId, record.sku);
  console.log("Label write test:", record.itemId, result.outcome);
  return { ok: true, result };
}
