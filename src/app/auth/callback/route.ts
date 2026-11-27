import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the link in the confirmation email lands. If the seller opened the
 * link in the same browser they signed up in, they are signed in and go to
 * the dashboard. Otherwise (for example the link was opened on a phone) the
 * email is still confirmed, so we send them to log in.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  return NextResponse.redirect(new URL("/auth?notice=confirmed", request.url));
}
