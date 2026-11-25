import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS, readSettingsRow, type SellerSettings } from "./checkSettings";

/** Never throws: if settings can't be read the defaults apply. */
export async function loadSellerSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<SellerSettings> {
  const { data, error } = await supabase
    .from("seller_settings")
    .select("disabled_checks, required_phrases")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return readSettingsRow(data);
}

export async function saveSellerSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: SellerSettings
): Promise<{ error?: string }> {
  const { error } = await supabase.from("seller_settings").upsert(
    {
      user_id: userId,
      disabled_checks: settings.disabledChecks,
      required_phrases: settings.requiredPhrases,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  return error ? { error: error.message } : {};
}
