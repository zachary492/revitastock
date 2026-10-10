"use server";

import { createClient } from "@/lib/supabase/server";
import { findDiscrepancies } from "@/lib/matching/findDiscrepancies";
import { mockLiveListings } from "@/lib/ebay/mockListings";
import type { PhysicalInventoryRecord } from "@/types/inventory";

export interface RunAuditResult {
  success: boolean;
  error?: string;
  ghostListings?: number;
  phantomDrops?: number;
  quantityMismatches?: number;
  inSync?: number;
  unlistedInventory?: number;
  unknownListings?: number;
}

export async function runAudit(): Promise<RunAuditResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in." };
  }

  // Oldest first, so the NEWEST upload wins when a SKU appears twice.
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("physical_inventory")
    .select("sku, quantity, title, location")
    .order("uploaded_at", { ascending: true });

  if (inventoryError) {
    return { success: false, error: inventoryError.message };
  }

  if (!inventoryRows || inventoryRows.length === 0) {
    return {
      success: false,
      error: "No inventory found. Upload and save a CSV first.",
    };
  }

  const physical: PhysicalInventoryRecord[] = inventoryRows.map((row) => ({
    sku: row.sku,
    quantity: row.quantity,
    title: row.title ?? undefined,
    location: row.location ?? undefined,
  }));

  // TODAY: sample listings. LATER: swap this for a real eBay fetch.
  const result = findDiscrepancies(physical, mockLiveListings);

  // Clear this seller's previous unresolved results...
  const { error: deleteError } = await supabase
    .from("discrepancies")
    .delete()
    .eq("user_id", user.id)
    .eq("resolved", false);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // ...then save the fresh ones.
  if (result.discrepancies.length > 0) {
    const rowsToInsert = result.discrepancies.map((d) => ({
      user_id: user.id,
      sku: d.sku,
      type: d.type,
      physical_quantity: d.physicalQuantity,
      live_quantity: d.liveQuantity,
      listing_id: d.listingId,
    }));

    const { error: insertError } = await supabase
      .from("discrepancies")
      .insert(rowsToInsert);

    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  return {
    success: true,
    ghostListings: result.discrepancies.filter((d) => d.type === "ghost_listing").length,
    phantomDrops: result.discrepancies.filter((d) => d.type === "phantom_drop").length,
    quantityMismatches: result.discrepancies.filter((d) => d.type === "quantity_mismatch").length,
    inSync: result.inSync.length,
    unlistedInventory: result.unlistedInventory.length,
    unknownListings: result.unknownListings.length,
  };
}