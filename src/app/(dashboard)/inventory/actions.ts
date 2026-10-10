"use server";

import { createClient } from "@/lib/supabase/server";
import type { PhysicalInventoryRecord } from "@/types/inventory";

export interface SaveInventoryResult {
  success: boolean;
  savedCount: number;
  error?: string;
}

/**
 * Saves validated inventory rows into the physical_inventory table for
 * the currently signed-in seller. Each upload appends new rows — it does
 * not delete or overwrite previous uploads. (Deduping/replacing on
 * re-upload is a real future decision, noted in CLAUDE.md, not solved
 * here.)
 */
export async function saveInventoryRows(
  rows: PhysicalInventoryRecord[]
): Promise<SaveInventoryResult> {
  if (rows.length === 0) {
    return { success: false, savedCount: 0, error: "No rows to save." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, savedCount: 0, error: "Not signed in." };
  }

  const rowsToInsert = rows.map((row) => ({
    user_id: user.id,
    sku: row.sku,
    quantity: row.quantity,
    title: row.title ?? null,
    location: row.location ?? null,
  }));

  const { error } = await supabase
    .from("physical_inventory")
    .insert(rowsToInsert);

  if (error) {
    return { success: false, savedCount: 0, error: error.message };
  }

  return { success: true, savedCount: rowsToInsert.length };
}
