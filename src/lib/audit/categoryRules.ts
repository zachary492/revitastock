/**
 * Rules that only make sense for some kinds of listing. Each rule set is
 * picked by the listing's eBay category path, for example
 * "Clothing, Shoes & Accessories:Men's Clothing:Suits & Suit Separates".
 */

/** Jackets, blazers, sport coats, suits and coats. */
export function isTailoredCategory(categoryPath: string | null | undefined): boolean {
  if (!categoryPath) return false;
  return /\b(suits?|blazers?|sport ?coats?|jackets?|coats?|tuxedos?|outerwear)\b/i.test(categoryPath);
}

/** The last part of a category path ("Blazers & Sport Coats"). */
export function leafCategory(categoryPath: string | null | undefined): string | null {
  if (!categoryPath) return null;
  const parts = categoryPath.split(":").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

const MEASUREMENT_TERMS: [string, string][] = [
  ["chest", "(?:chest|pit[\\s-]*to[\\s-]*pit|p2p)"],
  ["shoulders", "shoulders?"],
  ["sleeve", "sleeves?"],
  ["length", "length"],
  ["waist", "waist"],
  ["inseam", "inseam"],
];

/** Which kinds of measurement appear with a number next to them. */
export function measurementsMentioned(description: string): Set<string> {
  const found = new Set<string>();
  const text = description.toLowerCase();
  for (const [name, term] of MEASUREMENT_TERMS) {
    const after = new RegExp(`${term}[^0-9a-z]{0,15}\\d{1,2}(?:\\.\\d{1,2})?`);
    const before = new RegExp(`\\d{1,2}(?:\\.\\d{1,2})?\\s*(?:"|”|in(?:ches)?\\b|cm\\b)?\\s*${term}`);
    if (after.test(text) || before.test(text)) found.add(name);
  }
  return found;
}

/** Tailored items should show at least two of these. */
export const MIN_MEASUREMENTS = 2;

export function hasEnoughMeasurements(description: string): boolean {
  const found = measurementsMentioned(description);
  let n = 0;
  for (const k of ["chest", "shoulders", "sleeve", "length"]) if (found.has(k)) n++;
  return n >= MIN_MEASUREMENTS;
}

/** Phrases (case-insensitive) that don't appear in the description. */
export function missingPhrases(description: string, phrases: string[]): string[] {
  const text = description.toLowerCase().replace(/\s+/g, " ");
  return phrases.filter((p) => !text.includes(p.toLowerCase().replace(/\s+/g, " ")));
}
