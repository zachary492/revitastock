import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runListingAuditForUser } from "@/lib/audit/runAudit";
import {
  isAuthorizedCron,
  runDailySync,
  type SyncOutcome,
} from "@/lib/sync/dailySync";

// Vercel runs this once a day (see vercel.json) and sends the CRON_SECRET.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("Daily sync: admin client unavailable:", err);
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const { data: rows, error } = await admin
    .from("ebay_connections")
    .select("user_id, last_sync_at");
  if (error) {
    console.error("Daily sync: could not list connections:", error.message);
    return NextResponse.json({ error: "Could not list connections" }, { status: 500 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  const summary = await runDailySync({
    targets: (rows ?? []).map((r) => ({
      userId: r.user_id as string,
      lastSyncAt: (r.last_sync_at as string | null) ?? null,
    })),
    minHoursBetween: force ? 0 : 20,
    syncOne: async (userId): Promise<SyncOutcome> => {
      const result = await runListingAuditForUser(admin, userId);
      if (result.success) {
        return {
          ok: true,
          message: `${result.listingsChecked} listings checked; ${
            (result.soldButStillActive ?? 0) +
            (result.endedNeverRelisted ?? 0) +
            (result.staleListings ?? 0)
          } need attention.`,
        };
      }
      const status =
        result.code === "reconnect_required" || result.code === "not_connected"
          ? result.code
          : "error";
      return { ok: false, status, message: result.error ?? "Sync failed." };
    },
    record: async (userId, status, message) => {
      const { error: writeError } = await admin
        .from("ebay_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: status,
          last_sync_message: message.slice(0, 300),
        })
        .eq("user_id", userId);
      if (writeError) console.error("Daily sync: saving status failed:", writeError.message);
    },
  });

  // Counts only: never log listing data or tokens.
  console.log("Daily sync finished:", JSON.stringify(summary));
  return NextResponse.json(summary);
}
