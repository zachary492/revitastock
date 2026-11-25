import Link from "next/link";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ account_deleted?: string }>;
}) {
  const { account_deleted } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      {account_deleted && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Your account and data have been deleted.
        </p>
      )}
      <h1 className="text-3xl font-semibold tracking-tight">RevitaSync</h1>
      <p className="text-gray-600">
        Catch eBay listing problems before they cost you a sale. RevitaSync checks your listings
        for items that sold but are still live, listings that ended and were never relisted, and
        titles that don&apos;t match the item details, so you can fix them quickly.
      </p>
      <a
        href="/auth"
        className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Get started
      </a>
      <p className="text-xs text-gray-500">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
      </p>
    </main>
  );
}
