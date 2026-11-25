import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUsers, findUsersForNotice } from "../../src/lib/ebay/deleteSeller";
import { buildGetUserRequest, ensureEbayIdentity, parseGetUser } from "../../src/lib/ebay/identity";

type Row = { user_id: string; ebay_username?: string | null; ebay_eias_token?: string | null; ebay_user_id?: string | null };
function fakeAdmin(rows: Row[], opts: { deleteError?: string; queryError?: string } = {}) {
  const deleted: string[] = [];
  const updates: unknown[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: (col: keyof Row, val: string) => {
          const result = opts.queryError
            ? { data: null, error: { message: opts.queryError } }
            : { data: rows.filter((r) => r[col] === val).map((r) => ({ user_id: r.user_id })), error: null };
          const p = Promise.resolve(result) as Promise<typeof result> & { maybeSingle: () => Promise<unknown> };
          p.maybeSingle = async () => ({ data: rows.find((r) => r[col] === val) ?? null, error: null });
          return p;
        },
      }),
      update: (v: unknown) => ({ eq: async () => { updates.push(v); return { error: null }; } }),
    }),
    auth: { admin: { deleteUser: async (id: string) => { deleted.push(id); return { error: opts.deleteError ? { message: opts.deleteError } : null }; } } },
  } as unknown as SupabaseClient;
  return { client, deleted, updates };
}

describe("findUsersForNotice", () => {
  const rows: Row[] = [
    { user_id: "u1", ebay_username: "seller_1", ebay_eias_token: "E1" },
    { user_id: "u2", ebay_username: "seller_2", ebay_eias_token: "E2" },
    { user_id: "u3", ebay_username: "sellerx1" },
  ];
  it("matches exactly, with no wildcard matching on underscores", async () => {
    const { client } = fakeAdmin(rows);
    expect(await findUsersForNotice(client, { notificationId: null, username: "seller_1", userId: null, eiasToken: null })).toEqual(["u1"]);
    expect(await findUsersForNotice(client, { notificationId: null, username: "seller_", userId: null, eiasToken: null })).toEqual([]);
  });
  it("combines matches from different identity fields without duplicates", async () => {
    const { client } = fakeAdmin(rows);
    const ids = await findUsersForNotice(client, { notificationId: null, username: "seller_1", userId: null, eiasToken: "E2" });
    expect(ids.sort()).toEqual(["u1", "u2"]);
    expect(await findUsersForNotice(client, { notificationId: null, username: "seller_1", userId: null, eiasToken: "E1" })).toEqual(["u1"]);
  });
  it("finds nothing for an unknown seller and throws on a query error", async () => {
    expect(await findUsersForNotice(fakeAdmin(rows).client, { notificationId: null, username: "nobody", userId: null, eiasToken: null })).toEqual([]);
    await expect(findUsersForNotice(fakeAdmin(rows, { queryError: "boom" }).client, { notificationId: null, username: "a", userId: null, eiasToken: null })).rejects.toThrow("boom");
  });
});

describe("deleteUsers", () => {
  it("deletes each account", async () => {
    const { client, deleted } = fakeAdmin([]);
    await deleteUsers(client, ["u1", "u2"]);
    expect(deleted).toEqual(["u1", "u2"]);
  });
  it("treats an already-deleted account as done, but fails on other errors", async () => {
    await expect(deleteUsers(fakeAdmin([], { deleteError: "User not found" }).client, ["u1"])).resolves.toBeUndefined();
    await expect(deleteUsers(fakeAdmin([], { deleteError: "database down" }).client, ["u1"])).rejects.toThrow("database down");
  });
});

describe("eBay identity", () => {
  const xml = `<GetUserResponse><Ack>Success</Ack><User><EIASToken>nY+abc</EIASToken><UserID>Seller_One</UserID></User></GetUserResponse>`;
  it("builds the request and reads the reply", () => {
    expect(buildGetUserRequest()).toContain("<GetUserRequest");
    expect(parseGetUser(xml)).toEqual({ username: "seller_one", eiasToken: "nY+abc" });
    expect(parseGetUser("<GetUserResponse><Ack>Success</Ack></GetUserResponse>")).toBeNull();
  });
  it("saves identity once, and skips when already saved", async () => {
    const fetchImpl = (async () => new Response(xml)) as typeof fetch;
    const a = fakeAdmin([{ user_id: "u1", ebay_username: null }]);
    await ensureEbayIdentity(a.client, "u1", "T", fetchImpl);
    expect(a.updates).toEqual([{ ebay_username: "seller_one", ebay_eias_token: "nY+abc" }]);
    const b = fakeAdmin([{ user_id: "u1", ebay_username: "seller_one" }]);
    await ensureEbayIdentity(b.client, "u1", "T", fetchImpl);
    expect(b.updates).toEqual([]);
  });
  it("never throws if eBay is unreachable", async () => {
    const a = fakeAdmin([{ user_id: "u1", ebay_username: null }]);
    await expect(ensureEbayIdentity(a.client, "u1", "T", (async () => { throw new Error("net"); }) as typeof fetch)).resolves.toBeUndefined();
    expect(a.updates).toEqual([]);
  });
});
