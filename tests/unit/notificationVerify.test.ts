import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign } from "crypto";
import {
  makePublicKeyFetcher, parseDeletionNotice, parseSignatureHeader, toPem, verifyEbayNotification, checkEbayNotification,
} from "../../src/lib/ebay/notificationVerify";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const bare = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");

const body = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: { username: "Seller_1" } } });
function sign(text: string, digest = "sha1"): string {
  const s = createSign(digest); s.update(text); s.end();
  return s.sign(privateKey).toString("base64");
}
const header = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64");
const goodHeader = header({ alg: "ecdsa", kid: "kid-1234-abcd", signature: sign(body), digest: "SHA1" });
const keyFor = async (id: string) => (id === "kid-1234-abcd" ? { key: bare, digest: "SHA1" } : null);

describe("signature header", () => {
  it("reads a good header and rejects junk", () => {
    expect(parseSignatureHeader(goodHeader)?.kid).toBe("kid-1234-abcd");
    expect(parseSignatureHeader("not base64 json")).toBeNull();
    expect(parseSignatureHeader(header({ kid: "x" }))).toBeNull();
    expect(parseSignatureHeader(null)).toBeNull();
  });
  it("adds PEM wrapper lines to a bare key", () => {
    expect(toPem(bare)).toContain("BEGIN PUBLIC KEY");
    expect(toPem(pem)).toBe(pem.trim());
  });
});

describe("verifyEbayNotification", () => {
  it("accepts a genuine signature (key without wrapper, SHA1)", async () => {
    expect(await verifyEbayNotification({ rawBody: body, signatureHeader: goodHeader, getPublicKey: keyFor })).toBe(true);
  });
  it("accepts a key that already has PEM lines, and SHA-256", async () => {
    const h = header({ kid: "kid-1234-abcd", signature: sign(body, "sha256") });
    expect(await verifyEbayNotification({
      rawBody: body, signatureHeader: h, getPublicKey: async () => ({ key: pem, digest: "SHA256" }),
    })).toBe(true);
  });
  it("rejects a changed body", async () => {
    expect(await verifyEbayNotification({ rawBody: body.replace("Seller_1", "Seller_2"), signatureHeader: goodHeader, getPublicKey: keyFor })).toBe(false);
  });
  it("rejects a signature from a different key", async () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const s = createSign("sha1"); s.update(body); s.end();
    const h = header({ kid: "kid-1234-abcd", signature: s.sign(other.privateKey).toString("base64") });
    expect(await verifyEbayNotification({ rawBody: body, signatureHeader: h, getPublicKey: keyFor })).toBe(false);
  });
  it("rejects missing header, unknown key, key lookup failure, odd digest", async () => {
    expect(await verifyEbayNotification({ rawBody: body, signatureHeader: undefined, getPublicKey: keyFor })).toBe(false);
    expect(await verifyEbayNotification({ rawBody: body, signatureHeader: header({ kid: "other-kid-123", signature: "AAAA" }), getPublicKey: keyFor })).toBe(false);
    expect(await verifyEbayNotification({ rawBody: body, signatureHeader: goodHeader, getPublicKey: async () => { throw new Error("down"); } })).toBe(false);
    expect(await verifyEbayNotification({ rawBody: body, signatureHeader: goodHeader, getPublicKey: async () => ({ key: bare, digest: "md5" }) })).toBe(false);
  });
});

describe("public key fetcher", () => {
  it("asks eBay once, then uses its cache, and refuses odd key ids", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response(JSON.stringify({ key: bare, digest: "SHA1" }), { status: 200 }); }) as typeof fetch;
    const get = makePublicKeyFetcher("https://api.ebay.com", async () => "app-token", fetchImpl);
    expect((await get("cache-test-kid-1"))?.key).toBe(bare);
    await get("cache-test-kid-1");
    expect(calls).toBe(1);
    expect(await get("../../etc/passwd")).toBeNull();
    expect(calls).toBe(1);
  });
  it("throws (with the status) when eBay refuses", async () => {
    const fetchImpl = (async () => new Response("no", { status: 404 })) as typeof fetch;
    const get = makePublicKeyFetcher("https://api.ebay.com", async () => "t", fetchImpl);
    await expect(get("missing-kid-1234")).rejects.toThrow("404");
  });
});

describe("public key shapes eBay may send", () => {
  const shapes: Record<string, string> = {
    bare: bare,
    "wrapped, real line breaks": pem,
    "wrapped on one line": `-----BEGIN PUBLIC KEY-----${bare}-----END PUBLIC KEY-----`,
    "wrapped with literal backslash-n": pem.trim().split("\n").join("\\n"),
    "wrapped, windows line breaks": pem.trim().split("\n").join("\r\n"),
  };
  for (const [name, key] of Object.entries(shapes)) {
    it(`verifies with a key sent as: ${name}`, async () => {
      const getKey = async () => ({ key, digest: "SHA1" });
      expect(await checkEbayNotification({ rawBody: body, signatureHeader: goodHeader, getPublicKey: getKey })).toEqual({ ok: true });
    });
  }
});

describe("checkEbayNotification reasons", () => {
  it("is ok for a good signature", async () => {
    expect(await checkEbayNotification({ rawBody: body, signatureHeader: goodHeader, getPublicKey: keyFor })).toEqual({ ok: true });
  });
  it("says no-header when the header is missing", async () => {
    expect(await checkEbayNotification({ rawBody: body, signatureHeader: null, getPublicKey: keyFor })).toMatchObject({ ok: false, reason: "no-header" });
  });
  it("says bad-header when the header is not readable", async () => {
    expect(await checkEbayNotification({ rawBody: body, signatureHeader: "not-base64-json", getPublicKey: keyFor })).toMatchObject({ ok: false, reason: "bad-header" });
  });
  it("says key-unavailable when the key cannot be fetched", async () => {
    const failing = async () => { throw new Error("eBay public key request failed (401)."); };
    expect(await checkEbayNotification({ rawBody: body, signatureHeader: goodHeader, getPublicKey: failing })).toMatchObject({ ok: false, reason: "key-unavailable", detail: expect.stringContaining("401") });
  });
  it("says signature-mismatch when the body was changed", async () => {
    expect(await checkEbayNotification({ rawBody: body + " ", signatureHeader: goodHeader, getPublicKey: keyFor })).toMatchObject({ ok: false, reason: "signature-mismatch" });
  });
});

describe("parseDeletionNotice", () => {
  it("reads identity fields and lower-cases the user name", () => {
    expect(parseDeletionNotice(JSON.parse(body))).toMatchObject({ username: "seller_1", userId: null, eiasToken: null });
    expect(parseDeletionNotice({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n1", data: { username: "A", userId: "U1", eiasToken: "E1" } } }))
      .toEqual({ notificationId: "n1", username: "a", userId: "U1", eiasToken: "E1" });
  });
  it("ignores other topics and notices with no identity", () => {
    expect(parseDeletionNotice({ metadata: { topic: "SOMETHING_ELSE" }, notification: { data: { username: "a" } } })).toBeNull();
    expect(parseDeletionNotice({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: {} } })).toBeNull();
    expect(parseDeletionNotice(null)).toBeNull();
    expect(parseDeletionNotice("x")).toBeNull();
  });
});
