import { describe, it, expect } from "vitest";
import { friendlyAuthError, signupMetadata, validateSignup, type SignupInput } from "../../src/lib/auth/signup";

const ok: SignupInput = {
  fullName: "Zach", email: "z@example.com", storeName: "", categories: [], tools: [],
  password: "longenough1", confirmPassword: "longenough1",
};

describe("validateSignup", () => {
  it("accepts a complete form", () => expect(validateSignup(ok)).toBeNull());
  it("explains each problem plainly", () => {
    expect(validateSignup({ ...ok, fullName: "  " })).toMatch(/name/);
    expect(validateSignup({ ...ok, email: "nope" })).toMatch(/email/);
    expect(validateSignup({ ...ok, password: "short", confirmPassword: "short" })).toMatch(/at least 8/);
    expect(validateSignup({ ...ok, confirmPassword: "different11" })).toMatch(/don't match/);
  });
});

describe("signupMetadata", () => {
  it("trims, caps lengths and keeps only known choices", () => {
    const m = signupMetadata({
      ...ok, fullName: "  Zach  ", storeName: "  Fancy Ties  ".padEnd(300, "x"),
      categories: ["Shoes", "Made up", "Other"], tools: ["Flyp", "Evil"],
    });
    expect(m.full_name).toBe("Zach");
    expect(m.store_name.length).toBe(120);
    expect(m.categories).toEqual(["Shoes", "Other"]);
    expect(m.tools).toEqual(["Flyp"]);
  });
});

describe("friendlyAuthError", () => {
  it("recognizes the common cases", () => {
    expect(friendlyAuthError("Email not confirmed").kind).toBe("unconfirmed");
    expect(friendlyAuthError("Invalid login credentials").text).toMatch(/don't match/);
    expect(friendlyAuthError("email rate limit exceeded").text).toMatch(/wait a minute/);
    expect(friendlyAuthError("Email address not authorized").text).toMatch(/couldn't send/);
    expect(friendlyAuthError("???").kind).toBe("other");
  });
});
