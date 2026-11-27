"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/signup";

export default function SignInForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ text: string; unconfirmed: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      const f = friendlyAuthError(error.message);
      setError({ text: f.text, unconfirmed: f.kind === "unconfirmed" });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mb-6 text-sm text-gray-600">Welcome back to RevitaSync.</p>

      {notice && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />

        {error && (
          <p className="text-sm text-red-600">
            {error.text}{" "}
            {error.unconfirmed && (
              <Link
                href={`/auth/check-email?email=${encodeURIComponent(email.trim())}`}
                className="underline underline-offset-2"
              >
                Send it again
              </Link>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Please wait..." : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-600">
        New to RevitaSync?{" "}
        <Link href="/auth/signup" className="text-gray-900 underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </main>
  );
}
