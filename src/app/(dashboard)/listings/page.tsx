import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEbayAuthorizeUrl } from "@/lib/ebay/oauth";
import { fetchAllSellingLists } from "@/lib/ebay/sellingFetch";
import { groupUnlabeled } from "@/lib/listings/needsLabel";
import {
  filterListings,
  isFilter,
  organizeListings,
  summarize,
  type ListingFilter,
  type ListingRow,
} from "@/lib/listings/organize";

const FILTER_LABELS: Record<ListingFilter, string> = {
  all: "All",
  active: "Active",
  sold: "Sold",
  ended: "Ended unsold",
  unlabeled: "No label",
  shared: "Same label twice",
};

const STATUS_STYLES: Record<ListingRow["status"], { text: string; className: string }> = {
  active: { text: "Active", className: "bg-green-50 text-green-700" },
  sold: { text: "Sold", className: "bg-blue-50 text-blue-700" },
  ended_unsold: { text: "Ended", className: "bg-amber-50 text-amber-700" },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function dateFor(row: ListingRow): string {
  if (row.status === "sold") return `Sold ${formatDate(row.soldAt)}`;
  if (row.status === "ended_unsold") return `Ended ${formatDate(row.endTime)}`;
  return row.endTime ? `Ends ${formatDate(row.endTime)}` : "Until cancelled";
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter: ListingFilter = isFilter(status) ? status : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: connection } = await supabase
    .from("ebay_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  let rows: ListingRow[] = [];
  let warning: string | null = null;
  let error: string | null = null;

  if (connection) {
    try {
      const { lists, totals, complete } = await fetchAllSellingLists(
        connection.access_token
      );
      rows = organizeListings(lists);
      if (!complete) {
        warning = `Some listings were not loaded. eBay reports ${totals.active} active, ${totals.sold} sold and ${totals.endedUnsold} ended unsold.`;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't read your listings.";
      error = /932|expired/i.test(message)
        ? "Your eBay connection has expired. Reconnect to load your listings."
        : `Couldn't load your listings: ${message}`;
    }
  }

  const summary = summarize(rows);
  const visible = filterListings(rows, filter);
  const needsLabelGroups = groupUnlabeled(rows).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your listings</h1>
      <p className="mb-6 text-sm text-gray-600">
        Everything eBay reports for your account: active listings, plus sold and
        ended items from the last 60 days.
      </p>

      {!connection && (
        <p className="text-sm text-gray-600">
          Your eBay account isn&apos;t connected yet.{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Connect it in Settings
          </Link>
          .
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}{" "}
          <a href={getEbayAuthorizeUrl()} className="underline underline-offset-2">
            Reconnect
          </a>
        </p>
      )}
      {warning && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {warning}
        </p>
      )}

      {connection && !error && (
        <>
          <p className="mb-4 text-sm text-gray-600">
            {summary.total} listings: {summary.active} active, {summary.sold} sold,{" "}
            {summary.endedUnsold} ended unsold. {summary.labeled} have a label,{" "}
            {summary.unlabeled} don&apos;t.
            {summary.sharedLabels > 0 &&
              ` ${summary.sharedLabels} label${summary.sharedLabels === 1 ? " is" : "s are"} used on more than one listing (relists).`}
          </p>

          <nav className="mb-4 flex flex-wrap gap-2 text-sm">
            {(Object.keys(FILTER_LABELS) as ListingFilter[]).map((key) => (
              <Link
                key={key}
                href={key === "all" ? "/listings" : `/listings?status=${key}`}
                className={
                  key === filter
                    ? "rounded-md bg-gray-900 px-3 py-1 text-white"
                    : "rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
                }
              >
                {FILTER_LABELS[key]}
              </Link>
            ))}
          </nav>

          {needsLabelGroups > 0 && (
            <p className="mb-4 text-sm">
              <Link
                href="/listings/needs-label"
                className="underline underline-offset-2"
              >
                See suggestions for listings with no label ({needsLabelGroups} groups) →
              </Link>
            </p>
          )}

          {visible.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing to show here.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Label</th>
                  <th className="py-2 pr-3 font-medium">Title</th>
                  <th className="py-2 pr-3 font-medium">Item ID</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
                  <th className="py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const style = STATUS_STYLES[row.status];
                  return (
                    <tr
                      key={`${row.status}-${row.itemId}-${row.soldAt ?? ""}`}
                      className="border-b border-gray-100 align-top"
                    >
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${style.className}`}
                        >
                          {style.text}
                        </span>
                        {row.relisted && (
                          <span className="ml-1 text-xs text-gray-500">
                            relisted
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {row.sku ?? <span className="text-gray-400">—</span>}
                        {row.sameLabelCount > 1 && (
                          <span className="ml-1 text-xs text-amber-700">
                            ×{row.sameLabelCount}
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs py-2 pr-3">{row.title}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        <a
                          href={`https://www.ebay.com/itm/${row.itemId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {row.itemId}
                        </a>
                      </td>
                      <td className="py-2 pr-3">
                        {row.price === null ? "—" : `$${row.price.toFixed(2)}`}
                      </td>
                      <td className="py-2 text-gray-600">{dateFor(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}