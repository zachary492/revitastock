"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAudit, type RunAuditResult } from "@/app/(dashboard)/discrepancies/actions";

export default function RunAuditButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RunAuditResult | null>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await runAudit();
      setResult(res);
      // Refresh so the saved list below updates.
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
        {isPending ? "Running audit…" : "Run audit"}
      </button>

      {result && !result.success && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error}
        </p>
      )}

      {result && result.success && (
        <div className="mt-4 rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
          <p className="mb-1 font-medium">Audit complete (using sample eBay data)</p>
          <ul className="space-y-0.5">
            <li>Ghost listings: {result.ghostListings}</li>
            <li>Phantom drops: {result.phantomDrops}</li>
            <li>Quantity mismatches: {result.quantityMismatches}</li>
            <li>In sync: {result.inSync}</li>
            <li>On your shelf but not listed: {result.unlistedInventory}</li>
            <li>Listed but not in your CSV: {result.unknownListings}</li>
          </ul>
        </div>
      )}
    </div>
  );
}