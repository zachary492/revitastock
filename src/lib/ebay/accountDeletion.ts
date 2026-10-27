import { createHash } from "crypto";

/**
 * eBay proves an endpoint is ours by sending a challenge_code. We reply with
 * SHA-256 of (challengeCode + verificationToken + endpoint), in THAT order,
 * as a hex string. Wrong order = verification fails.
 */
export function computeChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpoint: string
): string {
  return createHash("sha256")
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest("hex");
}