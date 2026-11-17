import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RunAuditButton from "@/components/discrepancies/RunAuditButton";
import RunListingAuditButton from "@/components/discrepancies/RunListingAuditButton";

const TYPE_LABELS: Record<string, string> = {
  ghost_listing: "Ghost listing",
  phantom_drop: "Phantom drop",
  quantity_mismatch: "Quantity mismatch",
  sold_but_still_active: "Sold, but a listing is still live",
  ended_never_relisted: "Ended without selling, not relisted",
};

function quantity(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default async function DiscrepanciesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: rows } = await supabase
    .from("discrepancies")
    .select(
      "id, sku, type, physical_quantity, live_quantity, listing_id, found_at, details"
    )
    .eq("resolved", false)
    .order("found_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Discrepancies</h1>
      <p className="mb-8 text-sm text-gray-600">
        Checks your eBay listings for items that look wrong: sold items that are
        still live, and items that ended without selling and were never relisted.
        Items with no label are skipped, so{" "}
        <Link href="/listings/needs-label" className="underline underline-offset-2">
          label them first
        </Link>{" "}
        for the best results.
      </p>

      <RunListingAuditButton />

      <details className="mt-8 rounded-md border border-gray-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          Advanced: check against your own spreadsheet
        </summary>
        <p className="mb-4 mt-2 text-sm text-gray-600">
          Compares your uploaded CSV of SKUs with sample listing data (not your
          real eBay listings yet).
        </p>
        <RunAuditButton />
      </details>

      <h2 className="mb-4 mt-14 text-lg font-semibold tracking-tight">
        Open discrepancies
      </h2>

      {!rows || rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing found yet. Click “Run audit on my eBay listings” above.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4 font-medium">Label</th>
              <th className="py-2 pr-4 font-medium">Problem</th>
              <th className="py-2 pr-4 font-medium">On shelf</th>
              <th className="py-2 pr-4 font-medium">On eBay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const title =
                row.details && typeof row.details.title === "string"
                  ? row.details.title
                  : null;
              return (
                <tr key={row.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 font-mono">{row.sku}</td>
                  <td className="py-2 pr-4">
                    {TYPE_LABELS[row.type] ?? row.type}
                    {title && (
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {title}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{quantity(row.physical_quantity)}</td>
                  <td className="py-2 pr-4">{quantity(row.live_quantity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
