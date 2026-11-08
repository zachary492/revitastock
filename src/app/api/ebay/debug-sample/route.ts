import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSellingSampleXml } from "@/lib/ebay/tradingSample";

// TEMPORARY: delete this folder after capturing the sample.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Not signed in", { status: 401 });
  }

  const { data: connection } = await supabase
    .from("ebay_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return new NextResponse("eBay not connected", { status: 400 });
  }

  const xml = await getSellingSampleXml(connection.access_token);
  return new NextResponse(xml, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}