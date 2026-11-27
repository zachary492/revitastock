"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/signup";

export default function ResendButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function resend() {
    setState("sending");
    const { error } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage(friendlyAuthError(error.message).text);
      setState("error");
      return;
    }
    setMessage("Sent. It can take a minute or two to arrive.");
    setState("sent");
  }

  return (
    <div>
      <button
        onClick={resend}
        disabled={state === "sending" || !email}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send the email again"}
      </button>
      {message && (
        <p className={`mt-2 text-sm ${state === "error" ? "text-red-600" : "text-green-700"}`}>{message}</p>
      )}
    </div>
  );
}
