import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSellingListsForUser } from "@/lib/ebay/connection";
import { applyLabelLinks, type LabelLink } from "@/lib/listings/labelLinks";
import { runListingRules } from "@/lib/audit/listingRules";
import { findingToRow, LISTING_RULE_TYPES } from "@/lib/audit/findingRows";
import { findingKey, withoutDismissed } from "@/lib/audit/explain";

export interface ListingAuditResult {
  success: boolean;
  error?: string;
  code?: "not_connected" | "reconnect_required" | "incomplete" | "error";
  listingsChecked?: number;
  soldButStillActive?: number;
  endedNeverRelisted?: number;
}

/**
 * The audit for one seller: loads their listings (saving history), runs the
 * rules and replaces their open findings. Works with a signed-in client or,
 * for the daily job, the admin client, so every query filters by userId.
 */
export async function runListingAuditForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ListingAuditResult> {
  const loaded = await loadSellingListsForUser(supabase, userId, {
    useHistory: true,
  });

  if (loaded.status === "not_connected") {
    return {
      success: false,
      code: "not_connected",
      error: "Your eBay account isn't connected yet. Connect it in Settings.",
    };
  }
  if (loaded.status === "reconnect_required") {
    return {
      success: false,
      code: "reconnect_required",
      error:
        "Your eBay connection has expired and couldn't be renewed automatically. Reconnect in Settings, then run the audit again.",
    };
  }
  if (loaded.status === "error") {
    return {
      success: false,
      code: "error",
      error: `Couldn't load your listings: ${loaded.message}`,
    };
  }
  const fetched = loaded.data;

  // A partial list would create false alarms, so stop instead.
  if (!fetched.complete) {
    return {
      success: false,
      code: "incomplete",
      error:
        "Not every listing could be loaded from eBay, so the audit was not run. Try again in a minute.",
    };
  }

  const { data: linkRows, error: linkError } = await supabase
    .from("label_links")
    .select("item_id, status, label")
    .eq("user_id", userId);
  if (linkError) {
    return { success: false, error: linkError.message };
  }
  const links: LabelLink[] = (linkRows ?? []).map((row) => ({
    itemId: row.item_id,
    status: row.status,
    label: row.label,
  }));

  const lists = applyLabelLinks(fetched.lists, links);
  const findings = runListingRules(lists);

  // Replace the previous open results of these two types only.
  const { error: deleteError } = await supabase
    .from("discrepancies")
    .delete()
    .eq("user_id", userId)
    .eq("resolved", false)
    .in("type", LISTING_RULE_TYPES);
  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Problems the seller already dismissed stay hidden.
  const { data: dismissedRows, error: dismissedError } = await supabase
    .from("discrepancies")
    .select("type, sku, listing_id")
    .eq("user_id", userId)
    .eq("resolved", true)
    .in("type", LISTING_RULE_TYPES);
  if (dismissedError) {
    return { success: false, error: dismissedError.message };
  }
  const dismissedKeys = new Set<string>(
    (dismissedRows ?? []).map((row) =>
      findingKey(row.type, row.sku, row.listing_id)
    )
  );
  const visibleFindings = withoutDismissed(
    findings.map(findingToRow),
    dismissedKeys
  );

  if (visibleFindings.length > 0) {
    const { error: insertError } = await supabase.from("discrepancies").insert(
      visibleFindings.map((row) => ({ user_id: userId, ...row }))
    );
    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  return {
    success: true,
    listingsChecked:
      lists.active.length + lists.sold.length + lists.endedUnsold.length,
    soldButStillActive: visibleFindings.filter(
      (r) => r.type === "sold_but_still_active"
    ).length,
    endedNeverRelisted: visibleFindings.filter(
      (r) => r.type === "ended_never_relisted"
    ).length,
  };
}
