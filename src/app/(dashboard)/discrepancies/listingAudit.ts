"use server";

import { createClient } from "@/lib/supabase/server";
import {
  runListingAuditForUser,
  type ListingAuditResult,
} from "@/lib/audit/runAudit";

export type { ListingAuditResult };

/** Audit based on the seller's eBay listings. No CSV needed. */
export async function runListingAudit(): Promise<ListingAuditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in." };
  }
  return runListingAuditForUser(supabase, user.id);
}
