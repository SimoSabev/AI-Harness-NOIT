import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newTotpSecret, otpauthUri, totpAt, verifyTotp } from "./totp";

// RFC 6238 Appendix B (SHA-1, secret "12345678901234567890"), last 6 of the 8 digits.
const secret = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238, D-285)", () => {
  it("тестовите вектори", () => {
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1_111_111_109_000)).toBe("081804");
    expect(totpAt(secret, 1_234_567_890_000)).toBe("005924");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("прозорец ±1 стъпка; стар код → отказ; грешен формат → отказ", () => {
    const now = 1_234_567_890_000;
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 180_000), now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });
  it("нов секрет: 32 знака base32; otpauth URI без секрет в label", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri(s, "approver@demo")).toBe(`otpauth://totp/Mandat:approver%40demo?secret=${s}&issuer=Mandat&algorithm=SHA1&digits=6&period=30`);
  });
});
