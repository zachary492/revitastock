import { describe, it, expect } from "vitest";
import { redact } from "../../src/lib/ebay/tradingSample";

describe("redact", () => {
  it("hides buyer, address, email and user ids", () => {
    const xml = `<A><Buyer><Email>a@b.c</Email><UserID>bob</UserID></Buyer>
      <ShippingAddress><Name>Bob</Name><Street1>1 Main</Street1></ShippingAddress>
      <Seller><UserID>me</UserID></Seller><Title>Keep me</Title></A>`;
    const out = redact(xml);
    expect(out).not.toContain("a@b.c");
    expect(out).not.toContain("bob");
    expect(out).not.toContain("1 Main");
    expect(out).not.toContain(">me<");
    expect(out).toContain("<Title>Keep me</Title>");
  });
});