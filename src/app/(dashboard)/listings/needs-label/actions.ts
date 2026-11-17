"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_ITEMS = 500;

function itemIdsFrom(formData: FormData): string[] {
  const ids = formData
    .getAll("itemId")
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  if (ids.length === 0 || ids.length > MAX_ITEMS) {
    throw new Error("Nothing to save.");
  }
  return ids;
}

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/** "Yes, these old listings are the item with this label." Saved here only; nothing changes on eBay. */
export async function confirmLabel(formData: FormData): Promise<void> {
  const label = String(formData.get("label") ?? "").trim();
  if (!label || label.length > 80) throw new Error("Missing label.");
  const itemIds = itemIdsFrom(formData);

  const { supabase, userId } = await currentUserId();
  const { error } = await supabase.from("label_links").upsert(
    itemIds.map((itemId) => ({
      user_id: userId,
      item_id: itemId,
      status: "confirmed",
      label,
    })),
    { onConflict: "user_id,item_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/listings/needs-label");
}

/** "No, these are not the same item." */
export async function rejectItems(formData: FormData): Promise<void> {
  const itemIds = itemIdsFrom(formData);

  const { supabase, userId } = await currentUserId();
  const { error } = await supabase.from("label_links").upsert(
    itemIds.map((itemId) => ({
      user_id: userId,
      item_id: itemId,
      status: "rejected",
      label: null,
    })),
    { onConflict: "user_id,item_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/listings/needs-label");
}

/** Takes back an answer. */
export async function undoAnswer(formData: FormData): Promise<void> {
  const itemIds = itemIdsFrom(formData);

  const { supabase, userId } = await currentUserId();
  const { error } = await supabase
    .from("label_links")
    .delete()
    .eq("user_id", userId)
    .in("item_id", itemIds);
  if (error) throw new Error(error.message);
  revalidatePath("/listings/needs-label");
}
