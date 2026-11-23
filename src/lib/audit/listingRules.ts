import type { ListingRecord, SellingLists } from "../ebay/sellingLists";
import { normalizeLabel } from "../listings/organize";
import type { WatchState } from "../listings/watchState";

/** eBay only lets us see sales from the last 60 days. */
export const SALES_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A live listing with no watchers for this many days is "stale". */
export const STALE_DAYS = 90;

export interface RuleOptions {
  /** "Today". Only tests need to set this. */
  now?: Date;
  /** What we remember about watchers. Without it the stale check is skipped. */
  watchStates?: ReadonlyMap<string, WatchState>;
  staleDays?: number;
}

/** A live listing whose label has a PAID sale. Wording: "check this". */
export interface SoldButStillActive {
  rule: "sold_but_still_active";
  label: string;
  active: ListingRecord;
  sales: ListingRecord[]; // paid sales with the same label, newest first
  /** True if the live listing started after the sale (maybe a return or a mistaken relist). */
  listedAfterSale: boolean;
}

/** A labeled item whose last listing ended unsold and was never relisted. */
export interface EndedNeverRelisted {
  rule: "ended_never_relisted";
  label: string;
  ended: ListingRecord; // the most recent ended listing for this label
  earlierEndedCount: number; // older ended listings with the same label
}

/** A live listing that has had no watchers (and no sales) for a long time. */
export interface StaleListing {
  rule: "stale_listing";
  label: string | null;
  listing: ListingRecord;
  listedDays: number;
  /** Last time RevitaSync saw a watcher; null = never since it started checking. */
  lastWatchedAt: string | null;
  /** When RevitaSync first saw this listing. */
  watchingSince: string;
}

export type Finding = SoldButStillActive | EndedNeverRelisted | StaleListing;

