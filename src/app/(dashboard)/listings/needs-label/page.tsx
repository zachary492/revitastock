import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEbayAuthorizeUrl } from "@/lib/ebay/oauth";
import { fetchAllSellingLists } from "@/lib/ebay/sellingFetch";
import type { ListingRecord } from "@/lib/ebay/sellingLists";
import {
  groupUnlabeled,
  type NeedsLabelGroup,
} from "@/lib/listings/needsLabel";
import {
  applyLabelLinks,
  rejectedItemIds,
  type LabelLink,
} from "@/lib/listings/labelLinks";
import { confirmLabel, rejectItems, undoAnswer } from "./actions";

const STATUS_STYLES: Record<ListingRecord["status"], { text: string; className: string }> = {
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

function dateFor(row: ListingRecord): string {
  if (row.status === "sold") return `Sold ${formatDate(row.soldAt)}`;
  if (row.status === "ended_unsold") return `Ended ${formatDate(row.endTime)}`;
  return "Live";
}

function Lines({ rows }: { rows: ListingRecord[] }) {
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {rows.map((row) => {
          const style = STATUS_STYLES[row.status];
          return (
            <tr
              key={`${row.status}-${row.itemId}-${row.soldAt ?? ""}`}
              className="border-t border-gray-100 align-top"
            >
              <td className="w-20 py-1.5 pr-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${style.className}`}
                >
                  {style.text}
                </span>
              </td>
              <td className="w-24 py-1.5 pr-3 font-mono text-xs">
                {row.sku ?? <span className="text-gray-400">no label</span>}
              </td>
              <td className="py-1.5 pr-3">{row.title}</td>
              <td className="w-20 py-1.5 pr-3">
                {row.price === null ? "—" : `$${row.price.toFixed(2)}`}
              </td>
              <td className="w-32 py-1.5 pr-3 text-gray-600">{dateFor(row)}</td>
              <td className="w-32 py-1.5 font-mono text-xs">
                <a
                  href={`https://www.ebay.com/itm/${row.itemId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {row.itemId}
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Confidence({ value }: { value: NeedsLabelGroup["confidence"] }) {
  return value === "same" ? (
    <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      Same title
    </span>
  ) : (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      Similar title
    </span>
  );
}

function ItemIds({ rows }: { rows: ListingRecord[] }) {
  return (
    <>
      {rows.map((row) => (
        <input
          key={`${row.status}-${row.itemId}-${row.soldAt ?? ""}`}
          type="hidden"
          name="itemId"
          value={row.itemId}
        />
      ))}
    </>
  );
}

function GroupCard({
  group,
  canSave,
}: {
  group: NeedsLabelGroup;
  canSave: boolean;
}) {
  return (
    <section className="mb-4 rounded-md border border-gray-200 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        {group.kind === "matches_label" && (
          <span>
            Looks like <span className="font-mono">{group.suggestedLabel}</span>
          </span>
        )}
        {group.kind === "conflict" && (
          <span>
            Looks like one item, but it matches different labels. Check these.
          </span>
        )}
        {group.kind === "new_item" && (
          <span>
            No label yet ({group.unlabeled.length}{" "}
            {group.unlabeled.length === 1 ? "listing" : "listings"})
          </span>
        )}
        <Confidence value={group.confidence} />
      </div>
      {group.labeled.length > 0 && <Lines rows={group.labeled} />}
      <Lines rows={group.unlabeled} />

      {group.kind === "matches_label" && group.suggestedLabel && canSave && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <form action={confirmLabel}>
            <input type="hidden" name="label" value={group.suggestedLabel} />
            <ItemIds rows={group.unlabeled} />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Yes, these are {group.suggestedLabel}
            </button>
          </form>
          <form action={rejectItems}>
            <ItemIds rows={group.unlabeled} />
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Not the same item
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

export default async function NeedsLabelPage() {
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

  // Saved answers. If the database step hasn't been done yet, this fails and
  // the page still works, it just can't save answers.
  const { data: linkRows, error: linkError } = await supabase
    .from("label_links")
    .select("item_id, status, label");
  const canSave = !linkError;
  const links: LabelLink[] = (linkRows ?? []).map((row) => ({
    itemId: row.item_id,
    status: row.status,
    label: row.label,
  }));

  let groups: NeedsLabelGroup[] = [];
  let answered: { link: LabelLink; listing: ListingRecord | undefined }[] = [];
  let warning: string | null = null;
  let error: string | null = null;

  if (connection) {
    try {
      const { lists, totals, complete } = await fetchAllSellingLists(
        connection.access_token
      );
      const everyListing = [
        ...lists.active,
        ...lists.endedUnsold,
        ...lists.sold,
      ];
      const withAnswers = applyLabelLinks(lists, links);
      groups = groupUnlabeled(
        [...withAnswers.active, ...withAnswers.endedUnsold, ...withAnswers.sold],
        { isolated: rejectedItemIds(links) }
      );
      answered = links.map((link) => ({
        link,
        listing: everyListing.find((r) => r.itemId === link.itemId),
      }));
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

  const matches = groups.filter((g) => g.kind === "matches_label");
  const conflicts = groups.filter((g) => g.kind === "conflict");
  const repeated = groups.filter(
    (g) => g.kind === "new_item" && g.unlabeled.length > 1
  );
  const singles = groups.filter(
    (g) => g.kind === "new_item" && g.unlabeled.length === 1
  );
  const liveSingles = singles.filter((g) => g.liveCount > 0);
  const otherSingles = singles.filter((g) => g.liveCount === 0);
  const unlabeledTotal = groups.reduce((sum, g) => sum + g.unlabeled.length, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <Link
        href="/listings"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to your listings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Needs a label</h1>
      <p className="mb-6 text-sm text-gray-600">
        Listings with no custom label, grouped when the titles look like the same
        item. Your answers are saved in RevitaSync only. Nothing is changed on
        eBay.
      </p>

      {!canSave && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Saving answers isn&apos;t set up yet (the database step for Day 5).
          You can still look at the suggestions.
        </p>
      )}

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
          <p className="mb-6 text-sm text-gray-600">
            {unlabeledTotal} listings have no label, in {groups.length} groups.
          </p>

          {matches.length > 0 && (
            <>
              <h2 className="mb-2 text-lg font-semibold">
                Looks like an item you already labeled ({matches.length})
              </h2>
              {matches.map((g) => (
                <GroupCard key={g.id} group={g} canSave={canSave} />
              ))}
            </>
          )}

          {conflicts.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-lg font-semibold">
                Check these ({conflicts.length})
              </h2>
              {conflicts.map((g) => (
                <GroupCard key={g.id} group={g} canSave={canSave} />
              ))}
            </>
          )}

          {repeated.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-lg font-semibold">
                Same item listed more than once ({repeated.length})
              </h2>
              {repeated.map((g) => (
                <GroupCard key={g.id} group={g} canSave={canSave} />
              ))}
            </>
          )}

          {liveSingles.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-lg font-semibold">
                Live listings with no label and no match ({liveSingles.length})
              </h2>
              <Lines rows={liveSingles.flatMap((g) => g.unlabeled)} />
            </>
          )}

          {otherSingles.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-lg font-semibold">
                Older single listings with no label ({otherSingles.length})
              </h2>
              <Lines rows={otherSingles.flatMap((g) => g.unlabeled)} />
            </>
          )}

          {groups.length === 0 && (
            <p className="text-sm text-gray-500">
              Every listing has a label. Nothing to do here.
            </p>
          )}

          {answered.length > 0 && (
            <>
              <h2 className="mb-2 mt-10 text-lg font-semibold">
                Your answers ({answered.length})
              </h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {answered.map(({ link, listing }) => (
                    <tr
                      key={link.itemId}
                      className="border-t border-gray-100 align-top"
                    >
                      <td className="w-56 py-1.5 pr-3">
                        {link.status === "confirmed" ? (
                          <>
                            Confirmed as{" "}
                            <span className="font-mono">{link.label}</span>
                          </>
                        ) : (
                          "Marked as a different item"
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        {listing?.title ?? (
                          <span className="text-gray-400">
                            (no longer in the last 60 days)
                          </span>
                        )}
                      </td>
                      <td className="w-32 py-1.5 pr-3 font-mono text-xs">
                        {link.itemId}
                      </td>
                      <td className="w-20 py-1.5">
                        <form action={undoAnswer}>
                          <input type="hidden" name="itemId" value={link.itemId} />
                          <button
                            type="submit"
                            className="text-sm text-gray-600 underline underline-offset-2"
                          >
                            Undo
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </main>
  );
}
