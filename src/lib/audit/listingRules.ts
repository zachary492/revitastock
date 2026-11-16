import type { ListingRecord, SellingLists } from "../ebay/sellingLists";
import { normalizeLabel } from "../listings/organize";

/** eBay only lets us see sales from the last 60 days. */
export const SALES_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RuleOptions {
  /** "Today". Only tests need to set this. */
  now?: Date;
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

export type Finding = SoldButStillActive | EndedNeverRelisted;

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

/** Both rules together. */
export function runListingRules(
  lists: SellingLists,
  options: RuleOptions = {}
): Finding[] {
  return [
    ...findSoldButStillActive(lists, options),
    ...findEndedNeverRelisted(lists),
  ];
}