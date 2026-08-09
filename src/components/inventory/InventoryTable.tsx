"use client";

import { useState, useMemo } from "react";

export interface InventoryRow {
  id: string;
  sku: string;
  quantity: number;
  title: string | null;
  location: string | null;
  uploaded_at: string;
}

export default function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        row.sku.toLowerCase().includes(q) ||
        row.title?.toLowerCase().includes(q) ||
        row.location?.toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
        No inventory uploaded yet. Upload a CSV above to see it here.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <input
          type="text"
          placeholder="Search by SKU, title, or location..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
        />
        <span className="text-xs text-gray-500">
          {filteredRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Quantity</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2 font-medium">{row.sku}</td>
                <td className="px-4 py-2">{row.quantity}</td>
                <td className="px-4 py-2 text-gray-600">{row.title ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600">{row.location ?? "—"}</td>
                <td className="px-4 py-2 text-gray-400">
                  {new Date(row.uploaded_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
