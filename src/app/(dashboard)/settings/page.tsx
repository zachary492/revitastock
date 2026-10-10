import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEbayAuthorizeUrl } from "@/lib/ebay/oauth";
import { ebayFetch } from "@/lib/ebay/client";

interface EbayInventoryItemsResponse {
  total?: number;
  inventoryItems?: { sku: string }[];
}

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

  let liveCheckResult: string | null = null;
  let liveCheckError: string | null = null;

  if (connection) {
    try {
      const data = await ebayFetch<EbayInventoryItemsResponse>({
        path: "/sell/inventory/v1/inventory_item?limit=5",
        accessToken: connection.access_token,
      });
      const count = data.inventoryItems?.length ?? 0;
      liveCheckResult =
        count > 0
          ? `Found ${count} item(s) on your Sandbox account.`
          : "Connected successfully — 0 items found (normal for a fresh Sandbox test account).";
    } catch (err) {
      liveCheckError =
        err instanceof Error ? err.message : "Couldn't reach eBay's API.";
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
            {liveCheckResult && (
              <p className="mt-2 text-sm text-gray-600">{liveCheckResult}</p>
            )}
            {liveCheckError && (
              <p className="mt-2 text-sm text-red-600">
                Live check failed: {liveCheckError}
              </p>
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
              Connect eBay (Sandbox)
            </a>
          </>
        )}
      </div>
    </main>
  );
}
