import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken, loadSellingListsForUser } from "@/lib/ebay/connection";
import { refreshListingDetails } from "@/lib/listings/detailStore";
import { findQualityIssues, type QualityIssue } from "@/lib/audit/qualityRules";
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
  staleListings?: number;
  listingQuality?: number;
  /** Live listings whose content was checked, out of all live listings. */
  detailsChecked?: number;
  detailsTotal?: number;
  /** Set when listing content couldn't be checked this time. */
  detailsNote?: string;
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
  // Listing content (item specifics, photos, description): read a limited
  // batch from eBay each run, so a big shop is covered over a few runs.
  let qualityIssues: QualityIssue[] = [];
  let detailsChecked = 0;
  let detailsNote: string | undefined;
  const token = await getValidAccessToken(supabase, userId);
  if (token.ok) {
    const refreshed = await refreshListingDetails({
      supabase,
      userId,
      accessToken: token.accessToken,
      active: lists.active,
    });
    qualityIssues = findQualityIssues(lists.active, refreshed.details);
    detailsChecked = lists.active.filter((r) => refreshed.details.has(r.itemId)).length;
    if (refreshed.warning) detailsNote = refreshed.warning;
    else if (refreshed.tokenExpired) detailsNote = "eBay asked for a fresh sign-in partway through; the rest will be checked next time.";
    else if (refreshed.failed > 0) detailsNote = `${refreshed.failed} listing${refreshed.failed === 1 ? "" : "s"} couldn't be read from eBay this time.`;
  } else {
    detailsNote = "Listing content wasn't checked because the eBay connection needs attention.";
  }

  const findings = [
    ...runListingRules(lists, { watchStates: fetched.watchStates }),
    ...qualityIssues,
  ];

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
    staleListings: visibleFindings.filter((r) => r.type === "stale_listing")
      .length,
    listingQuality: visibleFindings.filter((r) => r.type === "listing_quality")
      .length,
    detailsChecked,
    detailsTotal: lists.active.length,
    detailsNote,
  };
}
