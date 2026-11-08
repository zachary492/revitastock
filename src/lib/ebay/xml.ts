// Tiny helpers for reading eBay's XML responses. Enough for the Trading API
// shapes we use; if the XML gets more complicated, switch to a real parser.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

// Matches <tag> or <tag attr="x"> (eBay puts currencyID="USD" on prices), but
// not <tagArray> or <tagSomethingElse>.
function openTag(tag: string, global: boolean): RegExp {
  return new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    global ? "g" : undefined
  );
}

/** Inner text of the FIRST <tag>…</tag>, or null. */
export function section(xml: string, tag: string): string | null {
  const match = xml.match(openTag(tag, false));
  return match?.[1] ?? null;
}

/** Inner text of EVERY <tag>…</tag>, in order. */
export function sections(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(openTag(tag, true)), (m) => m[1] ?? "");
}

/** Decoded text of the first <tag>, or null if it is missing or empty. */
export function text(xml: string, tag: string): string | null {
  const value = section(xml, tag);
  return value === null || value === "" ? null : decodeEntities(value);
}