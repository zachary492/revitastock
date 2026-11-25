import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CHECKS, MAX_PHRASES } from "@/lib/audit/checkSettings";
import { loadSellerSettings } from "@/lib/audit/settingsStore";
import { saveChecks } from "./actions";

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const settings = await loadSellerSettings(supabase, user.id);
  const off = new Set(settings.disabledChecks);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/settings"
        className="mb-6 inline-block text-sm text-gray-500 underline underline-offset-2"
      >
        ← Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Listing checks</h1>
      <p className="mb-6 text-sm text-gray-600">
        Choose which listing checks RevitaSync runs for you, and add words your
        descriptions should always contain. Changes apply the next time the audit
        runs (the daily sync, or the button on Needs attention).
      </p>

      {saved && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Saved.</p>
      )}
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t save. Please try again.
        </p>
      )}

      <form action={saveChecks} className="space-y-8">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-900">Checks to run</legend>
          <div className="space-y-3">
            {CHECKS.map((c) => (
              <label key={c.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="enabled"
                  value={c.id}
                  defaultChecked={!off.has(c.id)}
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm">
                  <span className="text-gray-900">{c.name}</span>
                  <span className="block text-xs text-gray-500">{c.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="phrases" className="mb-1 block text-sm font-medium text-gray-900">
            Words every description should contain
          </label>
          <p className="mb-2 text-xs text-gray-500">
            One per line, up to {MAX_PHRASES}. For example: smoke-free, flaws noted, measurements.
            A listing is flagged when its description doesn&apos;t include one of them.
          </p>
          <textarea
            id="phrases"
            name="phrases"
            rows={5}
            defaultValue={settings.requiredPhrases.join("\n")}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Save
        </button>
      </form>
    </main>
  );
}
