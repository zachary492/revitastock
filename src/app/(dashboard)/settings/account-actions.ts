"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently deletes the signed-in seller's account. Their connection,
 * listing history, findings, saved details and settings are removed with it.
 */
export async function deleteMyAccount(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    redirect("/settings?delete_error=confirm");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Account self-deletion failed:", error.message);
    redirect("/settings?delete_error=failed");
  }

  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?account_deleted=1");
}
