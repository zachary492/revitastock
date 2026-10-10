import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RunAuditButton from "@/components/discrepancies/RunAuditButton";

const TYPE_LABELS: Record<string, string> = {
  ghost_listing: "Ghost listing",
  phantom_drop: "Phantom drop",
  quantity_mismatch: "Quantity mismatch",
};

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
    .select("id, sku, type, physical_quantity, live_quantity, listing_id, found_at")
    .eq("resolved", false)
    .order("found_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Discrepancies</h1>
      <p className="mb-8 text-sm text-gray-600">
        Compares your saved inventory against your listings. For now the
        listings are sample data, until the eBay connection is working.
      </p>

      <RunAuditButton />

      <h2 className="mb-4 mt-14 text-lg font-semibold tracking-tight">
        Open discrepancies
      </h2>

      {!rows || rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing found yet. Click “Run audit” above.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4 font-medium">SKU</th>
              <th className="py-2 pr-4 font-medium">Problem</th>
              <th className="py-2 pr-4 font-medium">On shelf</th>
              <th className="py-2 pr-4 font-medium">On eBay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono">{row.sku}</td>
                <td className="py-2 pr-4">{TYPE_LABELS[row.type] ?? row.type}</td>
                <td className="py-2 pr-4">{row.physical_quantity}</td>
                <td className="py-2 pr-4">{row.live_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}