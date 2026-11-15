import type { ListingRecord, SellingLists } from "../ebay/sellingLists";

export interface ListingRow extends ListingRecord {
  /** How many listings (any status) share this listing's label. 0 if no label. */
  sameLabelCount: number;
}

export const FILTERS = [
  "all",
  "active",
  "sold",
  "ended",
  "unlabeled",
  "shared",
] as const;
export type ListingFilter = (typeof FILTERS)[number];

export function isFilter(value: string | undefined): value is ListingFilter {
  return FILTERS.includes(value as ListingFilter);
}

/** Labels are compared ignoring spaces and capital letters. */
export function normalizeLabel(label: string | null): string | null {
  const trimmed = label?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

const STATUS_ORDER: Record<ListingRecord["status"], number> = {
  active: 0,
  ended_unsold: 1,
  sold: 2,
};

function byStatusThenNewest(a: ListingRecord, b: ListingRecord): number {
  const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (status !== 0) return status;
  // Newest first; listings with no start time go last.
  return (b.startTime ?? "").localeCompare(a.startTime ?? "");
}

/** Puts every listing in one list: labeled first (grouped), then unlabeled. */
export function organizeListings(lists: SellingLists): ListingRow[] {
  const all = [...lists.active, ...lists.endedUnsold, ...lists.sold];

  const counts = new Map<string, number>();
  for (const record of all) {
    const key = normalizeLabel(record.sku);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows: ListingRow[] = all.map((record) => {
    const key = normalizeLabel(record.sku);
    return { ...record, sameLabelCount: key ? (counts.get(key) ?? 0) : 0 };
  });

  return rows.sort((a, b) => {
    const labelA = normalizeLabel(a.sku);
    const labelB = normalizeLabel(b.sku);
    if (labelA && !labelB) return -1;
    if (!labelA && labelB) return 1;
    if (labelA && labelB && labelA !== labelB) {
      return labelA.localeCompare(labelB, "en", { numeric: true });
    }
    return byStatusThenNewest(a, b);
  });
}

export function filterListings(
  rows: ListingRow[],
  filter: ListingFilter
): ListingRow[] {
  switch (filter) {
    case "active":
      return rows.filter((r) => r.status === "active");
    case "sold":
      return rows.filter((r) => r.status === "sold");
    case "ended":
      return rows.filter((r) => r.status === "ended_unsold");
    case "unlabeled":
      return rows.filter((r) => normalizeLabel(r.sku) === null);
    case "shared":
      return rows.filter((r) => r.sameLabelCount > 1);
    default:
      return rows;
  }
}

export interface ListingSummary {
  total: number;
  active: number;
  sold: number;
  endedUnsold: number;
  labeled: number;
  unlabeled: number;
  sharedLabels: number; // number of distinct labels used by more than one listing
}

export function summarize(rows: ListingRow[]): ListingSummary {
  const shared = new Set<string>();
  for (const row of rows) {
    const key = normalizeLabel(row.sku);
    if (key && row.sameLabelCount > 1) shared.add(key);
  }
  const labeled = rows.filter((r) => normalizeLabel(r.sku) !== null).length;
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    sold: rows.filter((r) => r.status === "sold").length,
    endedUnsold: rows.filter((r) => r.status === "ended_unsold").length,
    labeled,
    unlabeled: rows.length - labeled,
    sharedLabels: shared.size,
  };
}