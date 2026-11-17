"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  runListingAudit,
  type ListingAuditResult,
} from "@/app/(dashboard)/discrepancies/listingAudit";

export default function RunListingAuditButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ListingAuditResult | null>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await runListingAudit();
      setResult(res);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Checking your eBay listings…" : "Run audit on my eBay listings"}
      </button>

      {result && !result.success && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
        </p>
      )}

      {result && result.success && (
        <div className="mt-4 rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
          <p className="mb-1 font-medium">
            Audit complete: checked {result.listingsChecked} listings
          </p>
          <ul className="space-y-0.5">
            <li>Sold, but a listing is still live: {result.soldButStillActive}</li>
            <li>Ended without selling, not relisted: {result.endedNeverRelisted}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
