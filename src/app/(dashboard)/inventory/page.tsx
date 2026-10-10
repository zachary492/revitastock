import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CsvUploadForm from "@/components/inventory/CsvUploadForm";
import InventoryTable from "@/components/inventory/InventoryTable";

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: inventoryRows } = await supabase
    .from("physical_inventory")
    .select("id, sku, quantity, title, location, uploaded_at")
    .order("uploaded_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Upload inventory
      </h1>
      <p className="mb-8 text-sm text-gray-600">
        Upload a CSV of what&apos;s actually on your shelf. We&apos;ll check
        it against your live eBay listings once it&apos;s connected.
      </p>
      <CsvUploadForm />

      <h2 className="mb-4 mt-14 text-lg font-semibold tracking-tight">
        Your current inventory
      </h2>
      <InventoryTable rows={inventoryRows ?? []} />
    </main>
  );
}
