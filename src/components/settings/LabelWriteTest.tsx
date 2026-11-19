"use client";

import { useState, useTransition } from "react";
import {
  runLabelWriteTest,
  type LabelWriteActionResult,
} from "@/app/(dashboard)/settings/label-test/actions";

export interface Candidate {
  itemId: string;
  label: string;
  title: string;
  price: number | null;
}

const PERMISSION_HINT = /permission|scope|authori[sz]|not allowed|access/i;

export default function LabelWriteTest({ candidates }: { candidates: Candidate[] }) {
  const [itemId, setItemId] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<LabelWriteActionResult | null>(null);

  function handleRun() {
    startTransition(async () => {
      setOutcome(await runLabelWriteTest(itemId));
    });
  }

  const result = outcome && outcome.ok ? outcome.result : null;
  const permissionProblem =
    result?.outcome === "rejected" &&
    result.messages.some((m) => PERMISSION_HINT.test(m.message));

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Pick one live listing
      </label>
      <select
        value={itemId}
        onChange={(e) => {
          setItemId(e.target.value);
          setOutcome(null);
        }}
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">Choose a listing…</option>
        {candidates.map((c) => (
          <option key={c.itemId} value={c.itemId}>
            {c.label} — {c.title.slice(0, 70)}
            {c.price !== null ? ` ($${c.price.toFixed(2)})` : ""}
          </option>
        ))}
      </select>

      <label className="mb-4 flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1"
        />
        <span>
          I understand this sends one edit request for this listing to eBay. It
          re-saves the label it already has, so nothing should change.
        </span>
      </label>

      <button
        onClick={handleRun}
        disabled={isPending || !itemId || !agreed}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Testing…" : "Run the write test"}
      </button>

      {outcome && !outcome.ok && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {outcome.error}
        </p>
      )}

      {result?.outcome === "unchanged" && (
        <div className="mt-4 rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
          <p className="font-medium">Success. eBay accepted the edit.</p>
          <p className="mt-1">
            The label still reads <span className="font-mono">{result.labelAfter}</span> and
            the item number is unchanged ({result.itemId}). That means RevitaSync&apos;s
            current eBay permission can edit listing labels.
          </p>
        </div>
      )}

      {result?.outcome === "label_differs" && (
        <div className="mt-4 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <p className="font-medium">eBay accepted the edit, but the label reads differently.</p>
          <p className="mt-1">
            Sent <span className="font-mono">{result.label}</span>, read back{" "}
            <span className="font-mono">{result.labelAfter ?? "(empty)"}</span>. Check this
            listing on eBay and tell Claude.
          </p>
        </div>
      )}

      {result?.outcome === "rejected" && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-3 text-sm text-red-800">
          <p className="font-medium">eBay refused the edit. Nothing was changed.</p>
          <ul className="mt-1 list-disc pl-5">
            {result.messages.map((m, i) => (
              <li key={i}>
                {m.code ? `${m.code}: ` : ""}
                {m.message}
              </li>
            ))}
          </ul>
          {permissionProblem && (
            <p className="mt-2">
              This looks like a permission problem. The fix is to ask eBay for one
              extra permission and Reconnect once. Send this message to Claude.
            </p>
          )}
        </div>
      )}

      {result?.outcome === "error" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.detail ?? "Couldn't reach eBay."}
        </p>
      )}

      {result && result.messages.length > 0 && result.outcome === "unchanged" && (
        <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
          {result.messages.map((m, i) => (
            <li key={i}>
              eBay note: {m.code ? `${m.code}: ` : ""}
              {m.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
