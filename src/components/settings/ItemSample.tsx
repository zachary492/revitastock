"use client";

import { useState, useTransition } from "react";
import {
  inspectListing,
  type InspectResult,
} from "@/app/(dashboard)/settings/item-sample/actions";

export interface SampleCandidate {
  itemId: string;
  label: string;
  title: string;
}

export default function ItemSample({ candidates }: { candidates: SampleCandidate[] }) {
  const [itemId, setItemId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<InspectResult | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <select
        value={itemId}
        onChange={(e) => {
          setItemId(e.target.value);
          setResult(null);
        }}
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">Choose a listing…</option>
        {candidates.map((c) => (
          <option key={c.itemId} value={c.itemId}>
            {c.label || "(no label)"} — {c.title.slice(0, 70)}
          </option>
        ))}
      </select>
      <button
        disabled={isPending || !itemId}
        onClick={() =>
          startTransition(async () => {
            setCopied(false);
            setResult(await inspectListing(itemId));
          })
        }
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Reading…" : "Look at this listing"}
      </button>

      {result && !result.ok && (
        <pre className="mt-4 whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
        </pre>
      )}

      {result && result.ok && (
        <div className="mt-4">
          <div className="mb-3 rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
            <p>Photos found: {result.summary.photos}</p>
            <p>Description length: {result.summary.descriptionCharacters} characters</p>
            <p>Item specifics found: {result.summary.specifics.length}</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {result.summary.specifics.map((s, i) => (
                <li key={i}>
                  {s.name}: {s.values.length > 0 ? s.values.join(", ") : "(blank)"}
                </li>
              ))}
            </ul>
          </div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              What eBay sent (text hidden, safe to share):
            </span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(result.outline);
                setCopied(true);
              }}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
            {result.outline}
          </pre>
        </div>
      )}
    </div>
  );
}
