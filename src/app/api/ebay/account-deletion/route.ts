import { NextRequest, NextResponse } from "next/server";
import { computeChallengeResponse } from "@/lib/ebay/accountDeletion";

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

// Real deletion notices arrive here. For now: acknowledge and log the
// notification id only. TODO before beta: verify eBay's signature and delete
// that seller's stored data.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("eBay account deletion notice:", body?.metadata?.topic ?? "?");
  } catch {
    // Still acknowledge; eBay retries on non-2xx.
  }
  return new NextResponse(null, { status: 200 });
}