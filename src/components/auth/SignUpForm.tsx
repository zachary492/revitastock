"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_OPTIONS,
  MIN_PASSWORD_LENGTH,
  TOOL_OPTIONS,
  friendlyAuthError,
  signupMetadata,
  validateSignup,
} from "@/lib/auth/signup";

const input =
  "rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function SignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = { fullName, email, storeName, categories, tools, password, confirmPassword };
    const problem = validateSignup(form);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: signupMetadata(form),
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(friendlyAuthError(error.message).text);
      return;
    }
    if (data.session) {
      // Email confirmation is switched off in this project: already signed in.
      router.push("/dashboard");
      router.refresh();
      return;
    }
    router.push(`/auth/check-email?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-gray-600">
        Free during the beta. It takes about a minute.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-700">Your name</span>
          <input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-700">Email</span>
          <input type="email" required autoComplete="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-700">
            Store name <span className="text-gray-400">(optional)</span>
          </span>
          <input autoComplete="organization" value={storeName} onChange={(e) => setStoreName(e.target.value)} className={input} />
        </label>

        <fieldset>
          <legend className="mb-1 text-sm text-gray-700">What do you sell? <span className="text-gray-400">(pick any)</span></legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CATEGORY_OPTIONS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={categories.includes(c)} onChange={() => setCategories(toggle(categories, c))} className="h-4 w-4" />
                {c}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm text-gray-700">Tools you use now <span className="text-gray-400">(optional)</span></legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {TOOL_OPTIONS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={tools.includes(t)} onChange={() => setTools(toggle(tools, t))} className="h-4 w-4" />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-700">Password</span>
          <input type="password" required autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-700">Type the password again</span>
          <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={input} />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Please wait..." : "Create account"}
        </button>

        <p className="text-xs text-gray-500">
          By creating an account you agree to how we handle your data in the{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
        </p>
      </form>

      <p className="mt-6 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/auth" className="text-gray-900 underline underline-offset-2">Log in</Link>
      </p>
    </main>
  );
}
