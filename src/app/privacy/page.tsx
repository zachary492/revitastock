import Link from "next/link";

export const metadata = { title: "Privacy policy · RevitaSync" };

export default function PrivacyPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2">
        ← Home
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mb-8 text-sm text-gray-500">
        RevitaSync beta. Last updated November 24, 2026.
      </p>

      <div className="space-y-6 text-sm leading-6 text-gray-700">
        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">What RevitaSync does</h2>
          <p>
            RevitaSync checks an eBay seller&apos;s listings for problems such as an item that sold
            but is still listed, a listing that ended and was never relisted, or a title that
            doesn&apos;t match the item details.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">What we store</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>The email address you sign in with.</li>
            <li>
              Your eBay connection: a permission token that lets RevitaSync read your listings. We
              never see or store your eBay password.
            </li>
            <li>
              Your listing information from eBay: titles, prices, custom labels, item specifics,
              categories, description text, photo counts, watcher counts, and your recent sold and
              ended listings (we keep that history so it isn&apos;t lost after eBay stops
              returning it).
            </li>
            <li>
              Inventory you upload yourself, the problems RevitaSync finds, and your choices (for
              example dismissed items and the check settings you set).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">How we use it</h2>
          <p>
            Only to run the checks for you and show you the results. We don&apos;t sell your data,
            share it for advertising, or use it to look at other sellers&apos; shops.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">Changes to your listings</h2>
          <p>
            RevitaSync reads your listings. It does not change them unless you use a feature that
            says it will. Right now the only one is an advanced test on the Settings page that
            re-saves a listing&apos;s existing custom label when you click it.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">Where it is kept</h2>
          <p>
            Your data is stored in a Supabase database and the app runs on Vercel. Each seller can
            only see their own information. The connection to eBay uses eBay&apos;s official
            interfaces.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">Deleting your data</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              On the Settings page, &quot;Delete my account and data&quot; permanently removes your
              RevitaSync account and everything stored about you.
            </li>
            <li>
              If you close your eBay account or ask eBay to delete your data, eBay notifies us and
              we delete your RevitaSync account and data automatically.
            </li>
            <li>
              You can also remove RevitaSync&apos;s access in your eBay account&apos;s settings for
              connected apps.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-medium text-gray-900">Questions</h2>
          <p>
            {contact ? (
              <>
                Email <a className="underline" href={`mailto:${contact}`}>{contact}</a>.
              </>
            ) : (
              "Contact details will be added here before RevitaSync opens to the public."
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
