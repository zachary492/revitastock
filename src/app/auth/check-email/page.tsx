import Link from "next/link";
import ResendButton from "@/components/auth/ResendButton";

export const metadata = { title: "Check your email · RevitaSync" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email: raw } = await searchParams;
  const email = typeof raw === "string" && raw.length <= 200 ? raw : "";

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mb-6 text-sm text-gray-600">
        {email ? (
          <>
            We sent a confirmation link to <span className="font-medium text-gray-900">{email}</span>.
          </>
        ) : (
          "We sent you a confirmation link."
        )}{" "}
        <strong className="font-medium text-gray-900">
          You need to confirm your email before you can use RevitaSync.
        </strong>
      </p>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Look for an email like this
      </p>
      <div className="mb-6 overflow-hidden rounded-md border border-gray-200 bg-white text-sm" aria-label="Example of the confirmation email">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          <p>
            <span className="text-gray-400">From:</span> RevitaSync
          </p>
          <p>
            <span className="text-gray-400">Subject:</span> Confirm your RevitaSync account
          </p>
        </div>
        <div className="px-4 py-4 text-gray-700">
          <p className="mb-3 font-medium text-gray-900">Welcome to RevitaSync</p>
          <p className="mb-4">Click the button to confirm your email and start checking your eBay listings.</p>
          <span className="inline-block rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white">
            Confirm my email
          </span>
        </div>
      </div>

      <ul className="mb-6 list-disc space-y-1 pl-5 text-sm text-gray-600">
        <li>It usually arrives within a minute or two. Check your spam or junk folder too.</li>
        <li>During the beta the sender may show as “Supabase Auth”. That is us.</li>
        <li>After you click the button, come back and log in.</li>
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <ResendButton email={email} />
        <Link href="/auth" className="text-sm text-gray-600 underline underline-offset-2">
          I confirmed it. Log in
        </Link>
      </div>
      <p className="mt-6 text-sm text-gray-500">
        Wrong address?{" "}
        <Link href="/auth/signup" className="underline underline-offset-2">Start again</Link>
      </p>
    </main>
  );
}
