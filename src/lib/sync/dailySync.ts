import { timingSafeEqual } from "node:crypto";

/** True only when the request carries `Bearer <CRON_SECRET>`. */
export function isAuthorizedCron(
  authorizationHeader: string | null,
  secret: string | undefined
): boolean {
  const expected = secret?.trim();
  if (!expected || !authorizationHeader) return false;
  const given = Buffer.from(authorizationHeader.trim());
  const wanted = Buffer.from(`Bearer ${expected}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export interface SyncTarget {
  userId: string;
  lastSyncAt: string | null;
}

export type SyncOutcome =
  | { ok: true; message: string }
  | { ok: false; status: "reconnect_required" | "error" | "not_connected"; message: string };

export interface DailySyncOptions {
  targets: SyncTarget[];
  syncOne: (userId: string) => Promise<SyncOutcome>;
  record: (userId: string, status: string, message: string) => Promise<void>;
  /** Current time in milliseconds. */
  now?: () => number;
  /** Stop starting new sellers after this many milliseconds. */
  budgetMs?: number;
  /** Skip sellers synced more recently than this (hours). 0 = never skip. */
  minHoursBetween?: number;
}

export interface DailySyncSummary {
  total: number;
  synced: number;
  failed: number;
  skippedRecent: number;
  notReached: number;
}

/** Oldest sync first; never-synced sellers go before everyone. */
export function orderTargets(targets: SyncTarget[]): SyncTarget[] {
  const time = (t: SyncTarget) => (t.lastSyncAt ? Date.parse(t.lastSyncAt) : -Infinity);
  return [...targets].sort((a, b) => time(a) - time(b));
}

/**
 * Syncs each seller one at a time. One seller's failure never stops the
 * others, and when time runs short the rest wait for tomorrow's run (they
 * will be first in line because they were synced longest ago).
 */
export async function runDailySync(options: DailySyncOptions): Promise<DailySyncSummary> {
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? 45_000;
  const minMs = (options.minHoursBetween ?? 20) * 3_600_000;

  const summary: DailySyncSummary = {
    total: options.targets.length,
    synced: 0,
    failed: 0,
    skippedRecent: 0,
    notReached: 0,
  };

  const ordered = orderTargets(options.targets);
  for (let i = 0; i < ordered.length; i++) {
    const target = ordered[i]!;

    if (now() - started > budget) {
      summary.notReached = ordered.length - i;
      break;
    }
    if (
      minMs > 0 &&
      target.lastSyncAt &&
      now() - Date.parse(target.lastSyncAt) < minMs
    ) {
      summary.skippedRecent++;
      continue;
    }

    let outcome: SyncOutcome;
    try {
      outcome = await options.syncOne(target.userId);
    } catch (err) {
      outcome = {
        ok: false,
        status: "error",
        message: err instanceof Error ? err.message : "Unexpected error.",
      };
    }

    try {
      await options.record(
        target.userId,
        outcome.ok ? "ok" : outcome.status,
        outcome.message
      );
    } catch {
      // Failing to write the note must not stop the other sellers.
    }
    if (outcome.ok) summary.synced++;
    else summary.failed++;
  }
  return summary;
}
