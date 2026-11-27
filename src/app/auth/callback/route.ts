import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the link in the confirmation email lands. If the seller opened the
 * link in the same browser they signed up in, they are signed in and go to
 * the dashboard. Otherwise (for example the link was opened on a phone) the
 * email is still confirmed, so we send them to log in.
 *
 * This route must never show an error page: whatever goes wrong, the seller
 * lands on the log-in page. The reason is written to the server log (never
 * the code itself) so we can find the cause.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      console.error("auth/callback: code exchange refused:", error.name, error.message);
    } catch (err) {
      console.error(
        "auth/callback: code exchange threw:",
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      );
    }
  }
  return NextResponse.redirect(new URL("/auth?notice=confirmed", request.url));
}
