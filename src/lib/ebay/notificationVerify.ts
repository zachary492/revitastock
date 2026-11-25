import { createVerify } from "crypto";

export interface SignatureHeader {
  alg?: string;
  kid: string;
  signature: string;
  digest?: string;
}

/** The X-EBAY-SIGNATURE header is base64 of a small JSON object. */
export function parseSignatureHeader(header: string | null | undefined): SignatureHeader | null {
  if (!header) return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Partial<SignatureHeader>;
    if (typeof parsed.kid !== "string" || typeof parsed.signature !== "string") return null;
    if (!parsed.kid || !parsed.signature) return null;
    return {
      kid: parsed.kid,
      signature: parsed.signature,
      alg: typeof parsed.alg === "string" ? parsed.alg : undefined,
      digest: typeof parsed.digest === "string" ? parsed.digest : undefined,
    };
  } catch {
    return null;
  }
}

/** eBay returns the key without the PEM wrapper lines. Add them if missing. */
export function toPem(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

export interface PublicKeyInfo {
  key: string;
  digest?: string;
}

/**
 * True only when the signature in the header is valid for exactly these raw
 * body bytes, using the public key eBay publishes for that key id.
 */
export async function verifyEbayNotification(options: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  getPublicKey: (keyId: string) => Promise<PublicKeyInfo | null>;
}): Promise<boolean> {
  const header = parseSignatureHeader(options.signatureHeader);
  if (!header) return false;
  let info: PublicKeyInfo | null;
  try {
    info = await options.getPublicKey(header.kid);
  } catch {
    return false;
  }
  if (!info?.key) return false;

  const digest = (info.digest ?? header.digest ?? "sha1").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!["sha1", "sha256", "sha384", "sha512"].includes(digest)) return false;
  try {
    const verifier = createVerify(digest);
    verifier.update(options.rawBody);
    verifier.end();
    return verifier.verify(toPem(info.key), header.signature, "base64");
  } catch {
    return false;
  }
}

const keyCache = new Map<string, { info: PublicKeyInfo; at: number }>();
const KEY_TTL_MS = 60 * 60 * 1000;

/** Fetches (and caches for an hour) eBay's public key for a key id. */
export function makePublicKeyFetcher(
  apiBase: string,
  getAppToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch
): (keyId: string) => Promise<PublicKeyInfo | null> {
  return async (keyId) => {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(keyId)) return null;
    const cached = keyCache.get(keyId);
    if (cached && Date.now() - cached.at < KEY_TTL_MS) return cached.info;

    const token = await getAppToken();
    const res = await fetchImpl(`${apiBase}/commerce/notification/v1/public_key/${keyId}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: unknown; digest?: unknown };
    if (typeof body.key !== "string") return null;
    const info: PublicKeyInfo = {
      key: body.key,
      digest: typeof body.digest === "string" ? body.digest : undefined,
    };
    keyCache.set(keyId, { info, at: Date.now() });
    return info;
  };
}

/** An application token (no seller involved), needed to ask eBay for the key. */
export async function getApplicationToken(
  apiBase: string,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!res.ok) throw new Error(`Application token request failed (${res.status}).`);
  const body = (await res.json()) as { access_token?: unknown };
  if (typeof body.access_token !== "string") throw new Error("No application token returned.");
  return body.access_token;
}

export interface DeletionNotice {
  notificationId: string | null;
  username: string | null;
  userId: string | null;
  eiasToken: string | null;
}

/** Reads the parts of a MARKETPLACE_ACCOUNT_DELETION notice we need. */
export function parseDeletionNotice(body: unknown): DeletionNotice | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    metadata?: { topic?: unknown };
    notification?: { notificationId?: unknown; data?: Record<string, unknown> };
  };
  if (b.metadata?.topic !== "MARKETPLACE_ACCOUNT_DELETION") return null;
  const data = b.notification?.data ?? {};
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const notice: DeletionNotice = {
    notificationId: s(b.notification?.notificationId),
    username: s(data.username)?.toLowerCase() ?? null,
    userId: s(data.userId),
    eiasToken: s(data.eiasToken),
  };
  return notice.username || notice.userId || notice.eiasToken ? notice : null;
}
