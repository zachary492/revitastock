import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEbayAuthorizeUrl } from "@/lib/ebay/oauth";
import { loadSellingListsForUser } from "@/lib/ebay/connection";
import { refreshTokenNow } from "./actions";
import { deleteMyAccount } from "./account-actions";

function formatTime(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ebay?: string;
    ebay_error?: string;
    refreshed?: string;
    refresh_error?: string;
    delete_error?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  // Loading the lists also renews the eBay token if it is about to expire.
  const result = await loadSellingListsForUser(supabase, user.id);

  const { data: connection } = await supabase
    .from("ebay_connections")
    .select("connected_at, token_expires_at, last_sync_at, last_sync_status, last_sync_message, ebay_username")
    .eq("user_id", user.id)
    .maybeSingle();

  let sellingSummary: string | null = null;
  let sellingWarning: string | null = null;
  let sellingError: string | null = null;

  if (result.status === "ok") {
    const { lists, totals, complete } = result.data;
    sellingSummary = `Selling lists — active: ${lists.active.length}, sold (last 60 days): ${lists.sold.length}, ended unsold (last 60 days): ${lists.endedUnsold.length}.`;
    if (!complete) {
      sellingWarning = `Some listings were not loaded. eBay reports ${totals.active} active, ${totals.sold} sold and ${totals.endedUnsold} ended unsold.`;
    }
  } else if (result.status === "reconnect_required") {
    sellingError =
      "Your eBay connection has expired and couldn't be renewed automatically. Click Reconnect below.";
  } else if (result.status === "error") {
    sellingError = `Selling lists check failed: ${result.message}`;
  }

  // Only show short codes that we made ourselves.
  const errorCode =
    params.ebay_error && /^[a-z_]{1,40}$/.test(params.ebay_error)
      ? params.ebay_error
      : null;
  const tokenUntil = formatTime(connection?.token_expires_at ?? null);
  const lastSync = formatTime(connection?.last_sync_at ?? null);

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

      {params.ebay === "connected" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          eBay account connected.
        </p>
      )}
      {params.ebay_error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong connecting your eBay account
          {errorCode ? ` (${errorCode})` : ""}. Try again below.
        </p>
      )}
      {params.refreshed === "1" && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Token renewed. It now lasts about 2 hours, and RevitaSync renews it
          again by itself.
        </p>
      )}
      {params.refresh_error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {params.refresh_error === "reconnect_required"
            ? "eBay no longer accepts the saved sign-in. Click Reconnect below."
            : "Couldn't renew the token right now. Try again in a minute."}
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
              {formatTime(connection.connected_at) ?? "earlier"}
              {connection.ebay_username ? ` as ${connection.ebay_username}` : ""}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              The access token renews automatically
              {tokenUntil ? `. Current token valid until ${tokenUntil}.` : "."}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {lastSync
                ? `Last automatic daily sync: ${lastSync}${
                    connection.last_sync_status === "ok"
                      ? "."
                      : connection.last_sync_status === "reconnect_required"
                        ? " (needs you to Reconnect eBay)."
                        : connection.last_sync_status
                          ? ` (problem: ${connection.last_sync_message ?? "see logs"}).`
                          : "."
                  }`
                : "The automatic daily sync hasn't run yet."}
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
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <form action={refreshTokenNow}>
                <button
                  type="submit"
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Test token renewal
                </button>
              </form>
              <a
                href={getEbayAuthorizeUrl()}
                className="text-sm text-gray-500 underline underline-offset-2"
              >
                Reconnect
              </a>
            </div>
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

      {connection && (
        <div className="mt-6 rounded-md border border-gray-200 p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Your checks
          </h2>
          <Link
            href="/settings/checks"
            className="block rounded-md bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Listing checks
            <span className="mt-0.5 block text-xs font-normal text-gray-300">
              Choose what RevitaSync looks for, and words every description should contain
            </span>
          </Link>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Link href="/discrepancies" className="text-gray-700 underline underline-offset-2">
              Needs attention
            </Link>
            <Link href="/listings" className="text-gray-700 underline underline-offset-2">
              Your listings
            </Link>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-gray-500">Advanced tools</summary>
            <div className="mt-2 space-y-1 text-sm">
              <Link href="/settings/label-test" className="block text-gray-500 underline underline-offset-2">
                Label write test
              </Link>
              <Link href="/settings/item-sample" className="block text-gray-500 underline underline-offset-2">
                Look at a listing&apos;s data
              </Link>
            </div>
          </details>
        </div>
      )}

      <div className="mt-6 rounded-md border border-red-200 p-5">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-red-700">
          Delete my account and data
        </h2>
        <p className="mb-3 text-xs text-gray-600">
          This permanently deletes your RevitaSync account, your eBay connection and everything
          stored about you. It can&apos;t be undone and doesn&apos;t change anything on eBay. To
          also remove RevitaSync&apos;s access on eBay, use your eBay account&apos;s settings for
          connected apps.
        </p>
        {params.delete_error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.delete_error === "confirm"
              ? "Type DELETE (in capital letters) to confirm."
              : "Couldn't delete the account right now. Please try again."}
          </p>
        )}
        <form action={deleteMyAccount} className="flex flex-wrap items-center gap-3">
          <input
            name="confirm"
            required
            autoComplete="off"
            placeholder="Type DELETE"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete everything
          </button>
        </form>
      </div>

      <p className="mt-8 text-xs text-gray-500">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
      </p>
    </main>
  );
}
