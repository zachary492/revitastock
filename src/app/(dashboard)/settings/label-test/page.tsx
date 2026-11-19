import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEbayAuthorizeUrl } from "@/lib/ebay/oauth";
import { loadSellingListsForUser } from "@/lib/ebay/connection";
import { isLabelTestCandidate } from "@/lib/ebay/labelWrite";
import LabelWriteTest, { type Candidate } from "@/components/settings/LabelWriteTest";

export default async function LabelTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const loaded = await loadSellingListsForUser(supabase, user.id);

  const candidates: Candidate[] =
    loaded.status === "ok"
      ? loaded.data.lists.active
          .filter(isLabelTestCandidate)
          .map((r) => ({
            itemId: r.itemId,
            label: r.sku ?? "",
            title: r.title,
            price: r.price,
          }))
          .sort((a, b) =>
            a.label.localeCompare(b.label, "en", { numeric: true })
          )
      : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/settings"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Label write test</h1>
      <p className="mb-4 text-sm text-gray-600">
        RevitaSync has only ever <em>read</em> your eBay listings. Before it can add
        labels for you, we need to know if eBay lets it <em>edit</em> a listing. This
        test sends one harmless edit: it re-saves a listing&apos;s existing label, then
        reads the listing back to confirm nothing changed.
      </p>
      <ul className="mb-6 list-disc space-y-1 pl-5 text-sm text-gray-600">
        <li>Pick a listing you can afford to touch, not your best seller.</li>
        <li>The item number stays the same. It counts as one revision of that listing.</li>
        <li>If eBay refuses, nothing is changed, and the error tells us what to fix.</li>
      </ul>

      {loaded.status === "not_connected" && (
        <p className="text-sm text-gray-600">
          Your eBay account isn&apos;t connected yet.{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Connect it in Settings
          </Link>
          .
        </p>
      )}
      {loaded.status === "reconnect_required" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Your eBay connection has expired.{" "}
          <a href={getEbayAuthorizeUrl()} className="underline underline-offset-2">
            Reconnect
          </a>
        </p>
      )}
      {loaded.status === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load your listings: {loaded.message}
        </p>
      )}

      {loaded.status === "ok" &&
        (candidates.length === 0 ? (
          <p className="text-sm text-gray-600">
            No eligible listings found. A listing must be live, fixed price, labeled,
            and have a quantity of 1.
          </p>
        ) : (
          <LabelWriteTest candidates={candidates} />
        ))}
    </main>
  );
}