function time(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function newestFirst(
  a: ListingRecord,
  b: ListingRecord,
  pick: (r: ListingRecord) => string | null
): number {
  return (time(pick(b)) ?? 0) - (time(pick(a)) ?? 0);
}

/**
 * Rule 1: "sold but still active".
 *
 * Flags a live listing when its label also has a PAID sale we can see.
 * Deliberately quiet about:
 *  - unpaid sales (a sold-unpaid item that was relisted is normal),
 *  - paid sales older than 60 days (we cannot see them reliably),
 *  - listings with more than one in stock (a sale is expected there),
 *  - listings with no label.
 */
export function findSoldButStillActive(
  lists: SellingLists,
  options: RuleOptions = {}
): SoldButStillActive[] {
  const now = (options.now ?? new Date()).getTime();
  const cutoff = now - SALES_WINDOW_DAYS * DAY_MS;

  const paidSalesByLabel = new Map<string, ListingRecord[]>();
  for (const sale of lists.sold) {
    const label = normalizeLabel(sale.sku);
    if (!label) continue;
    if (sale.paid !== true) continue; // unpaid or unknown: stay quiet
    const soldAt = time(sale.soldAt);
    if (soldAt !== null && soldAt < cutoff) continue; // too old to trust
    const list = paidSalesByLabel.get(label) ?? [];
    list.push(sale);
    paidSalesByLabel.set(label, list);
  }

  const findings: SoldButStillActive[] = [];
  for (const active of lists.active) {
    const label = normalizeLabel(active.sku);
    if (!label) continue;
    if ((active.quantityAvailable ?? 1) > 1) continue; // multi-quantity
    const sales = paidSalesByLabel.get(label);
    if (!sales || sales.length === 0) continue;

    const sorted = [...sales].sort((a, b) =>
      newestFirst(a, b, (r) => r.soldAt)
    );
    const activeStart = time(active.startTime);
    const newestSale = time(sorted[0]?.soldAt ?? null);
    findings.push({
      rule: "sold_but_still_active",
      label,
      active,
      sales: sorted,
      listedAfterSale:
        activeStart !== null && newestSale !== null && activeStart > newestSale,
    });
  }
  return findings.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
}

/**
 * Rule 2: "ended but never relisted".
 *
 * Flags a label when its most recent listing ended unsold, eBay did not mark
 * it as relisted, and the label has no live listing and no sale.
 * Unlabeled listings are ignored (Day 4 handles those).
 */
export function findEndedNeverRelisted(
  lists: SellingLists
): EndedNeverRelisted[] {
  const hasLive = new Set<string>();
  for (const r of lists.active) {
    const label = normalizeLabel(r.sku);
    if (label) hasLive.add(label);
  }
  const hasSale = new Set<string>();
  for (const r of lists.sold) {
    const label = normalizeLabel(r.sku);
    if (label) hasSale.add(label);
  }

  const endedByLabel = new Map<string, ListingRecord[]>();
  for (const r of lists.endedUnsold) {
    const label = normalizeLabel(r.sku);
    if (!label) continue;
    const list = endedByLabel.get(label) ?? [];
    list.push(r);
    endedByLabel.set(label, list);
  }

  const findings: EndedNeverRelisted[] = [];
  for (const [label, ended] of endedByLabel) {
    if (hasLive.has(label) || hasSale.has(label)) continue;
    const sorted = [...ended].sort((a, b) =>
      newestFirst(a, b, (r) => r.endTime)
    );
    const latest = sorted[0];
    if (!latest || latest.relisted) continue; // eBay says it was relisted
    findings.push({
      rule: "ended_never_relisted",
      label,
      ended: latest,
      earlierEndedCount: sorted.length - 1,
    });
  }
  return findings.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
}

/**
 * Rule 3: "no watchers for a long time".
 *
 * eBay only reports the watcher count right now, so we remember it on every
 * sync. A live listing is flagged when ALL of these hold:
 *  - it has been live at least 90 days (eBay keeps the original start date),
 *  - nobody is watching it now,
 *  - we have not seen a watcher on it in the last 90 days,
 *  - its label has no sale in the last 90 days (a seller with several in stock
 *    may sell without watchers).
 * Works with unlabeled listings too. Skipped entirely if the watcher memory
 * could not be loaded.
 */
export function findStaleListings(
  lists: SellingLists,
  options: RuleOptions = {}
): StaleListing[] {
  const watchStates = options.watchStates;
  if (!watchStates) return [];

  const now = (options.now ?? new Date()).getTime();
  const staleDays = options.staleDays ?? STALE_DAYS;
  const cutoff = now - staleDays * DAY_MS;

  const recentlySold = new Set<string>();
  for (const sale of lists.sold) {
    const label = normalizeLabel(sale.sku);
    const soldAt = time(sale.soldAt);
    if (label && soldAt !== null && soldAt >= cutoff) recentlySold.add(label);
  }

  const found: StaleListing[] = [];
  for (const listing of lists.active) {
    const started = time(listing.startTime);
    if (started === null || started > cutoff) continue;
    if ((listing.watchCount ?? 0) > 0) continue;

    const state = watchStates.get(listing.itemId);
    if (!state) continue;
    const lastWatched = time(state.lastWatchedAt);
    if (lastWatched !== null && lastWatched > cutoff) continue;

    const label = normalizeLabel(listing.sku);
    if (label && recentlySold.has(label)) continue;

    found.push({
      rule: "stale_listing",
      label,
      listing,
      listedDays: Math.floor((now - started) / DAY_MS),
      lastWatchedAt: state.lastWatchedAt,
      watchingSince: state.firstSeenAt,
    });
  }
  return found.sort((a, b) => b.listedDays - a.listedDays);
}

/** All the checks together. */
export function runListingRules(
  lists: SellingLists,
  options: RuleOptions = {}
): Finding[] {
  return [
    ...findSoldButStillActive(lists, options),
    ...findEndedNeverRelisted(lists),
    ...findStaleListings(lists, options),
  ];
}
