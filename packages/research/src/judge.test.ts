import { describe, expect, it } from "vitest";
import { claimAsOf, claimVerdict, lintSynthesis, siteOf } from "./judge.js";

describe("claim verdicts (PRD 6.13 step 5, AC-13.4)", () => {
  const s = (domain: string, published: string | null = null) => ({ domain, stance: "support" as const, published });
  it("two independent sites → confirmed; two pages of one site → single", () => {
    expect(claimVerdict([s("rfc-editor.org"), s("datatracker.ietf.org")])).toBe("confirmed");
    expect(claimVerdict([s("docs.python.org"), s("python.org")])).toBe("single");
    expect(claimVerdict([s("a.bbc.co.uk"), s("bbc.co.uk")])).toBe("single");
  });
  it("support and refute → conflict; nothing → unchecked", () => {
    expect(claimVerdict([s("a.org"), s("b.org"), { domain: "c.org", stance: "refute", published: null }])).toBe("conflict");
    expect(claimVerdict([])).toBe("unchecked");
  });
  it("the claim is as old as its oldest supporting source", () => {
    expect(claimAsOf([s("a.org", "2025-03-01"), s("b.org", "2024-01-10"), s("c.org", null)])).toBe("2024-01-10");
    expect(claimAsOf([s("a.org")])).toBeNull();
  });
  it("site of a host", () => {
    expect(siteOf("www.docs.python.org")).toBe("python.org");
    expect(siteOf("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(siteOf("localhost")).toBe("localhost");
  });
});

describe("the synthesis linter (PRD 6.13 step 6)", () => {
  it("drops citations of unknown sources and lists them", () => {
    const r = lintSynthesis("JCS sorts keys by UTF-16 code units as RFC 8785 says [1, 7].", new Set([1, 2]));
    expect(r.text).toBe("JCS sorts keys by UTF-16 code units as RFC 8785 says [1].");
    expect(r.unknown_refs).toEqual([7]);
    expect(r.uncited).toEqual([]);
  });
  it("a long factual sentence without a citation is listed; headings, questions and short lines are not", () => {
    const r = lintSynthesis("## Answer\nThe scheme was published as an informational RFC in June 2020.\nWhy does it matter?\nShort line.", new Set([1]));
    expect(r.uncited).toEqual(["The scheme was published as an informational RFC in June 2020."]);
  });
  it("a citation that names only unknown sources disappears with no dangling space", () => {
    expect(lintSynthesis("It is old [9].", new Set([1])).text).toBe("It is old.");
  });
});
