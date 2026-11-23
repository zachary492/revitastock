// Reads clothing sizes out of free text (a title) and out of item-specific
// values, so the two can be compared. Deliberately strict: when a size isn't
// clearly one we know, it is ignored rather than guessed.

export interface Sizes {
  letters: Set<string>; // XS, S, M, L, XL, XXL ...
  jackets: Set<string>; // 44R, 46L ... (chest size + length)
}

const LETTER_ALIASES: [RegExp, string][] = [
  [/\bX{2}[- ]?LARGE\b|\b2X[- ]?LARGE\b|\b2XL\b/g, "XXL"],
  [/\bX{3}[- ]?LARGE\b|\b3X[- ]?LARGE\b|\b3XL\b/g, "XXXL"],
  [/\bEXTRA[- ]?LARGE\b|\bX[- ]?LARGE\b/g, "XL"],
  [/\bEXTRA[- ]?SMALL\b|\bX[- ]?SMALL\b/g, "XS"],
  [/\bLARGE\b/g, "L"],
  [/\bMEDIUM\b/g, "M"],
  [/\bSMALL\b/g, "S"],
];

const LETTER_TOKEN = /(?<![A-Za-z0-9])(XXXL|XXL|XL|XS|S|M|L)(?![A-Za-z0-9])/g;
const JACKET_TOKEN = /(?<![A-Za-z0-9])(\d{2})\s?(XL|R|L|S)(?![A-Za-z0-9])/g;

/** Chest sizes: 34-60. This keeps decades like "80S" from reading as a size. */
function plausibleChest(digits: string | undefined): boolean {
  const n = Number(digits);
  return n >= 34 && n <= 60;
}

const JACKET_WORDS: [RegExp, string][] = [
  [/(\d{2})\s*(?:X[- ]?LONG|EXTRA[- ]?LONG)\b/g, "$1XL"],
  [/(\d{2})\s*REGULAR\b/g, "$1R"],
  [/(\d{2})\s*LONG\b/g, "$1L"],
  [/(\d{2})\s*SHORT\b/g, "$1S"],
];

/** "Long sleeve" markers such as L/S and S/S are not sizes. */
function withoutSleeveMarkers(text: string): string {
  return text.replace(/(?<![A-Za-z0-9])[LS]\s?\/\s?S(?![A-Za-z0-9])/gi, " ");
}

function collect(text: string, caseInsensitiveSingles: boolean): Sizes {
  const letters = new Set<string>();
  const jackets = new Set<string>();

  let rest = text;
  for (const m of rest.matchAll(JACKET_TOKEN)) {
    if (plausibleChest(m[1])) jackets.add(`${m[1]}${(m[2] ?? "").toUpperCase()}`);
  }
  // Remove jacket sizes so "44L" is not also read as a letter size.
  rest = rest.replace(JACKET_TOKEN, " ");

  const source = caseInsensitiveSingles ? rest.toUpperCase() : rest;
  for (const m of source.matchAll(LETTER_TOKEN)) {
    const token = m[1] ?? "";
    // In a title, single letters count only when written as capitals.
    letters.add(token);
  }
  return { letters, jackets };
}

/** Sizes written in a listing title. Capital letters only for S, M, L. */
export function sizesInTitle(title: string): Sizes {
  const base = withoutSleeveMarkers(title);
  const found = collect(base, false);

  // Spelled-out sizes ("X-Large", "44 Regular") in any capitalization.
  let spelled = base.toUpperCase();
  for (const [re, replacement] of JACKET_WORDS) {
    for (const m of spelled.matchAll(re)) {
      const size = (m[0] ?? "").replace(re, replacement);
      if (plausibleChest(m[1])) found.jackets.add(size);
    }
    spelled = spelled.replace(re, " ");
  }
  for (const [re, size] of LETTER_ALIASES) {
    if (spelled.match(re)) {
      found.letters.add(size);
      spelled = spelled.replace(re, " ");
    }
  }
  return found;
}

/** Sizes written in item-specific values such as "Large" or "44 Regular". */
export function sizesInValues(values: string[]): Sizes {
  const letters = new Set<string>();
  const jackets = new Set<string>();
  for (const raw of values) {
    let text = withoutSleeveMarkers(raw).toUpperCase();
    for (const [re, replacement] of JACKET_WORDS) text = text.replace(re, replacement);
    for (const [re, size] of LETTER_ALIASES) text = text.replace(re, size);
    const found = collect(text, true);
    found.letters.forEach((s) => letters.add(s));
    found.jackets.forEach((s) => jackets.add(s));
  }
  return { letters, jackets };
}

export interface SizeConflict {
  titleSize: string;
  specificsSize: string;
}

function overlap(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/**
 * Compares the sizes in the title with the sizes in the item specifics.
 * Returns a conflict only when BOTH sides name a size of the same kind and
 * share none of them. Jacket sizes (46R vs 46L) are checked first.
 */
export function findSizeConflict(
  title: string,
  specificValues: string[]
): SizeConflict | null {
  if (specificValues.length === 0) return null;
  const inTitle = sizesInTitle(title);
  const inSpecifics = sizesInValues(specificValues);

  if (
    inTitle.jackets.size > 0 &&
    inSpecifics.jackets.size > 0 &&
    !overlap(inTitle.jackets, inSpecifics.jackets)
  ) {
    return {
      titleSize: [...inTitle.jackets].join("/"),
      specificsSize: [...inSpecifics.jackets].join("/"),
    };
  }
  if (
    inTitle.jackets.size === 0 &&
    inTitle.letters.size > 0 &&
    inSpecifics.letters.size > 0 &&
    !overlap(inTitle.letters, inSpecifics.letters)
  ) {
    return {
      titleSize: [...inTitle.letters].join("/"),
      specificsSize: [...inSpecifics.letters].join("/"),
    };
  }
  return null;
}
