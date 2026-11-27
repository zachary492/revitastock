import { NextRequest, NextResponse } from "next/server";
import { computeChallengeResponse } from "@/lib/ebay/accountDeletion";
import { getEbayApiBase } from "@/lib/ebay/oauth";
import {
  getApplicationToken,
  makePublicKeyFetcher,
  parseDeletionNotice,
  checkEbayNotification,
} from "@/lib/ebay/notificationVerify";
import { deleteUsers, findUsersForNotice } from "@/lib/ebay/deleteSeller";
import { createAdminClient } from "@/lib/supabase/admin";

// eBay's one-time ownership check: GET ?challenge_code=...
export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN?.trim();
  const endpoint = process.env.EBAY_DELETION_ENDPOINT?.trim();

  if (!challengeCode || !token || !endpoint) {
    return NextResponse.json({ error: "not configured" }, { status: 400 });
  }

  return NextResponse.json({
    challengeResponse: computeChallengeResponse(challengeCode, token, endpoint),
  });
}

// Real deletion notices arrive here. We check eBay's signature, then delete
// the seller's RevitaSync account and all of their stored data.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    console.error("Account deletion: eBay app credentials are not set.");
    return new NextResponse(null, { status: 500 });
  }

  const apiBase = getEbayApiBase();
  const check = await checkEbayNotification({
    rawBody,
    signatureHeader: request.headers.get("x-ebay-signature"),
    getPublicKey: makePublicKeyFetcher(apiBase, () =>
      getApplicationToken(apiBase, clientId, clientSecret)
    ),
  });
  if (!check.ok) {
    // The reason separates a stranger's request (no-header) from a real eBay
    // notice we could not verify. No notice content or keys are logged.
    console.warn(
      `Account deletion: signature check failed (${check.reason}${check.detail ? `: ${check.detail}` : ""}); notice ignored.`
    );
    return new NextResponse(null, { status: 412 });
  }

  let notice;
  try {
    notice = parseDeletionNotice(JSON.parse(rawBody));
  } catch {
    notice = null;
  }
  if (!notice) {
    // Signed by eBay but not a deletion notice we can read. Nothing to delete.
    console.warn("Account deletion: signed notice had no usable seller identity.");
    return new NextResponse(null, { status: 200 });
  }

  try {
    const admin = createAdminClient();
    const userIds = await findUsersForNotice(admin, notice);
    await deleteUsers(admin, userIds);
    // Counts only: never log names or ids from the notice.
    console.log(
      `Account deletion ${notice.notificationId ?? "?"}: deleted ${userIds.length} account(s).`
    );
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("Account deletion failed:", err instanceof Error ? err.message : err);
    // Not 2xx, so eBay retries.
    return new NextResponse(null, { status: 500 });
  }
}
