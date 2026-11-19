"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/ebay/connection";

/** Settings button: renew the eBay token right now, to prove refresh works. */
export async function refreshTokenNow(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const result = await getValidAccessToken(supabase, user.id, { force: true });
  redirect(
    result.ok
      ? "/settings?refreshed=1"
      : `/settings?refresh_error=${result.reason}`
  );
}
