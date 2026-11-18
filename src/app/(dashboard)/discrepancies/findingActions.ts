"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function setDismissed(formData: FormData, dismissed: boolean) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("discrepancies")
    .update({
      resolved: dismissed,
      resolved_at: dismissed ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/discrepancies");
}

/** "I've handled this" or "ignore this". Hidden until brought back. */
export async function dismissFinding(formData: FormData): Promise<void> {
  await setDismissed(formData, true);
}

export async function restoreFinding(formData: FormData): Promise<void> {
  await setDismissed(formData, false);
}
