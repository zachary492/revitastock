import Papa from "papaparse";
import type { PhysicalInventoryRecord } from "@/types/inventory";

export interface CsvRowError {
  row: number; // 1-indexed, matches what a human sees in a spreadsheet
  message: string;
}

export interface ParseInventoryCsvResult {
  validRows: PhysicalInventoryRecord[];
  errors: CsvRowError[];
}

/**
 * Parses a raw CSV file into validated PhysicalInventoryRecord rows.
 *
 * Expected columns (case-insensitive, order doesn't matter):
 *   sku (required), quantity (required, must be a whole number),
 *   title (optional), location (optional)
 *
 * Never throws — invalid rows are collected as errors rather than
 * aborting the whole upload, so one bad row doesn't block the rest.
 */
export function parseInventoryCsv(
  fileText: string
): ParseInventoryCsvResult {
  const validRows: PhysicalInventoryRecord[] = [];
  const errors: CsvRowError[] = [];

  const parsed = Papa.parse<Record<string, string>>(fileText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  parsed.data.forEach((rawRow, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
    const sku = rawRow.sku?.trim();
    const quantityRaw = rawRow.quantity?.trim();

    if (!sku) {
      errors.push({ row: rowNumber, message: "Missing SKU" });
      return;
    }

    if (!quantityRaw) {
      errors.push({ row: rowNumber, message: `"${sku}": missing quantity` });
      return;
    }

    const quantity = Number(quantityRaw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      errors.push({
        row: rowNumber,
        message: `"${sku}": quantity "${quantityRaw}" isn't a valid whole number`,
      });
      return;
    }

    validRows.push({
      sku,
      quantity,
      title: rawRow.title?.trim() || undefined,
      location: rawRow.location?.trim() || undefined,
    });
  });

  return { validRows, errors };
}
