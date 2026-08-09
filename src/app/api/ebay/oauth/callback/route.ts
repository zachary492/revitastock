import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/ebay/oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?ebay_error=no_code", request.url)
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // One connection per seller — replace if they reconnect.
    await supabase.from("ebay_connections").delete().eq("user_id", user.id);

    const { error } = await supabase.from("ebay_connections").insert({
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt.toISOString(),
    });

    if (error) throw new Error(error.message);

    return NextResponse.redirect(
      new URL("/settings?ebay=connected", request.url)
    );
  } catch (err) {
    console.error("eBay OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/settings?ebay_error=token_exchange_failed", request.url)
    );
  }
}
