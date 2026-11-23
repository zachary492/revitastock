import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadSellingListsForUser } from "@/lib/ebay/connection";
import ItemSample, { type SampleCandidate } from "@/components/settings/ItemSample";

export default async function ItemSamplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const loaded = await loadSellingListsForUser(supabase, user.id);
  const candidates: SampleCandidate[] =
    loaded.status === "ok"
      ? loaded.data.lists.active
          .map((r) => ({ itemId: r.itemId, label: r.sku ?? "", title: r.title }))
          .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }))
      : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/settings"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Look at a listing</h1>
      <p className="mb-6 text-sm text-gray-600">
        Shows what eBay sends for one of your listings: the item specifics,
        number of photos and description length that the listing-quality checks
        use. Nothing is changed. The outline hides your text, so it&apos;s safe to
        paste into a chat if something looks wrong.
      </p>
      {loaded.status === "ok" ? (
        <ItemSample candidates={candidates} />
      ) : (
        <p className="text-sm text-gray-600">
          Your eBay account isn&apos;t connected or needs attention.{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Check Settings
          </Link>
          .
        </p>
      )}
    </main>
  );
}
