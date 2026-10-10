import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/dashboard/SignOutButton";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <SignOutButton />
      </div>
      <p className="text-gray-600">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <p className="mt-4 text-sm text-gray-500">
        Inventory upload and discrepancy detection land here next.
      </p>
      <a
        href="/inventory"
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Upload inventory
      </a>
      <a
        href="/settings"
        className="ml-3 mt-6 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Connect eBay
      </a>
    </main>
  );
}
