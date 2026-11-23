import { LISTING_RULE_TYPES } from "./findingRows";

/** A saved finding, as read back from the `discrepancies` table. */
export interface FindingRowData {
  id?: string;
  type: string;
  sku: string;
  listing_id: string | null;
  details: Record<string, unknown> | null;
}

export interface Explanation {
  heading: string;
  text: string;
}

export function isListingRuleType(type: string): boolean {
  return (LISTING_RULE_TYPES as string[]).includes(type);
}

/** "Nov 5, 2026". Empty or bad dates give null. */
export function formatDay(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function titleOf(details: Record<string, unknown> | null): string | null {
  return details && typeof details.title === "string" && details.title
    ? details.title
    : null;
}

function datesOf(details: Record<string, unknown> | null): string[] {
  const raw = details?.saleDates;
  if (!Array.isArray(raw)) return [];
  return raw.map(formatDay).filter((d): d is string => d !== null);
}

/**
 * Plain-language explanation for the two eBay-listing checks.
 * Returns null for the older spreadsheet check types.
 * The wording is "check this", never "error": the app can't see everything.
 */
export function explainFinding(row: FindingRowData): Explanation | null {
  const title = titleOf(row.details);
  const listing = title ? `"${title}"` : "a listing";

  if (row.type === "sold_but_still_active") {
    const dates = datesOf(row.details);
    const sale =
      dates.length > 1
        ? `${dates.length} paid sales (the latest on ${dates[0]})`
        : dates.length === 1
          ? `a paid sale on ${dates[0]}`
          : "a paid sale";
    let text =
      `${row.sku} has ${sale}, and ${listing} is still live. ` +
      "If the item is gone, end the listing so nobody buys something you don't have. " +
      "If you have another one, you can dismiss this.";
    if (row.details?.listedAfterSale === true) {
      text +=
        " The live listing started after the sale, so it may be a return you relisted.";
    }
    return { heading: "Sold, but a listing is still live", text };
  }

  if (row.type === "ended_never_relisted") {
    const ended = formatDay(row.details?.endedAt);
    const earlier = row.details?.earlierEndedCount;
    let text =
      `${row.sku} (${listing}) ended${ended ? ` on ${ended}` : ""} without selling, ` +
      "and there is no live listing for it. " +
      "If you still have it, relist it. If you've removed it, you can dismiss this.";
    if (typeof earlier === "number" && earlier > 0) {
      text += ` It has ended ${earlier} ${earlier === 1 ? "time" : "times"} before.`;
    }
    return { heading: "Ended without selling, not relisted", text };
  }

  if (row.type === "stale_listing") {
    const days = row.details?.listedDays;
    const lastWatched = formatDay(row.details?.lastWatchedAt);
    const since = formatDay(row.details?.watchingSince);
    let text =
      `${listing} has been live ${typeof days === "number" ? `${days} days` : "a long time"} ` +
      "with no watchers and no recent sales. ";
    text += lastWatched
      ? `The last time RevitaSync saw a watcher on it was ${lastWatched}. `
      : since
        ? `RevitaSync hasn't seen a watcher on it since it started checking on ${since}. `
        : "";
    text +=
      "Take a look for a mistake in the title, photos, item details or description, " +
      "or consider changing the price or relisting. If it's fine as it is, you can dismiss this.";
    return { heading: "No watchers for a long time", text };
  }

  return null;
}

export interface FindingSummary {
  total: number;
  soldButStillActive: number;
  endedNeverRelisted: number;
  staleListings: number;
}

export function summarizeFindings(rows: { type: string }[]): FindingSummary {
  const soldButStillActive = rows.filter(
    (r) => r.type === "sold_but_still_active"
  ).length;
  const endedNeverRelisted = rows.filter(
    (r) => r.type === "ended_never_relisted"
  ).length;
  const staleListings = rows.filter((r) => r.type === "stale_listing").length;
  return {
    total: soldButStillActive + endedNeverRelisted + staleListings,
    soldButStillActive,
    endedNeverRelisted,
    staleListings,
  };
}

/** Identifies "the same finding" across audit runs. */
export function findingKey(
  type: string,
  sku: string,
  listingId: string | null
): string {
  return `${type}|${sku.trim().toUpperCase()}|${listingId ?? ""}`;
}

/** Drops findings the seller already dismissed. */
export function withoutDismissed<
  T extends { type: string; sku: string; listing_id: string | null },
>(rows: T[], dismissedKeys: ReadonlySet<string>): T[] {
  return rows.filter(
    (r) => !dismissedKeys.has(findingKey(r.type, r.sku, r.listing_id))
  );
}
