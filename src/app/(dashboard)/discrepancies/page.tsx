import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RunAuditButton from "@/components/discrepancies/RunAuditButton";
import RunListingAuditButton from "@/components/discrepancies/RunListingAuditButton";
import {
  explainFinding,
  formatDay,
  isListingRuleType,
  summarizeFindings,
} from "@/lib/audit/explain";
import { dismissFinding, restoreFinding } from "./findingActions";

const SAMPLE_TYPE_LABELS: Record<string, string> = {
  ghost_listing: "Ghost listing",
  phantom_drop: "Phantom drop",
  quantity_mismatch: "Quantity mismatch",
};

function quantity(value: number | null): string {
  return value === null ? "—" : String(value);
}

function SummaryCard({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string | number;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        highlight ? "border-amber-300 bg-amber-50" : "border-gray-200"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-0.5 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

export default async function DiscrepanciesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: allRows } = await supabase
    .from("discrepancies")
    .select(
      "id, sku, type, physical_quantity, live_quantity, listing_id, found_at, resolved, resolved_at, details"
    )
    .order("found_at", { ascending: false });

  const rows = allRows ?? [];
  const open = rows.filter((r) => !r.resolved && isListingRuleType(r.type));
  const dismissed = rows.filter((r) => r.resolved && isListingRuleType(r.type));
  const sample = rows.filter((r) => !r.resolved && !isListingRuleType(r.type));

  const summary = summarizeFindings(open);
  const lastChecked = open[0]?.found_at ?? null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Needs attention</h1>
      <p className="mb-8 text-sm text-gray-600">
        Checks your eBay listings for items that look wrong. These are things to
        check, not errors: RevitaSync can&apos;t see everything. The sold and ended
        checks skip items with no label, so{" "}
        <Link href="/listings/needs-label" className="underline underline-offset-2">
          label them first
        </Link>{" "}
        for the best results.
      </p>

      <RunListingAuditButton />

      <div className="mb-10 mt-8 grid gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Needs attention"
          value={summary.total}
          note={
            summary.total === 0
              ? "Nothing to check right now"
              : "Open items to look at"
          }
          highlight={summary.total > 0}
        />
        <SummaryCard
          label="Sold, but still live"
          value={summary.soldButStillActive}
          note="Paid sale, listing still up"
        />
        <SummaryCard
          label="Ended, not relisted"
          value={summary.endedNeverRelisted}
          note="No sale, no live listing"
        />
        <SummaryCard
          label="No watchers"
          value={summary.staleListings}
          note="Live 90+ days, no interest"
        />
      </div>

      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        Items to check
      </h2>

      {open.length === 0 ? (
        <p className="text-sm text-gray-500">
          No open problems. Click “Run audit on my eBay listings” to check again.
        </p>
      ) : (
        <>
          {lastChecked && (
            <p className="mb-4 text-xs text-gray-500">
              Last checked {formatDay(lastChecked)}
            </p>
          )}
          <ul className="space-y-3">
            {open.map((row) => {
              const explanation = explainFinding(row);
              return (
                <li key={row.id} className="rounded-md border border-gray-200 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {explanation?.heading ?? row.type}
                    </span>
                    <span className="font-mono text-sm">{row.sku}</span>
                  </div>
                  {explanation && (
                    <p className="text-sm text-gray-700">{explanation.text}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    {row.listing_id && (
                      <a
                        href={`https://www.ebay.com/itm/${row.listing_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        Open on eBay
                      </a>
                    )}
                    <form action={dismissFinding}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dismissed.length > 0 && (
        <details className="mt-10 rounded-md border border-gray-200 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Dismissed ({dismissed.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {dismissed.map((row) => {
              const explanation = explainFinding(row);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2"
                >
                  <span>
                    <span className="font-mono">{row.sku}</span>{" "}
                    <span className="text-gray-600">
                      {explanation?.heading ?? row.type}
                      {row.resolved_at
                        ? `, dismissed ${formatDay(row.resolved_at)}`
                        : ""}
                    </span>
                  </span>
                  <form action={restoreFinding}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="text-gray-600 underline underline-offset-2"
                    >
                      Bring back
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <details className="mt-10 rounded-md border border-gray-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          Advanced: check against your own spreadsheet
        </summary>
        <p className="mb-4 mt-2 text-sm text-gray-600">
          Compares your uploaded CSV of SKUs with sample listing data (not your
          real eBay listings yet).
        </p>
        <RunAuditButton />

        {sample.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-sm font-semibold">
              Spreadsheet results (sample data)
            </h3>
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
                {sample.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono">{row.sku}</td>
                    <td className="py-2 pr-4">
                      {SAMPLE_TYPE_LABELS[row.type] ?? row.type}
                    </td>
                    <td className="py-2 pr-4">{quantity(row.physical_quantity)}</td>
                    <td className="py-2 pr-4">{quantity(row.live_quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </details>
    </main>
  );
}
