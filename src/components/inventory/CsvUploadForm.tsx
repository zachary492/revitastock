"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  parseInventoryCsv,
  type CsvRowError,
} from "@/lib/csv/parseInventory";
import type { PhysicalInventoryRecord } from "@/types/inventory";
import { saveInventoryRows } from "@/app/(dashboard)/inventory/actions";

export default function CsvUploadForm() {
  const router = useRouter();
  const [rows, setRows] = useState<PhysicalInventoryRecord[]>([]);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setSaveState("idle");
    setSaveError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = parseInventoryCsv(text);
      setRows(result.validRows);
      setErrors(result.errors);
    };
    reader.readAsText(file);
  }, []);

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    const result = await saveInventoryRows(rows);
    if (result.success) {
      setSaveState("saved");
      router.refresh();
    } else {
      setSaveState("error");
      setSaveError(result.error ?? "Something went wrong saving your inventory.");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragging
            ? "border-gray-900 bg-gray-50"
            : "border-gray-300"
        }`}
      >
        <p className="text-sm text-gray-600">
          Drag and drop your inventory CSV here, or
        </p>
        <label className="cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Choose file
          <input
            type="file"
            accept=".csv"
            onChange={onInputChange}
            className="hidden"
          />
        </label>
        <p className="mt-1 text-xs text-gray-400">
          Expected columns: sku, quantity, title (optional), location (optional)
        </p>
      </div>

      {fileName && (
        <p className="mt-4 text-sm text-gray-600">
          Parsed <span className="font-medium">{fileName}</span> —{" "}
          <span className="font-medium text-green-700">
            {rows.length} valid row{rows.length === 1 ? "" : "s"}
          </span>
          {errors.length > 0 && (
            <>
              {" "}
              ·{" "}
              <span className="font-medium text-red-600">
                {errors.length} error{errors.length === 1 ? "" : "s"}
              </span>
            </>
          )}
        </p>
      )}

      {errors.length > 0 && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-700">
            Rows skipped
          </p>
          <ul className="space-y-0.5 text-sm text-red-700">
            {errors.map((err, i) => (
              <li key={i}>
                Row {err.row}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveState === "saving" || saveState === "saved"}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                  ? "Saved ✓"
                  : `Save ${rows.length} row${rows.length === 1 ? "" : "s"} to inventory`}
            </button>
            {saveState === "saved" && (
              <span className="text-sm text-green-700">
                Your inventory has been saved.
              </span>
            )}
            {saveState === "error" && (
              <span className="text-sm text-red-600">{saveError}</span>
            )}
          </div>

          <div className="overflow-hidden rounded-md border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Quantity</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{row.sku}</td>
                    <td className="px-4 py-2">{row.quantity}</td>
                    <td className="px-4 py-2 text-gray-600">{row.title ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{row.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
