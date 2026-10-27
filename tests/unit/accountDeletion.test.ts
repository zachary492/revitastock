import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { computeChallengeResponse } from "../../src/lib/ebay/accountDeletion";

describe("computeChallengeResponse", () => {
  it("hashes challenge code, then token, then endpoint", () => {
    const expected = createHash("sha256")
      .update("abc" + "my_token_my_token_my_token_my_token" + "https://x.test/api")
      .digest("hex");
    expect(
      computeChallengeResponse("abc", "my_token_my_token_my_token_my_token", "https://x.test/api")
    ).toBe(expected);
  });

  it("changes if the order changes", () => {
    const a = computeChallengeResponse("a", "b", "c");
    const b = computeChallengeResponse("b", "a", "c");
    expect(a).not.toBe(b);
  });
});