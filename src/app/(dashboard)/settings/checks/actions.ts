"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CHECKS, normalizePhrases } from "@/lib/audit/checkSettings";
import { saveSellerSettings } from "@/lib/audit/settingsStore";

export async function saveChecks(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const enabled = new Set(formData.getAll("enabled").map(String));
  const disabledChecks = CHECKS.filter((c) => !enabled.has(c.id)).map((c) => c.id as string);
  const phrases = normalizePhrases(String(formData.get("phrases") ?? ""));

  const result = await saveSellerSettings(supabase, user.id, {
    disabledChecks,
    requiredPhrases: phrases,
  });
  revalidatePath("/settings/checks");
  redirect(result.error ? "/settings/checks?error=1" : "/settings/checks?saved=1");
}
