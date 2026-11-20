import { describe, it, expect } from "vitest";
import {
  isAuthorizedCron,
  orderTargets,
  runDailySync,
  type SyncOutcome,
  type SyncTarget,
} from "../../src/lib/sync/dailySync";

describe("isAuthorizedCron", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
  });
  it("rejects wrong, missing or empty secrets", () => {
    expect(isAuthorizedCron("Bearer nope", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer s3cret!", "s3cret")).toBe(false);
  });
});

const t = (userId: string, lastSyncAt: string | null): SyncTarget => ({ userId, lastSyncAt });

describe("orderTargets", () => {
  it("puts never-synced first, then oldest, without changing the input", () => {
    const input = [t("c", "2026-11-18T00:00:00Z"), t("a", null), t("b", "2026-11-10T00:00:00Z")];
    expect(orderTargets(input).map((x) => x.userId)).toEqual(["a", "b", "c"]);
    expect(input[0]?.userId).toBe("c");
  });
});

function harness(overrides: Partial<Parameters<typeof runDailySync>[0]> = {}) {
  const synced: string[] = [];
  const recorded: { id: string; status: string; message: string }[] = [];
  let clock = Date.parse("2026-11-20T08:00:00Z");
  const options = {
    targets: [] as SyncTarget[],
    now: () => clock,
    syncOne: async (id: string): Promise<SyncOutcome> => {
      synced.push(id);
      clock += 10_000;
      return { ok: true, message: "fine" };
    },
    record: async (id: string, status: string, message: string) => {
      recorded.push({ id, status, message });
    },
    ...overrides,
  };
  return { options, synced, recorded };
}

describe("runDailySync", () => {
  it("syncs everyone and records each result", async () => {
    const h = harness();
    h.options.targets = [t("a", null), t("b", null)];
    const s = await runDailySync(h.options);
    expect(s).toMatchObject({ total: 2, synced: 2, failed: 0 });
    expect(h.recorded.map((r) => r.status)).toEqual(["ok", "ok"]);
  });

  it("skips sellers synced in the last 20 hours unless minHours is 0", async () => {
    const recent = "2026-11-19T20:00:00Z"; // 12 hours before the fake clock
    const a = harness();
    a.options.targets = [t("a", recent), t("b", null)];
    const s1 = await runDailySync(a.options);
    expect(s1.skippedRecent).toBe(1);
    expect(a.synced).toEqual(["b"]);

    const b = harness({ minHoursBetween: 0 });
    b.options.targets = [t("a", recent)];
    expect((await runDailySync(b.options)).synced).toBe(1);
  });

  it("keeps going after one seller fails or throws", async () => {
    const h = harness({
      syncOne: async (id) => {
        if (id === "a") throw new Error("boom");
        if (id === "b") return { ok: false, status: "reconnect_required", message: "expired" };
        return { ok: true, message: "fine" };
      },
    });
    h.options.targets = [t("a", null), t("b", null), t("c", null)];
    const s = await runDailySync(h.options);
    expect(s).toMatchObject({ synced: 1, failed: 2 });
    expect(h.recorded.map((r) => r.status)).toEqual(["error", "reconnect_required", "ok"]);
    expect(h.recorded[0]?.message).toBe("boom");
  });

  it("stops starting new sellers when the time budget is used up", async () => {
    const h = harness({ budgetMs: 25_000 }); // each seller takes 10 s
    h.options.targets = [t("a", null), t("b", null), t("c", null), t("d", null), t("e", null)];
    const s = await runDailySync(h.options);
    expect(h.synced).toEqual(["a", "b", "c"]);
    expect(s.notReached).toBe(2);
  });

  it("survives a failure while recording", async () => {
    const h = harness({
      record: async () => {
        throw new Error("db down");
      },
    });
    h.options.targets = [t("a", null), t("b", null)];
    expect((await runDailySync(h.options)).synced).toBe(2);
  });

  it("does nothing, harmlessly, with no sellers", async () => {
    const h = harness();
    expect(await runDailySync(h.options)).toEqual({
      total: 0, synced: 0, failed: 0, skippedRecent: 0, notReached: 0,
    });
  });
});
