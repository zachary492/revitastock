import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEbayAuthorizeUrl } from "@/lib/ebay/oauth";
import { fetchAllSellingLists } from "@/lib/ebay/sellingFetch";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { ebay?: string; ebay_error?: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: connection } = await supabase
    .from("ebay_connections")
    .select("access_token, connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  let sellingSummary: string | null = null;
  let sellingWarning: string | null = null;
  let sellingError: string | null = null;

  if (connection) {
    try {
      const { lists, totals, complete } = await fetchAllSellingLists(
        connection.access_token
      );
      sellingSummary = `Selling lists — active: ${lists.active.length}, sold (last 60 days): ${lists.sold.length}, ended unsold (last 60 days): ${lists.endedUnsold.length}.`;
      if (!complete) {
        sellingWarning = `Some listings were not loaded. eBay reports ${totals.active} active, ${totals.sold} sold and ${totals.endedUnsold} ended unsold.`;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't read your selling lists.";
      sellingError = /932|expired/i.test(message)
        ? "Your eBay connection has expired. Click Reconnect below."
        : `Selling lists check failed: ${message}`;
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-8 text-sm text-gray-600">
        Connect your eBay account to compare live listings against your
        inventory.
      </p>

      {searchParams.ebay === "connected" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          eBay account connected.
        </p>
      )}
      {searchParams.ebay_error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong connecting your eBay account (
          {searchParams.ebay_error}). Try again below.
        </p>
      )}

      <div className="rounded-md border border-gray-200 p-5">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500">
          eBay connection
        </h2>

        {connection ? (
          <>
            <p className="text-sm text-green-700">
              ✓ Connected since{" "}
              {new Date(connection.connected_at).toLocaleString()}
            </p>
            {sellingSummary && (
              <p className="mt-2 text-sm text-gray-600">{sellingSummary}</p>
            )}
            {sellingWarning && (
              <p className="mt-2 text-sm text-amber-700">{sellingWarning}</p>
            )}
            {sellingError && (
              <p className="mt-2 text-sm text-red-600">{sellingError}</p>
            )}
            <a
              href={getEbayAuthorizeUrl()}
              className="mt-4 inline-block text-sm text-gray-500 underline underline-offset-2"
            >
              Reconnect
            </a>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-600">Not connected yet.</p>
            <a
              href={getEbayAuthorizeUrl()}
              className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Connect eBay
            </a>
          </>
        )}
      </div>
    </main>
  );
}