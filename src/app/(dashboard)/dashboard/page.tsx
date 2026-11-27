import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/dashboard/SignOutButton";
import RunListingAuditButton from "@/components/discrepancies/RunListingAuditButton";

function Step({
  number,
  done,
  title,
  note,
  href,
  action,
  highlight,
}: {
  number: number;
  done: boolean;
  title: string;
  note: string;
  href: string;
  action: string;
  highlight: boolean;
}) {
  return (
    <li
      className={`flex items-start gap-4 rounded-md border px-4 py-4 ${
        highlight ? "border-gray-900" : "border-gray-200"
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}
        aria-label={done ? "Done" : `Step ${number}`}
      >
        {done ? "✓" : number}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{note}</p>
      </div>
      <Link
        href={href}
        className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${
          highlight
            ? "bg-gray-900 text-white hover:bg-gray-800"
            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {action}
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: connection } = await supabase
    .from("ebay_connections")
    .select("last_sync_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const connected = Boolean(connection);

  // "Has the first audit run?" = the daily sync ran, or any finding or saved
  // listing detail exists for this seller.
  let audited = Boolean(connection?.last_sync_at);
  if (connected && !audited) {
    const [{ count: findings }, { count: details }] = await Promise.all([
      supabase.from("discrepancies").select("id", { count: "exact", head: true }),
      supabase.from("listing_details").select("id", { count: "exact", head: true }),
    ]);
    audited = (findings ?? 0) > 0 || (details ?? 0) > 0;
  }

  const { data: settingsRow } = await supabase
    .from("seller_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customized = Boolean(settingsRow);

  const nextStep = !connected ? 1 : !audited ? 2 : 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <SignOutButton />
      </div>
      <p className="text-gray-600">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <p className="mt-4 text-sm text-gray-500">
        RevitaSync checks your eBay listings for problems, like items that sold but are still
        live, listings that ended and were never relisted, and titles that don&apos;t match the
        item details.
      </p>

      {connected && (
        <div className="mt-8 rounded-md border border-gray-200 p-5">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-500">
            Check my listings
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Reads your eBay listings and looks for problems. A big shop is covered over a few
            runs. RevitaSync also checks automatically every night.
          </p>
          <RunListingAuditButton />
          <p className="mt-4 text-sm">
            <Link href="/discrepancies" className="text-gray-900 underline underline-offset-2">
              See what needs attention →
            </Link>
          </p>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wide text-gray-500">
        {connected && audited ? "Your setup" : "Getting started"}
      </h2>
      <ol className="space-y-3">
        <Step
          number={1}
          done={connected}
          title="Connect your eBay account"
          note="RevitaSync only reads your listings. You can delete your data any time."
          href="/settings"
          action={connected ? "Settings" : "Connect eBay"}
          highlight={nextStep === 1}
        />
        <Step
          number={2}
          done={audited}
          title="Run your first check"
          note="Click “Run audit on my eBay listings” on this page, then open Needs attention."
          href="/discrepancies"
          action="Needs attention"
          highlight={nextStep === 2}
        />
        <Step
          number={3}
          done={customized}
          title="Choose your listing checks"
          note="Switch checks on or off, and add words every description should contain."
          href="/settings/checks"
          action="Listing checks"
          highlight={false}
        />
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link href="/discrepancies" className="text-gray-700 underline underline-offset-2">
          Needs attention
        </Link>
        <Link href="/listings" className="text-gray-700 underline underline-offset-2">
          Your listings
        </Link>
        <Link href="/inventory" className="text-gray-500 underline underline-offset-2">
          Upload inventory (optional)
        </Link>
        <Link href="/privacy" className="text-gray-500 underline underline-offset-2">
          Privacy policy
        </Link>
      </div>
    </main>
  );
}
