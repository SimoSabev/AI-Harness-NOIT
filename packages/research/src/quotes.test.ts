import { describe, expect, it } from "vitest";
import { locateQuote } from "./quotes.js";

describe("locating a verbatim quote (v5 2.5: a quote is an exact substring of the pinned source)", () => {
  const src = "Intro.\n\nThe  “JSON Canonicalization Scheme” (JCS) — defined in RFC 8785 — sorts\nproperties.\n";
  it("exact text → its offset and length in the original", () => {
    const q = locateQuote("defined in RFC 8785", src);
    expect(q).not.toBeNull();
    expect(src.slice(q!.offset, q!.offset + q!.length)).toBe("defined in RFC 8785");
  });
  it("curly quotes, dashes, case and whitespace differ → still found; the stored text is the original span", () => {
    const q = locateQuote('the "json canonicalization scheme" (jcs) - defined', src);
    expect(q).not.toBeNull();
    expect(q!.text).toBe("The  “JSON Canonicalization Scheme” (JCS) — defined");
    expect(q!.text.length).toBe(q!.length);
  });
  it("a line break inside the quote matches a space", () => {
    expect(locateQuote("— sorts properties.", src)?.text).toBe("— sorts\nproperties.");
  });
  it("a provider's ellipsis at the ends is dropped", () => {
    expect(locateQuote("…defined in RFC 8785…", src)?.text).toBe("defined in RFC 8785");
  });
  it("not in the source, too short or empty → null", () => {
    expect(locateQuote("defined in RFC 9999", src)).toBeNull();
    expect(locateQuote("RFC", src)).toBeNull();
    expect(locateQuote("   ", src)).toBeNull();
  });
});
