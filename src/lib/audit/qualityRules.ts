import type { ListingRecord } from "../ebay/sellingLists";
import type { ItemDetails } from "../ebay/itemDetails";
import { findSizeConflict, joinChestAndLength } from "../listings/sizes";
import { normalizeLabel } from "../listings/organize";
import {
  hasEnoughMeasurements,
  isTailoredCategory,
  leafCategory,
  missingPhrases,
} from "./categoryRules";

/** Starting thresholds. Plain numbers so they are easy to change. */
export const MIN_PHOTOS = 3;
export const MIN_SPECIFICS = 3;
export const MIN_DESCRIPTION_CHARS = 40;

/** One live listing with one or more things that look worth fixing. */
export interface QualityIssue {
  rule: "listing_quality";
  label: string | null;
  listing: ListingRecord;
  /** Plain-language sentences, each ending with a period. */
  problems: string[];
  /** The listing's eBay category (last part), when known. */
  category?: string | null;
}

export interface QualityOptions {
  /** Check ids the seller switched off (see checkSettings.ts). */
  disabledChecks?: readonly string[];
  /** Words or phrases every description should contain. */
  requiredPhrases?: readonly string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Everything we can say is wrong with a listing's content. Empty = nothing. */
export function qualityProblems(details: ItemDetails, options: QualityOptions = {}): string[] {
  const problems: string[] = [];
  const off = new Set(options.disabledChecks ?? []);

  // Size in the title vs the Size item specifics
  const sizeValues = joinChestAndLength(
    details.specifics
      .filter((s) => /size/i.test(s.name) && !/type/i.test(s.name))
      .flatMap((s) => s.values),
    // Length lives in its own field ("Jacket/Coat Length"). "Size Type" is the
    // fit (Regular, Slim, Classic) and says nothing about length.
    details.specifics.filter((s) => /length/i.test(s.name) && !/sleeve|inseam/i.test(s.name)).flatMap((s) => s.values)
  );
  const conflict = off.has("size_conflict") ? null : findSizeConflict(details.title, sizeValues);
  if (conflict) {
    problems.push(
      `The title says ${conflict.titleSize}, but the Size in the item specifics says ${conflict.specificsSize}.`
    );
  }

  // Item specifics
  const filled = details.specifics.filter((s) => s.values.length > 0);
  const blank = details.specifics.filter((s) => s.values.length === 0);
  if (off.has("item_specifics")) {
    // switched off by the seller
  } else if (details.specifics.length === 0) {
    problems.push("No item specifics are filled in.");
  } else if (filled.length < MIN_SPECIFICS) {
    problems.push(`Only ${plural(filled.length, "item specific")} ${filled.length === 1 ? "is" : "are"} filled in.`);
  }
  if (!off.has("item_specifics") && blank.length > 0) {
    const names = blank.slice(0, 5).map((s) => s.name).join(", ");
    problems.push(`These item specifics are blank: ${names}${blank.length > 5 ? " and more" : ""}.`);
  }

  // Description
  if (!off.has("description")) {
    if (details.descriptionLength === 0) {
      problems.push("The description is empty.");
    } else if (details.descriptionLength < MIN_DESCRIPTION_CHARS) {
      problems.push("The description is very short.");
    }
  }

  // Description contents. Only when we have the text (older saved copies
  // don't, until they are read again) and the description isn't empty.
  const text = details.descriptionText;
  if (text != null && details.descriptionLength > 0) {
    if (
      !off.has("measurements") &&
      isTailoredCategory(details.categoryName) &&
      !hasEnoughMeasurements(text)
    ) {
      problems.push(
        "The description doesn't seem to include measurements (like pit to pit, shoulders, sleeve or length)."
      );
    }
    const missing = missingPhrases(text, [...(options.requiredPhrases ?? [])]);
    if (missing.length > 0) {
      problems.push(`The description doesn't mention: ${missing.join(", ")}.`);
    }
  }

  // Photos
  if (off.has("photos")) {
    // switched off by the seller
  } else if (details.pictureCount === 0) {
    problems.push("The listing has no photos.");
  } else if (details.pictureCount < MIN_PHOTOS) {
    problems.push(
      `It has only ${plural(details.pictureCount, "photo")} (RevitaSync suggests at least ${MIN_PHOTOS}).`
    );
  }

  return problems;
}

/** Checks every live listing we have details for. Others are skipped. */
export function findQualityIssues(
  active: ListingRecord[],
  details: ReadonlyMap<string, ItemDetails>,
  options: QualityOptions = {}
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const listing of active) {
    if (listing.status !== "active") continue;
    const d = details.get(listing.itemId);
    if (!d) continue;
    const problems = qualityProblems(d, options);
    if (problems.length > 0) {
      issues.push({
        rule: "listing_quality",
        label: normalizeLabel(listing.sku),
        listing,
        problems,
        category: leafCategory(d.categoryName),
      });
    }
  }
  return issues.sort((a, b) => {
    if (b.problems.length !== a.problems.length) return b.problems.length - a.problems.length;
    if (a.label && !b.label) return -1; // labeled listings before unlabeled ones
    if (!a.label && b.label) return 1;
    return (a.label ?? "").localeCompare(b.label ?? "", "en", { numeric: true });
  });
}
