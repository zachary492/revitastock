"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllSellingLists } from "@/lib/ebay/sellingFetch";
import { applyLabelLinks, type LabelLink } from "@/lib/listings/labelLinks";
import { runListingRules } from "@/lib/audit/listingRules";
import { findingToRow, LISTING_RULE_TYPES } from "@/lib/audit/findingRows";
import { findingKey, withoutDismissed } from "@/lib/audit/explain";

export interface ListingAuditResult {
  success: boolean;
  error?: string;
  listingsChecked?: number;
  soldButStillActive?: number;
  endedNeverRelisted?: number;
}

/** Audit based on the seller's eBay listings. No CSV needed. */
export async function runListingAudit(): Promise<ListingAuditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in." };
  }

  const { data: connection } = await supabase
    .from("ebay_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return {
      success: false,
      error: "Your eBay account isn't connected yet. Connect it in Settings.",
    };
  }

  let fetched;
  try {
    fetched = await fetchAllSellingLists(connection.access_token);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read your listings.";
    return {
      success: false,
      error: /932|expired/i.test(message)
        ? "Your eBay connection has expired. Reconnect in Settings, then run the audit again."
        : `Couldn't load your listings: ${message}`,
    };
  }

  // A partial list would create false alarms, so stop instead.
  if (!fetched.complete) {
    return {
      success: false,
      error:
        "Not every listing could be loaded from eBay, so the audit was not run. Try again in a minute.",
    };
  }

  const { data: linkRows, error: linkError } = await supabase
    .from("label_links")
    .select("item_id, status, label");
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
    .eq("user_id", user.id)
    .eq("resolved", false)
    .in("type", LISTING_RULE_TYPES);
  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Problems the seller already dismissed stay hidden.
  const { data: dismissedRows, error: dismissedError } = await supabase
    .from("discrepancies")
    .select("type, sku, listing_id")
    .eq("user_id", user.id)
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
      visibleFindings.map((row) => ({ user_id: user.id, ...row }))
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
