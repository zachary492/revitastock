import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingRecord } from "../ebay/sellingLists";
import {
  fetchItemDetails,
  type DetailFetchResult,
  type ItemDetails,
  type ItemSpecific,
} from "../ebay/itemDetails";

const PAGE = 1000;
const BATCH = 200;
const DAY_MS = 86_400_000;

/** Re-read a listing's details at least this often (days). */
export const DETAILS_MAX_AGE_DAYS = 14;
/** At most this many listings are read from eBay per run (keeps runs fast and polite). */
export const DETAILS_PER_RUN = 20;

export interface StoredDetails extends ItemDetails {
  fetchedAt: string;
}

interface DetailRow {
  user_id: string;
  item_id: string;
  title: string;
  description_length: number;
  picture_count: number;
  specifics: ItemSpecific[];
  fetched_at: string;
}

export function toDetailRow(userId: string, d: StoredDetails): DetailRow {
  return {
    user_id: userId,
    item_id: d.itemId,
    title: d.title,
    description_length: d.descriptionLength,
    picture_count: d.pictureCount,
    specifics: d.specifics,
    fetched_at: d.fetchedAt,
  };
}

interface SavedDetailRow {
  item_id: string;
  title: string | null;
  description_length: number | null;
  picture_count: number | null;
  specifics: unknown;
  fetched_at: string;
}

function readSpecifics(value: unknown): ItemSpecific[] {
  if (!Array.isArray(value)) return [];
  const out: ItemSpecific[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { name, values } = entry as { name?: unknown; values?: unknown };
    if (typeof name !== "string") continue;
    out.push({
      name,
      values: Array.isArray(values) ? values.filter((v): v is string => typeof v === "string") : [],
    });
  }
  return out;
}

export function fromDetailRow(row: SavedDetailRow): StoredDetails {
  return {
    itemId: row.item_id,
    title: row.title ?? "",
    descriptionLength: row.description_length ?? 0,
    pictureCount: row.picture_count ?? 0,
    specifics: readSpecifics(row.specifics),
    fetchedAt: row.fetched_at,
  };
}

export async function loadDetails(
  supabase: SupabaseClient,
  userId: string
): Promise<{ details: Map<string, StoredDetails>; error?: string }> {
  const details = new Map<string, StoredDetails>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("listing_details")
      .select("item_id, title, description_length, picture_count, specifics, fetched_at")
      .eq("user_id", userId)
      .order("item_id")
      .range(from, from + PAGE - 1);
    if (error) return { details, error: error.message };
    for (const row of (data ?? []) as SavedDetailRow[]) {
      const d = fromDetailRow(row);
      details.set(d.itemId, d);
    }
    if (!data || data.length < PAGE) break;
  }
  return { details };
}

export async function saveDetails(
  supabase: SupabaseClient,
  userId: string,
  rows: StoredDetails[]
): Promise<{ error?: string }> {
  const payload = rows.map((d) => toDetailRow(userId, d));
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await supabase
      .from("listing_details")
      .upsert(payload.slice(i, i + BATCH), { onConflict: "user_id,item_id" });
    if (error) return { error: error.message };
  }
  return {};
}

/** Which live listings need their details (re)read, most urgent first. */
export function needingRefresh(
  active: ListingRecord[],
  stored: ReadonlyMap<string, StoredDetails>,
  now: Date
): ListingRecord[] {
  const maxAge = DETAILS_MAX_AGE_DAYS * DAY_MS;
  const urgency = (r: ListingRecord): number | null => {
    const s = stored.get(r.itemId);
    if (!s) return 0; // never read
    if (s.title !== r.title) return 1; // the title was edited
    const age = now.getTime() - Date.parse(s.fetchedAt);
    return age >= maxAge ? 2 : null; // stale copy
  };
  return active
    .filter((r) => r.status === "active" && urgency(r) !== null)
    .sort((a, b) => {
      const ua = urgency(a) ?? 9;
      const ub = urgency(b) ?? 9;
      if (ua !== ub) return ua - ub;
      const fa = Date.parse(stored.get(a.itemId)?.fetchedAt ?? "") || 0;
      const fb = Date.parse(stored.get(b.itemId)?.fetchedAt ?? "") || 0;
      return fa - fb;
    });
}

export interface RefreshOptions {
  supabase: SupabaseClient;
  userId: string;
  accessToken: string;
  active: ListingRecord[];
  fetcher?: (itemId: string) => Promise<DetailFetchResult>;
  now?: () => Date;
  max?: number;
  concurrency?: number;
  budgetMs?: number;
}

export interface RefreshResult {
  /** Details for live listings (saved copies plus anything just read). */
  details: Map<string, StoredDetails>;
  fetched: number;
  failed: number;
  /** Live listings still waiting for a first or fresh read. */
  pending: number;
  tokenExpired: boolean;
  warning?: string;
}

/**
 * Reads a limited batch of listings from eBay, saves them, and returns
 * everything we know. Never throws; problems come back as `warning`.
 */
export async function refreshListingDetails(options: RefreshOptions): Promise<RefreshResult> {
  const clock = options.now ?? (() => new Date());
  const fetcher =
    options.fetcher ?? ((itemId: string) => fetchItemDetails(options.accessToken, itemId));
  const max = options.max ?? DETAILS_PER_RUN;
  const budgetMs = options.budgetMs ?? 15_000;
  const concurrency = Math.max(1, options.concurrency ?? 4);

  const loaded = await loadDetails(options.supabase, options.userId);
  if (loaded.error) {
    return {
      details: new Map(),
      fetched: 0,
      failed: 0,
      pending: options.active.length,
      tokenExpired: false,
      warning: `Saved listing details couldn't be read: ${loaded.error}`,
    };
  }
  const details = loaded.details;

  const wanted = needingRefresh(options.active, details, clock());
  const todo = wanted.slice(0, max);
  const startedAt = Date.now();
  const fresh: StoredDetails[] = [];
  let failed = 0;
  let tokenExpired = false;
  let next = 0;

  const worker = async () => {
    for (;;) {
      if (tokenExpired || Date.now() - startedAt > budgetMs) return;
      const index = next++;
      const listing = todo[index];
      if (!listing) return;
      const result = await fetcher(listing.itemId);
      if (result.ok) {
        fresh.push({ ...result.details, itemId: listing.itemId, fetchedAt: clock().toISOString() });
      } else {
        failed++;
        if (result.expiredToken) tokenExpired = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));

  let warning: string | undefined;
  if (fresh.length > 0) {
    const saved = await saveDetails(options.supabase, options.userId, fresh);
    if (saved.error) warning = `Saving listing details failed: ${saved.error}`;
    for (const d of fresh) details.set(d.itemId, d);
  }

  const pending = needingRefresh(options.active, details, clock()).length;
  return { details, fetched: fresh.length, failed, pending, tokenExpired, warning };
}
