/** The checks a seller can switch off. Keep the ids stable: they are saved. */
export const CHECKS = [
  { id: "size_conflict", name: "Size in title matches item specifics", note: "Like 46R in the title but 44 in Size" },
  { id: "item_specifics", name: "Item specifics filled in", note: "Missing, blank or very few" },
  { id: "description", name: "Description present", note: "Empty or very short" },
  { id: "photos", name: "Enough photos", note: "Fewer than 3" },
  { id: "measurements", name: "Measurements in description", note: "Jackets, suits and coats only" },
] as const;

export type CheckId = (typeof CHECKS)[number]["id"];

export interface SellerSettings {
  disabledChecks: string[];
  requiredPhrases: string[];
}

export const DEFAULT_SETTINGS: SellerSettings = { disabledChecks: [], requiredPhrases: [] };

export const MAX_PHRASES = 20;
export const MAX_PHRASE_LENGTH = 60;

const KNOWN = new Set<string>(CHECKS.map((c) => c.id));

/** Turns what a seller typed (one per line, or commas) into a clean list. */
export function normalizePhrases(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of input.split(/[\n,]+/)) {
    const phrase = piece.replace(/\s+/g, " ").trim().slice(0, MAX_PHRASE_LENGTH);
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= MAX_PHRASES) break;
  }
  return out;
}

/** Keeps only check ids we know (old or tampered values are dropped). */
export function cleanDisabled(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && KNOWN.has(x)))];
}

export function readSettingsRow(row: unknown): SellerSettings {
  if (!row || typeof row !== "object") return DEFAULT_SETTINGS;
  const r = row as { disabled_checks?: unknown; required_phrases?: unknown };
  const phrases = Array.isArray(r.required_phrases)
    ? normalizePhrases(r.required_phrases.filter((p): p is string => typeof p === "string").join("\n"))
    : [];
  return { disabledChecks: cleanDisabled(r.disabled_checks), requiredPhrases: phrases };
}
