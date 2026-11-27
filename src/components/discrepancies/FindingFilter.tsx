"use client";

import { useRouter } from "next/navigation";

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export default function FindingFilter({
  options,
  current,
}: {
  options: FilterOption[];
  current: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span>Show</span>
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v === "all" ? "/discrepancies" : `/discrepancies?type=${v}`);
        }}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );
}
