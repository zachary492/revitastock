export const CATEGORY_OPTIONS = [
  "Men's clothing (suits, coats, ties)",
  "Women's clothing",
  "Shoes",
  "Handbags and accessories",
  "Jewelry and watches",
  "Collectibles",
  "Electronics",
  "Books, movies and music",
  "Home and garden",
  "Toys and games",
  "Sporting goods",
  "Auto parts",
  "Other",
] as const;

export const TOOL_OPTIONS = [
  "eBay Seller Hub",
  "Flyp",
  "Vendoo",
  "List Perfectly",
  "Nifty",
  "A spreadsheet",
  "Other",
  "None",
] as const;

export const MIN_PASSWORD_LENGTH = 8;

export interface SignupInput {
  fullName: string;
  email: string;
  storeName: string;
  categories: string[];
  tools: string[];
  password: string;
  confirmPassword: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a plain-language problem, or null when the form is fine. */
export function validateSignup(input: SignupInput): string | null {
  if (!input.fullName.trim()) return "Please enter your name.";
  if (!EMAIL.test(input.email.trim())) return "Please enter a valid email address.";
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (input.password !== input.confirmPassword) return "The two passwords don't match.";
  return null;
}

/** The details saved with the account (trimmed, only known choices). */
export function signupMetadata(input: SignupInput): {
  full_name: string;
  store_name: string;
  categories: string[];
  tools: string[];
} {
  const known = <T extends readonly string[]>(values: string[], options: T) =>
    values.filter((v) => (options as readonly string[]).includes(v));
  return {
    full_name: input.fullName.trim().slice(0, 120),
    store_name: input.storeName.trim().slice(0, 120),
    categories: known(input.categories, CATEGORY_OPTIONS),
    tools: known(input.tools, TOOL_OPTIONS),
  };
}

export type AuthProblem = "unconfirmed" | "other";

/** Turns Supabase's wording into something a seller understands. */
export function friendlyAuthError(message: string): { text: string; kind: AuthProblem } {
  const m = message.toLowerCase();
  if (m.includes("not confirmed")) {
    return { text: "Please confirm your email first. We sent you a link when you signed up.", kind: "unconfirmed" };
  }
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return { text: "That email and password don't match.", kind: "other" };
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) {
    return { text: "Too many tries. Please wait a minute and try again.", kind: "other" };
  }
  if (m.includes("not authorized")) {
    return { text: "We couldn't send the confirmation email right now. Please try again later.", kind: "other" };
  }
  if (m.includes("password") && m.includes("least")) {
    return { text: "Please choose a longer password.", kind: "other" };
  }
  return { text: "Something went wrong. Please try again.", kind: "other" };
}
