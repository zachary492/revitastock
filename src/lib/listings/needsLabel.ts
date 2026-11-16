import type { ListingRecord } from "../ebay/sellingLists";
import { normalizeLabel } from "./organize";

/* ------------------------------------------------------------------ */
/* Title matching                                                       */
/* ------------------------------------------------------------------ */

// Sales talk that sellers change between relists. Ignored when comparing titles.
const HYPE_WORDS = new Set([
  "wow",
  "pristine",
  "excellent",
  "fabulous",
  "amazing",
  "gorgeous",
  "stunning",
  "beautiful",
  "lovely",
  "awesome",
  "perfect",
  "superb",
  "great",
  "extra",
  "nice",
  "mint",
  "rare",
  "look",
]);

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "of",
  "with",
  "for",
  "in",
  "by",
  "on",
  "to",
]);

// Letter sizes. Two titles that differ only in size are different items.
const SIZE_WORDS = new Set([
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "xxxl",
  "sm",
  "med",
  "lg",
  "small",
  "medium",
  "large",
]);

/** The meaningful words of a title: lowercase, no emoji, no prices, no sales talk. */
export function titleTokens(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, " ") // prices like $250 or $5,695
    .replace(/['’`]/g, "") // BURBERRY's -> burberrys
    .replace(/[^\p{L}\p{N}]+/gu, " "); // emoji and punctuation become spaces

  const tokens = new Set<string>();
  for (const word of cleaned.split(" ")) {
    if (!word) continue;
    if (HYPE_WORDS.has(word) || FILLER_WORDS.has(word)) continue;
    tokens.add(word);
  }
  return tokens;
}

export type TitleMatch = "same" | "likely" | null;

function pick(tokens: Set<string>, keep: (t: string) => boolean): string {
  return [...tokens].filter(keep).sort().join(" ");
}

const hasDigit = (t: string) => /\d/.test(t);
const isSize = (t: string) => SIZE_WORDS.has(t);

/**
 * Do two titles look like the same item?
 *  - "same": identical after removing prices, emoji and sales talk.
 *  - "likely": almost identical (at least 75% of the words are shared).
 * Titles never match if their numbers (46R, 40L) or letter sizes (XL, M) differ.
 */
export function compareTitles(a: Set<string>, b: Set<string>): TitleMatch {
  if (a.size === 0 || b.size === 0) return null;
  if (pick(a, hasDigit) !== pick(b, hasDigit)) return null;
  if (pick(a, isSize) !== pick(b, isSize)) return null;

  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  if (shared === a.size && shared === b.size) return "same";

  const union = a.size + b.size - shared;
  return shared / union >= 0.75 ? "likely" : null;
}

/* ------------------------------------------------------------------ */
/* Grouping                                                             */
/* ------------------------------------------------------------------ */

export type NeedsLabelKind =
  | "matches_label" // looks like an item that already has a label
  | "conflict" // looks like one item but two different labels are in the group
  | "new_item"; // no label anywhere in the group

export interface NeedsLabelGroup {
  id: string;
  kind: NeedsLabelKind;
  /** Only set for "matches_label". */
  suggestedLabel: string | null;
  /** "same" if every link in the group was an identical title, otherwise "likely". */
  confidence: "same" | "likely";
  /** The listings with no label that belong to this group, newest first. */
  unlabeled: ListingRecord[];
  /** Labeled listings in the group (they set the suggested label), newest first. */
  labeled: ListingRecord[];
  /** How many unlabeled listings in the group are live right now. */
  liveCount: number;
}

function recordKey(r: ListingRecord): string {
  return `${r.status}|${r.itemId}|${r.soldAt ?? ""}`;
}

function newestFirst(a: ListingRecord, b: ListingRecord): number {
  const timeA = a.soldAt ?? a.endTime ?? a.startTime ?? "";
  const timeB = b.soldAt ?? b.endTime ?? b.startTime ?? "";
  return timeB.localeCompare(timeA);
}

/**
 * Finds listings with no label and groups the ones that look like the same item.
 * If a group also contains a labeled listing, that label is suggested.
 * Nothing is changed on eBay; the seller confirms every suggestion.
 *
 * Compares every pair of listings, which is fine for a few thousand listings.
 */
export function groupUnlabeled(records: ListingRecord[]): NeedsLabelGroup[] {
  const n = records.length;
  const tokens = records.map((r) => titleTokens(r.title));
  const labels = records.map((r) => normalizeLabel(r.sku));

  // Union-find: each listing starts alone, matches pull listings together.
  const parent = records.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] ?? root;
    while (parent[i] !== root) {
      const next = parent[i] ?? root;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const likelyRoots = new Set<number>(); // groups joined by a "likely" link
  const join = (i: number, j: number, likely: boolean) => {
    const a = find(i);
    const b = find(j);
    const wasLikely = likely || likelyRoots.has(a) || likelyRoots.has(b);
    if (a !== b) parent[b] = a;
    if (wasLikely) likelyRoots.add(find(a));
  };

  // 1. Listings with the same label are the same item.
  const firstWithLabel = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const label = labels[i];
    if (!label) continue;
    const first = firstWithLabel.get(label);
    if (first === undefined) firstWithLabel.set(label, i);
    else join(first, i, false);
  }

  // 2. Listings with matching titles look like the same item.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Two different labels are different items on purpose; never merge by title.
      if (labels[i] && labels[j] && labels[i] !== labels[j]) continue;
      const a = tokens[i];
      const b = tokens[j];
      if (!a || !b) continue;
      const match = compareTitles(a, b);
      if (match) join(i, j, match === "likely");
    }
  }

  // 3. Collect groups that contain at least one unlabeled listing.
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(i);
    clusters.set(root, list);
  }

  const groups: NeedsLabelGroup[] = [];
  for (const [root, indexes] of clusters) {
    const unlabeled = indexes
      .filter((i) => !labels[i])
      .map((i) => records[i])
      .filter((r): r is ListingRecord => r !== undefined)
      .sort(newestFirst);
    if (unlabeled.length === 0) continue;

    const labeled = indexes
      .filter((i) => labels[i])
      .map((i) => records[i])
      .filter((r): r is ListingRecord => r !== undefined)
      .sort(newestFirst);
    const distinct = new Set(labeled.map((r) => normalizeLabel(r.sku) ?? ""));

    const kind: NeedsLabelKind =
      distinct.size === 0
        ? "new_item"
        : distinct.size === 1
          ? "matches_label"
          : "conflict";

    const everyKey = [...unlabeled, ...labeled].map(recordKey).sort();
    groups.push({
      id: `${kind}:${everyKey[0] ?? root}`,
      kind,
      suggestedLabel:
        kind === "matches_label" ? ([...distinct][0] ?? null) : null,
      confidence: likelyRoots.has(root) ? "likely" : "same",
      unlabeled,
      labeled,
      liveCount: unlabeled.filter((r) => r.status === "active").length,
    });
  }

  const rank = (g: NeedsLabelGroup): number => {
    if (g.kind === "matches_label") return 0;
    if (g.kind === "conflict") return 1;
    return g.liveCount > 0 ? 2 : 3;
  };
  return groups.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const bySize = b.unlabeled.length - a.unlabeled.length;
    if (bySize !== 0) return bySize;
    return a.id.localeCompare(b.id);
  });
}