import { describe, expect, it } from "vitest";
import { citationInSource, goldenHit, normalizeForCitation, substringShare } from "./citations.js";

// E8к (v5 т. 4.10 (3)): a citation counts only when its quote is a substring of the source after normalization.
describe("citations (E8к)", () => {
  it("нормализация: NFKC, малки букви, интервали, кавички и тирета, невидими знаци", () => {
    expect(normalizeForCitation("  The “Quick”\u00a0brown\u200b fox — jumps\n\tover ")).toBe('the "quick" brown fox - jumps over');
    expect(normalizeForCitation("ﬁle")).toBe("file");
  });
  it("подниз след нормализация; многоточие в края/началото се маха; празен цитат не се брои", () => {
    const doc = "<p>The discount is 10% when the subtotal is over 50 EUR.</p>";
    expect(citationInSource("the discount is 10%  when the subtotal", doc)).toBe(true);
    expect(citationInSource("…when the subtotal is over 50 EUR…", doc)).toBe(true);
    expect(citationInSource("when the subtotal is over 60 EUR", doc)).toBe(false);
    expect(citationInSource("   ", doc)).toBe(false);
  });
  it("дял на точните цитати", () => {
    expect(substringShare([])).toBeNull();
    expect(substringShare([{ quote: "a b", source: "x a  b y" }, { quote: "zz", source: "x" }])).toBe(0.5);
  });
  it("златен отговор: съдържа някой от приетите след нормализация", () => {
    expect(goldenHit("It is RFC 8785 (JCS).", ["8785"])).toBe(true);
    expect(goldenHit("Use --cap-drop  all", ["--cap-drop=ALL", "--cap-drop ALL"])).toBe(true);
    expect(goldenHit("port 5433", ["5432"])).toBe(false);
  });
});
